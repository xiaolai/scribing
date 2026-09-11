'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
  '.css': 'text/css',
  '.json': 'application/json',
};
const server = http.createServer((req, res) => {
  let file = path.resolve(
    root,
    '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname),
  );
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    // These gates rebuild dist/ and the demo between runs, so a cached response
    // would let the assertions below pass against superseded bytes.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } });
    const errors = [],
      external = [];
    await page.route('**/*', (r) => {
      if (new URL(r.request().url()).origin !== origin) {
        external.push(r.request().url());
        return r.abort();
      }
      return r.continue();
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(origin + '/demo/multilingual/');
    const ready = () =>
      page.waitForFunction(() =>
        document.getElementById('font-status').textContent.startsWith('Ready:'),
      );
    await ready();
    assert.equal(await page.locator('#mode').inputValue(), 'fonts');
    assert.equal(await page.locator('#font-script option').count(), 120);
    const first = await page.locator('#font-area path').first().getAttribute('d');
    await page.selectOption('#font-family', 'NotoSerif');
    await ready();
    assert.notEqual(
      await page.locator('#font-area path').first().getAttribute('d'),
      first,
    );
    await page.fill('#font-text', 'aא');
    assert.equal(await page.locator('#font-area path').count(), 0);
    await page.click('#font-form button');
    await page.waitForFunction(() =>
      document.getElementById('font-status').textContent.startsWith('Unable'),
    );
    assert(await page.locator('#font-trace').isDisabled());
    await page.fill('#font-text', 'ag');
    await page.click('#font-form button');
    await ready();
    await page.getByText('Use your own font', { exact: true }).click();
    await page.setInputFiles(
      '#font-file',
      path.join(root, 'fonts/assets/NotoSans-Regular.ttf'),
    );
    await ready();
    assert.match(
      await page.locator('#font-status').textContent(),
      /NotoSans-Regular.ttf/,
    );
    await page.click('#font-reset');
    await ready();
    for (const script of [
      'arabic',
      'devanagari',
      'korean',
      'chinese-simplified',
      'chinese-traditional',
      'japanese',
      'mongolian',
      'phags-pa',
    ]) {
      await page.selectOption('#font-script', script);
      await ready();
      assert((await page.locator('#font-area path').count()) > 0);
    }
    await page.selectOption('#font-script', 'english');
    await ready();
    await page.selectOption('#font-renderer', 'canvas');
    await ready();
    assert.equal(await page.locator('#font-area canvas').count(), 1);
    await page.click('#font-copy');
    assert.equal(
      await page.locator('#font-reference').getAttribute('aria-pressed'),
      'false',
    );
    await page.click('#font-reference');
    assert.equal(
      await page.locator('#font-reference').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('#font-area').scrollIntoViewIfNeeded();
    const area = await page.locator('#font-area').boundingBox();
    await page.mouse.move(area.x + 100, area.y + 100);
    await page.mouse.down();
    await page.mouse.move(area.x + 180, area.y + 200, { steps: 6 });
    await page.mouse.up();
    assert.match(await page.locator('#font-result').textContent(), /covered/);
    await page.click('#font-replay');
    await page.click('#font-clear');
    assert.equal(await page.locator('#font-result').textContent(), 'Ink cleared.');
    // Inject a deterministic outline to test real raster holes and outside ink in both renderers.
    const raster = await page.evaluate(async () => {
      const results = [];
      const shape = {
        schemaVersion: 1,
        text: 'o',
        font: { id: 'fixture', name: 'Fixture', sha256: 'a'.repeat(64) },
        script: 'Latn',
        language: 'en',
        direction: 'ltr',
        em: 1000,
        bounds: [0, 0, 1000, 1000],
        glyphs: [
          {
            id: 1,
            cluster: 0,
            path: 'M0 0H1000V1000H0Z M400 400V600H600V400Z',
            x: 0,
            y: 0,
            advanceX: 1000,
            advanceY: 0,
          },
        ],
      };
      for (const renderer of ['svg', 'canvas']) {
        const probe = document.createElement('div');
        document.body.append(probe);
        const pw = Scribing.createFontWriter(probe, {
          width: 300,
          height: 300,
          renderer,
        });
        const zero = {
          ...shape,
          glyphs: [{ ...shape.glyphs[0], path: 'M0 0H1000V1000H0Z M0 0V1000H1000V0Z' }],
        };
        let rejected = false;
        try {
          await pw.setShape(zero);
        } catch {
          rejected = true;
        }
        if (!rejected) throw Error('Canceled contours accepted');
        const bow = {
          ...shape,
          glyphs: [{ ...shape.glyphs[0], path: 'M0 0L1000 1000L0 1000L1000 0Z' }],
        };
        await pw.setShape(bow);
        pw.destroy();
        probe.remove();
        const host = document.createElement('div');
        document.body.append(host);
        const w = Scribing.createFontWriter(host, {
          width: 300,
          height: 300,
          padding: 16,
          renderer,
        });
        await w.setShape(shape);
        w.startTrace();
        const surface = host.firstElementChild;
        const dot = (x, y) => {
          const r = surface.getBoundingClientRect();
          surface.dispatchEvent(
            new PointerEvent('pointerdown', {
              pointerId: 4,
              button: 0,
              isPrimary: true,
              clientX: r.left + x,
              clientY: r.top + y,
              bubbles: true,
            }),
          );
          window.dispatchEvent(
            new PointerEvent('pointerup', {
              pointerId: 4,
              button: 0,
              isPrimary: true,
              clientX: r.left + x,
              clientY: r.top + y,
              bubbles: true,
            }),
          );
        };
        dot(150, 150);
        const hole = w.check();
        w.clear();
        dot(55, 150);
        const inside = w.check();
        dot(900, 900);
        const outside = w.check();
        w.updateDimensions({ width: 350, height: 250 });
        const resized = w.check();
        if (renderer === 'svg') {
          w.clear();
          surface.style.width = '150px';
          surface.style.height = '300px';
          const expected = { x: 500, y: 900 };
          const screen = new DOMPoint(expected.x, expected.y).matrixTransform(
            surface.querySelector('path').getScreenCTM(),
          );
          surface.dispatchEvent(
            new PointerEvent('pointerdown', {
              pointerId: 5,
              button: 0,
              isPrimary: true,
              clientX: screen.x,
              clientY: screen.y,
              bubbles: true,
            }),
          );
          window.dispatchEvent(
            new PointerEvent('pointerup', {
              pointerId: 5,
              button: 0,
              isPrimary: true,
              clientX: screen.x,
              clientY: screen.y,
              bubbles: true,
            }),
          );
          const stored = w.strokes[0][0];
          if (
            Math.abs(stored.x - expected.x) > 0.001 ||
            Math.abs(stored.y - expected.y) > 0.001
          )
            throw Error('SVG CSS letterbox pointer mapping');
        }
        const replay = w.replay();
        w.cancel();
        await replay;
        host.replaceChildren();
        w.destroy();
        host.remove();
        results.push({ renderer, hole, inside, outside, resized });
      }
      return results;
    });
    for (const r of raster) {
      assert.equal(r.hole.hasInput, true);
      assert.equal(r.hole.userAlignment, 0);
      assert(r.inside.userAlignment > 0.95);
      assert(r.outside.userAlignment < r.inside.userAlignment);
      assert.deepEqual(r.resized, r.outside);
    }
    // Independent FontTools expected outlines must match the rotated provider in actual rasterization.
    const verticalCases = await page.evaluate(async () => {
      const catalog = await fetch('/fonts/catalog.json').then((r) => r.json()),
        scriptRanges = await fetch('/fonts/script-ranges.json').then((r) => r.json());
      const { createFontProvider } = await import('/extras/fonts/provider.mjs');
      const p = createFontProvider({
        catalog,
        scriptRanges,
        baseUrl: location.origin + '/',
      });
      const fixtures = await fetch('/scripts/fonts/fixtures/vertical-outlines.json').then(
        (r) => r.json(),
      );
      let tested = 0;
      try {
        for (const f of fixtures.cases) {
          const shaped = await p.shape({
            scriptId: f.scriptId,
            fontId: f.fontId,
            text: f.text,
          });
          for (const size of [320, 960])
            for (const ratio of [1, 2]) {
              const paint = (glyphs) => {
                const canvas = document.createElement('canvas');
                canvas.width = size * ratio;
                canvas.height = size * ratio;
                const ctx = canvas.getContext('2d');
                const [x, y, w, h] = f.fontToolsInkBounds,
                  scale = ((size - 32) * ratio) / Math.max(w, h);
                ctx.translate(
                  (size * ratio - w * scale) / 2 - x * scale,
                  (size * ratio - h * scale) / 2 + (y + h) * scale,
                );
                ctx.scale(scale, -scale);
                for (const g of glyphs) {
                  ctx.save();
                  ctx.translate(g.x, g.y);
                  ctx.fill(new Path2D(g.path), 'nonzero');
                  ctx.restore();
                }
                return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
              };
              const actual = paint(shaped.glyphs),
                expected = paint(f.fontToolsExpectedGlyphs);
              if (actual.some((v, i) => v !== expected[i]))
                throw Error('Vertical independent raster mismatch ' + f.text);
              tested++;
            }
        }
      } finally {
        p.destroy();
      }
      return tested;
    });
    assert.equal(verticalCases, 28);
    // Slow old font requests cannot restore a superseded target or status.
    await page.reload();
    await ready();
    let release, intercepted;
    const gate = new Promise((r) => (release = r)),
      seen = new Promise((r) => (intercepted = r));
    await page.route('**/NotoSerif-Regular.ttf', async (route) => {
      intercepted();
      await gate;
      await route.continue().catch(() => {});
    });
    await page.selectOption('#font-family', 'NotoSerif');
    await seen;
    await page.selectOption('#font-script', 'greek');
    release();
    await ready();
    assert.match(await page.locator('#font-status').textContent(), /Greek/);
    await page.unroute('**/NotoSerif-Regular.ttf');
    await page.selectOption('#mode', 'ordered');
    await page
      .frameLocator('#ordered-frame')
      .locator('#status')
      .filter({ hasText: 'Ready:' })
      .waitFor();
    await page.selectOption('#mode', 'fonts');
    await ready();
    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForTimeout(100);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      'Font browser gate passed: default fonts, real outline switching, local custom fonts, script matrix, SVG/Canvas, hole/excess-ink raster, resize/replay/teardown, recoverable errors, preserved ordered view, mobile width and local-only requests.',
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
