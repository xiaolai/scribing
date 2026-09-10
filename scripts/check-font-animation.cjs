'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'),
  mime = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
    '.json': 'application/json',
    '.css': 'text/css',
  };
const server = http.createServer((req, res) => {
  let f = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!f.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream');
    res.end(fs.readFileSync(f));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage(),
      errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (r) =>
      new URL(r.request().url()).origin === origin ? r.continue() : r.abort(),
    );
    let releaseSource;
    const sourceGate = new Promise((r) => (releaseSource = r));
    await page.route('**/fonts/motor/english.json', async (route) => {
      await sourceGate;
      await route.continue();
    });
    await page.goto(origin + '/demo/multilingual/');
    await page.waitForFunction(() =>
      document.querySelector('#font-status').textContent.startsWith('Ready:'),
    );
    await page.locator('#font-area').scrollIntoViewIfNeeded();
    const area = await page.locator('#font-area').boundingBox();
    await page.mouse.move(area.x + 100, area.y + 100);
    await page.mouse.down();
    releaseSource();
    await page.waitForTimeout(150);
    await page.mouse.move(area.x + 120, area.y + 150, { steps: 3 });
    await page.mouse.up();
    assert.match(await page.locator('#font-result').textContent(), /covered/);
    await page.unroute('**/fonts/motor/english.json');
    await page.waitForFunction(() =>
      document.querySelector('#font-animation-note').textContent.includes('3 strokes'),
    );
    await page.click('#font-animate');
    await page.waitForTimeout(180);
    assert.equal(await page.locator('#font-area mask').count(), 1);
    await page.click('#font-stop');
    assert.equal(await page.locator('#font-area mask').count(), 0);
    await page.selectOption('#font-family', 'NotoSerif');
    await page.waitForFunction(() =>
      document.querySelector('#font-animation-note').textContent.includes('3 strokes'),
    );
    await page.click('#font-animate');
    await page.selectOption('#font-script', 'japanese');
    await page.waitForFunction(() =>
      document.querySelector('#font-status').textContent.startsWith('Ready:'),
    );
    // A second Animate request supersedes an attachment already yielding across tiles.
    await page.selectOption('#font-script', 'english');
    await page.fill('#font-text', 'A'.repeat(32));
    await page.click('#font-form button');
    await page.waitForFunction(() =>
      document.querySelector('#font-animation-note').textContent.includes('96 strokes'),
    );
    await page.evaluate(() => {
      const host = document.createElement('div'),
        w = Scribing.createFontWriter(host, {
          width: 32,
          height: 32,
          padding: 0,
          renderer: 'svg',
        }),
        proto = Object.getPrototypeOf(w);
      w.destroy();
      window.originalFontAttach = proto.setAnimation;
      proto.setAnimation = function (value) {
        window.fontAttachPending = true;
        return window.originalFontAttach
          .call(this, value)
          .finally(() => (window.fontAttachPending = false));
      };
      window.fontWriterPrototype = proto;
    });
    await page.click('#font-animate');
    await page.waitForFunction(() => window.fontAttachPending);
    await page.evaluate(() => document.querySelector('#font-animate').click());
    await page.waitForFunction(
      () => document.querySelectorAll('#font-area mask').length === 32,
    );
    assert.doesNotMatch(await page.locator('#font-result').textContent(), /superseded/);
    await page.click('#font-stop');
    await page.evaluate(() => {
      window.fontWriterPrototype.setAnimation = window.originalFontAttach;
    });
    const results = await page.evaluate(async () => {
      const { createFontProvider } = await import('/extras/fonts/provider.mjs'),
        { prepareFontAnimation } = await import('/extras/fonts/animation.mjs');
      const catalog = await fetch('/fonts/catalog.json').then((r) => r.json()),
        scriptRanges = await fetch('/fonts/script-ranges.json').then((r) => r.json()),
        p = createFontProvider({ catalog, scriptRanges, baseUrl: location.origin + '/' });
      const host = document.createElement('div');
      document.body.append(host);
      const writer = Scribing.createFontWriter(host, {
        width: 320,
        height: 320,
        renderer: 'canvas',
        referenceColor: 'transparent',
        animationColor: '#000',
      });
      const check = (v, message) => {
          if (!v) throw Error(message);
        },
        prepared = [];
      try {
        // Every catalog entry must retain Animate, including scripts with no supplied source plans.
        for (const script of catalog.scripts) {
          const fontId = script.fontIds[0],
            text = script.examples[0].text;
          await writer.setShape(await p.shape({ fontId, scriptId: script.id, text }));
          let plan;
          try {
            plan = await prepareFontAnimation(writer.getShape(), { sourceLoader: null });
            await writer.setAnimation(plan);
          } catch (cause) {
            throw new Error(
              script.id + '/' + fontId + '/' + text + ': ' + cause.message,
              { cause },
            );
          }
          check(plan.strokes.length > 0, script.id);
          check(
            plan.tiles.reduce((s, t) => s + t.width * t.height, 0) <= 2097152,
            'cell budget',
          );
          prepared.push(script.id);
        }
        for (const [scriptId, fontId, text] of [
          ['arabic', 'NotoSansArabic', 'ظ'],
          ['jawi', 'NotoSansArabic', 'ٽ'],
          ['jawi', 'NotoSansArabic', 'ڝ'],
          ['jawi', 'NotoSansArabic', 'ۑ'],
          ['korean', 'NotoSansCJKkr', 'ㅊ'],
          ['korean', 'NotoSansCJKkr', 'ㅎ'],
        ]) {
          await writer.setShape(await p.shape({ scriptId, fontId, text }));
          const plan = await prepareFontAnimation(writer.getShape());
          await writer.setAnimation(plan);
          check(plan.strokes.length > 0, 'compact mark ' + text);
        }
        const koreanSources = (
          await fetch('/fonts/motor/korean.json').then((r) => r.json())
        ).units;
        for (const [fontId, text, provenance, count] of [
          ['NotoSansCJKkr', '가', 'mixed', 3],
          ['NotoSansCJKkr', '한', 'mixed', 8],
          ['NotoSansCJKkr', '글', 'mixed', 7],
          ['NotoSerifCJKkr', '가', 'generated', 4],
          ['NotoSerifCJKkr', '한', 'mixed', 6],
          ['NotoSerifCJKkr', '글', 'source-adapted', 5],
        ]) {
          await writer.setShape(await p.shape({ scriptId: 'korean', fontId, text }));
          const plan = await prepareFontAnimation(writer.getShape());
          await writer.setAnimation(plan);
          check(
            plan.provenance === provenance && plan.strokes.length === count,
            'Korean component fallback ' + fontId + text,
          );
          for (const unitId of new Set(
            plan.strokes.filter((s) => s.source).map((s) => s.source.unitId),
          )) {
            const unit = koreanSources[unitId].unit,
              expected = unit.plans
                .find((candidate) => candidate.id === unit.defaultPlanId)
                .steps.map((step) => step.strokeId),
              actual = plan.strokes
                .filter((s) => s.source?.unitId === unitId)
                .map((s) => s.source.strokeId);
            check(
              JSON.stringify(actual) === JSON.stringify(expected),
              'partial Korean source plan ' + unitId,
            );
          }
        }
        const ownerAt = (plan, x, y) => {
          const t = plan.tiles[0],
            col = Math.floor(((x - t.bounds[0]) * t.width) / t.bounds[2]),
            row = Math.floor(((t.bounds[1] + t.bounds[3] - y) * t.height) / t.bounds[3]);
          return t.owners[row * t.width + col];
        };
        for (const fontId of ['NotoSans', 'NotoSerif']) {
          await writer.setShape(
            await p.shape({ fontId, scriptId: 'english', text: 'A' }),
          );
          const a = await prepareFontAnimation(writer.getShape());
          check(
            a.provenance === 'source-adapted' && a.strokes.length === 3,
            'A source three ' + fontId,
          );
          for (const s of a.strokes.slice(0, 2))
            check(s.points[0][1] > s.points[s.points.length - 1][1], 'A apex-down');
          check(a.strokes[2].points[0][0] < a.strokes[2].points.at(-1)[0], 'A crossbar');
          // Interior probes derive from the actual straight leg/bar outlines, away from AA edges.
          // At the first/second completed stroke, the crossed leg must have no future-owned bite.
          // These exact interior cells formed a visible early spur down the other leg.
          if (fontId === 'NotoSans')
            for (const y of [587.890625, 599.609375, 611.328125])
              check(
                ownerAt(a, 353.515625, y) === 2,
                'A shared apex waits for second leg ' + y,
              );
          const legs =
            fontId === 'NotoSans'
              ? [
                  [160, 170, 180],
                  [460, 470, 480],
                ]
              : [
                  [185, 190, 198],
                  [470, 480, 490],
                ];
          for (const y of [245, 260, 275]) {
            for (let side = 0; side < 2; side++)
              for (const x of legs[side])
                check(
                  ownerAt(a, x, y) === side + 1,
                  'A completed leg interior ' + fontId + '/' + x + '/' + y,
                );
            for (const x of [260, 320, 400])
              check(ownerAt(a, x, y) === 3, 'A future crossbar core ' + fontId);
          }
          for (const text of fontId === 'NotoSans' ? ['F', 'T'] : []) {
            await writer.setShape(await p.shape({ fontId, scriptId: 'english', text }));
            const plan = await prepareFontAnimation(writer.getShape());
            check(
              plan.provenance === 'source-adapted' &&
                plan.strokes.length === (text === 'F' ? 3 : 2),
              'F/T source convention ' + fontId + text,
            );
            for (let index = 0; index < plan.strokes.length; index++)
              for (const fraction of [0.6, 0.75]) {
                const points = plan.strokes[index].points,
                  point = points[Math.floor((points.length - 1) * fraction)];
                check(
                  ownerAt(plan, ...point) === index + 1,
                  'F/T future core ' + fontId + text + '/' + index,
                );
              }
          }
        }
        for (const fontId of ['NotoSans', 'NotoSerif']) {
          await writer.setShape(
            await p.shape({ fontId, scriptId: 'english', text: 'E' }),
          );
          const plan = await prepareFontAnimation(writer.getShape());
          check(
            plan.provenance === 'source-adapted' && plan.strokes.length === 4,
            'E four source strokes',
          );
          const t = plan.tiles[0];
          if (fontId === 'NotoSans') {
            for (const x of [102, 120, 150, 180])
              for (const y of [10, 60, 150, 360, 500, 680, 705])
                check(ownerAt(plan, x, y) === 1, 'E shaft interior');
            for (let row = 0; row < t.height; row++)
              for (let col = 0; col < t.width; col++) {
                const x = t.bounds[0] + ((col + 0.5) * t.bounds[2]) / t.width,
                  y = t.bounds[1] + t.bounds[3] - ((row + 0.5) * t.bounds[3]) / t.height;
                if (
                  x > 187 + t.bounds[2] / t.width &&
                  x < 496 &&
                  ((y > 0 && y < 79) || (y > 334 && y < 412) || (y > 635 && y < 714))
                )
                  check(t.owners[row * t.width + col] !== 1, 'E completed shaft spur');
              }
          } else {
            for (let row = 0; row < t.height; row++) {
              const y =
                t.bounds[1] + t.bounds[3] - ((row + 0.5) * t.bounds[3]) / t.height;
              if (!((y > 2 && y < 40) || (y > 674 && y < 712))) continue;
              const labels = [];
              for (let col = 0; col < t.width; col++) {
                const x = t.bounds[0] + ((col + 0.5) * t.bounds[2]) / t.width,
                  owner = t.owners[row * t.width + col];
                if (x >= 40 && x <= 530 && labels.at(-1) !== owner) labels.push(owner);
              }
              check(
                labels.length === 2 && labels[0] === 1,
                'Serif E shared terminal hatch',
              );
            }
          }
          for (const [x, y, owner] of [
            [300, 690, 2],
            [300, 370, 3],
            [300, 30, 4],
          ])
            check(ownerAt(plan, x, y) === owner, 'E future bar core');
        }
        for (const [fontId, text] of [
          ['NotoSans', 'J'],
          ['NotoSans', 'a'],
          ['NotoSerif', 'a'],
          ['NotoSerif', 'g'],
        ]) {
          await writer.setShape(await p.shape({ fontId, scriptId: 'english', text }));
          const a = await prepareFontAnimation(writer.getShape());
          check(
            a.provenance === 'generated',
            'incompatible source convention ' + fontId + text,
          );
        }
        await writer.setShape(
          await p.shape({ fontId: 'NotoSansSymbols2', scriptId: 'braille', text: '⠿' }),
        );
        const dots = await prepareFontAnimation(writer.getShape(), {
          sourceLoader: null,
        });
        check(
          dots.strokes.length === 6 && dots.strokes.every((s) => s.kind === 'dot'),
          'Braille six radial dots',
        );
        const times = Array.from(dots.tiles[0].progress).filter(
          (_, i) => dots.tiles[0].owners[i] === 1,
        );
        check(
          times.some((t) => t > 10000 && t < 55000) && Math.max(...times) === 65535,
          'dot radial growth',
        );
        // Attachment is transactional, immutable, and cannot execute caller descriptor hooks.
        await writer.setAnimation(dots);
        const original = writer.animation.tiles[0].owners.slice();
        dots.tiles[0].owners.fill(0);
        check(
          writer.animation.tiles[0].owners.every((v, i) => v === original[i]),
          'typed-array snapshot',
        );
        let calls = 0;
        const invalid = {
          ...writer.animation,
          tiles: writer.animation.tiles.map((t) => ({
            ...t,
            owners: new Uint16Array(t.owners),
            progress: new Uint16Array(t.progress),
          })),
        };
        Object.defineProperty(invalid.tiles[0].owners, 'length', {
          get() {
            calls++;
            return original.length;
          },
        });
        const playing = writer.animate({ speed: 4, loop: true });
        let rejected = false;
        try {
          await writer.setAnimation(invalid);
        } catch {
          rejected = true;
        }
        check(
          rejected && calls === 0 && writer.animationState,
          'descriptor hook or canceled valid playback',
        );
        writer.cancel();
        await playing;
        // A real macrotask can abort large preparations, and stale attachment never commits.
        const abort = new AbortController();
        setTimeout(() => abort.abort(), 0);
        let canceled = false;
        try {
          await prepareFontAnimation(writer.getShape(), {
            sourceLoader: null,
            signal: abort.signal,
          });
        } catch (e) {
          canceled = e.name === 'AbortError';
        }
        check(canceled, 'preparation cancellation');
        const replacement = writer.setAnimation(writer.animation);
        await writer.setShape(
          await p.shape({ fontId: 'NotoSans', scriptId: 'english', text: 'B' }),
        );
        await replacement.then(
          () => {
            throw Error('stale animation accepted');
          },
          () => {},
        );
        for (const scriptId of ['english', 'chinese-simplified', 'arabic', 'japanese']) {
          const script = catalog.scripts.find((s) => s.id === scriptId),
            text = [
              ...new Set([
                ...script.inventory.flatMap((t) => Array.from(t)),
                ...(scriptId === 'chinese-simplified' ? ['好'] : []),
                ...(scriptId === 'korean' ? ['한', '글', '고', '갃'] : []),
              ]),
            ]
              .slice(0, 32)
              .join('');
          check(Array.from(text).length === 32, 'distinct benchmark inventory');
          await writer.setShape(
            await p.shape({ scriptId, fontId: script.fontIds[0], text }),
          );
          const start = performance.now();
          const plan = await prepareFontAnimation(writer.getShape(), {
            sourceLoader: null,
          });
          check(
            performance.now() - start < 4000,
            'distinct-character preparation regression ' + scriptId,
          );
          await writer.setAnimation(plan);
        }
        const sourcedTimings = [];
        // Korean joins the list so a coverage regression shows in one line of output.
        // Its jamo are fitted per region rather than looked up whole, so its sourced
        // path count is the signal that the Hangul decomposition still works.
        for (const scriptId of ['english', 'chinese-simplified', 'korean']) {
          const script = catalog.scripts.find((s) => s.id === scriptId),
            text = [
              ...new Set([
                ...script.inventory.flatMap((t) => Array.from(t)),
                ...(scriptId === 'chinese-simplified' ? ['好'] : []),
              ]),
            ]
              .slice(0, 32)
              .join('');
          await writer.setShape(
            await p.shape({ scriptId, fontId: script.fontIds[0], text }),
          );
          const start = performance.now(),
            plan = await prepareFontAnimation(writer.getShape()),
            ms = performance.now() - start;
          check(
            plan.strokes.some((s) => s.source),
            'sourced benchmark must exercise registration',
          );
          check(ms < 4000, 'sourced junction preparation regression ' + scriptId);
          sourcedTimings.push({
            scriptId,
            scalars: Array.from(text).length,
            ms: Math.round(ms),
            sourcePaths: plan.strokes.filter((s) => s.source).length,
            totalPaths: plan.strokes.length,
          });
        }
        const metrics = [];
        for (const n of [1, 4, 8, 16, 32]) {
          const glyphs = Array.from({ length: n }, (_, i) => ({
            id: 1,
            cluster: i,
            path: 'M0 0H800V1000H0Z',
            x: i * 1000,
            y: 0,
            advanceX: 1000,
            advanceY: 0,
          }));
          await writer.setShape({
            schemaVersion: 1,
            text: 'a'.repeat(n),
            font: { id: 'fixture', name: 'fixture', sha256: 'a'.repeat(64) },
            script: 'Latn',
            language: 'en',
            direction: 'ltr',
            em: 1000,
            bounds: [0, 0, n * 1000, 1000],
            glyphs,
          });
          writer.strokes = [];
          for (let i = 0; i < n; i++)
            for (let row = 0; row < 32; row++)
              writer.strokes.push(
                Array.from({ length: 64 }, (_, j) => ({
                  x: i * 1000 + 100 + j * 10,
                  y: 100 + row * 25,
                })),
              );
          const start = performance.now(),
            comparison = writer.check();
          metrics.push(comparison.targetCoverage);
          check(performance.now() - start < 100, 'bounded worst-case comparison');
          check(comparison.userAlignment > 0.99, 'inside alignment');
        }
        check(
          Math.max(...metrics) - Math.min(...metrics) < 0.03,
          'comparison resolution must track em across long runs: ' + metrics,
        );
        return { scripts: prepared.length, sourcedTimings };
      } finally {
        writer.destroy();
        host.remove();
        p.destroy();
      }
    });
    assert.equal(results.scripts, 120);
    console.log(
      '32 distinct sourced preparations:',
      JSON.stringify(results.sourcedTimings),
    );
    // Inspect the last MASKED frame, before any finished-frame optimization, in a real browser.
    for (const ratio of [1, 2, 3]) {
      const context = await browser.newContext({ deviceScaleFactor: ratio }),
        p = await context.newPage();
      await p.goto(origin + '/demo/multilingual/');
      await p.waitForFunction(() => typeof Scribing !== 'undefined');
      const contourCount = await p.evaluate(async () => {
        const { prepareFontAnimation } = await import('/extras/fonts/animation.mjs');
        let count = 0;
        const outlines = [
          'M0 0H1000V1000H0Z M400 400V600H600V400Z',
          'M0 0H1000V1000H0Z M500 1200h.1v.1h-.1z',
          'M0 0H1000V1000H0Z M500 1200L600 1300L600.01 1300L500.01 1200Z',
        ];
        for (const size of [320, 960])
          for (const renderer of ['canvas', 'svg'])
            for (const outline of outlines) {
              const host = document.createElement('div');
              document.body.append(host);
              const w = Scribing.createFontWriter(host, {
                width: size,
                height: size,
                renderer,
                referenceColor: 'transparent',
                animationColor: '#000',
              });
              await w.setShape({
                schemaVersion: 1,
                text: 'a',
                font: { id: 'fixture', name: 'fixture', sha256: 'a'.repeat(64) },
                script: 'Latn',
                language: 'en',
                direction: 'ltr',
                em: 1000,
                bounds: [0, 0, 1001, 1301],
                glyphs: [
                  {
                    id: 1,
                    cluster: 0,
                    path: outline,
                    x: 0,
                    y: 0,
                    advanceX: 1000,
                    advanceY: 0,
                  },
                ],
              });
              const plan = await prepareFontAnimation(w.getShape(), {
                sourceLoader: null,
              });
              await w.setAnimation(plan);
              w.hideReference();
              w.animationState = { stroke: plan.strokes.length - 1, progress: 1 };
              w.render();
              const pixels = async () => {
                if (renderer === 'canvas')
                  return host.firstChild
                    .getContext('2d')
                    .getImageData(0, 0, host.firstChild.width, host.firstChild.height)
                    .data;
                const c = document.createElement('canvas');
                c.width = size * devicePixelRatio;
                c.height = size * devicePixelRatio;
                const ctx = c.getContext('2d'),
                  image = new Image();
                image.src =
                  'data:image/svg+xml;base64,' +
                  btoa(new XMLSerializer().serializeToString(host.firstChild));
                await image.decode();
                ctx.drawImage(image, 0, 0, c.width, c.height);
                return ctx.getImageData(0, 0, c.width, c.height).data;
              };
              const masked = await pixels();
              w.cancel();
              w.options.referenceColor = '#000';
              w.showReference();
              const reference = await pixels();
              let missing = 0,
                diff = 0,
                ink = 0;
              for (let i = 3; i < reference.length; i += 4) {
                if (reference[i] > 16 && masked[i] < reference[i] - 8) missing++;
                if (reference[i]) ink++;
                diff += Math.abs(reference[i] - masked[i]);
              }
              if (missing > 2 || diff > Math.max(ink * 2, 64))
                throw Error(
                  `Last masked frame differs: ${renderer}/${size}/${devicePixelRatio}: missing ${missing}, alpha delta ${diff}`,
                );
              if (outline.includes('1200') && plan.strokes.length < 2)
                throw Error('Detached component lost');
              w.destroy();
              host.remove();
              count++;
            }
        return count;
      });
      assert.equal(contourCount, 12);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(
      'Font animation browser gate passed: 120 scripts, real main Animate/Stop, both A conventions, truthful allograph fallback, Braille radial dots, immutable transactional descriptors, cancellation, and 36 final masked raster comparisons.',
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
