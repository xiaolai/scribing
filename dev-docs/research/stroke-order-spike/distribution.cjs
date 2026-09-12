'use strict';
/**
 * The same traversal spike, over the CJK inventories.
 *
 * Chinese units are raw median arrays and Japanese units are motor records, so both are
 * turned into model strokes through `motorRecordFor`, the function the runtime loader
 * itself uses. Korean is composed: the model is 40 isolated jamo, so a syllable is
 * decomposed and each jamo ordered inside its own region.
 *
 * Usage: node dev-docs/research/stroke-order-spike/cjk.cjs <script> [limit] [prune]
 *   script: chinese-simplified | chinese-traditional | japanese | korean
 */
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const SCRIPT = process.argv[2] || 'japanese';
const LIMIT = Number(process.argv[3] || 40);
const PRUNE = Number(process.argv[4] || 0.15);
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
};
const server = http.createServer((req, res) => {
  let f = path.resolve(root, '.' + new URL(req.url, 'http://l').pathname);
  if (!f.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    res.setHeader('Cache-Control', 'no-store');
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
    const page = await browser.newPage();
    page.setDefaultTimeout(0);
    page.on('pageerror', (e) => console.error('PAGEERR', e.message));
    await page.goto(origin + '/demo/multilingual/');
    const out = await page.evaluate(
      async ({ origin, SCRIPT, LIMIT, PRUNE }) => {
        const { createFontProvider } = await import('/extras/fonts/provider.mjs');
        const { thinInk, graphTrails, assignOwnership, dilateCoverage } =
          await import('/extras/fonts/skeleton.mjs');
        const { motorRecordFor, decomposeHangul, hangulRegions } =
          await import('/extras/fonts/animation.mjs');
        const { orderByModel } =
          await import('/dev-docs/research/stroke-order-spike/traversal.mjs');
        const base = await (await fetch('/fonts/catalog.json')).json();
        const ranges = await (await fetch('/fonts/script-ranges.json')).json();
        const script = base.scripts.find((s) => s.id === SCRIPT);
        const group = script.strokeOrderGroup;
        const motor = await (await fetch(`/fonts/motor/${group}.json`)).json();
        const provider = createFontProvider({
          catalog: base,
          scriptRanges: ranges,
          baseUrl: origin + '/',
        });
        const fontId = script.fontIds[0];
        const PX = 256;

        const rasterize = (shape) => {
          const [bx, by, bw, bh] = shape.bounds;
          const scale = Math.min(PX / bw, PX / bh) * 0.88;
          const c = new OffscreenCanvas(PX, PX),
            ctx = c.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.translate(
            (PX - bw * scale) / 2 - bx * scale,
            (PX - bh * scale) / 2 + (by + bh) * scale,
          );
          ctx.scale(scale, -scale);
          for (const g of shape.glyphs) {
            ctx.save();
            ctx.translate(g.x, g.y);
            ctx.fill(new Path2D(g.path), 'nonzero');
            ctx.restore();
          }
          const d = ctx.getImageData(0, 0, PX, PX).data,
            ink = new Uint8Array(PX * PX);
          for (let i = 0; i < ink.length; i++) ink[i] = d[4 * i + 3] > 0 ? 1 : 0;
          return ink;
        };
        const modelOf = (text) => {
          const outcome = motorRecordFor(group, text, motor.units[text]);
          if (!outcome.record) return null;
          const u = outcome.record.unit;
          const plan = u.plans.find((p) => p.id === u.defaultPlanId) || u.plans[0];
          return {
            strokes: plan.steps.map((s) => {
              const st = u.motorStrokes.find((x) => x.id === s.strokeId);
              return { points: st.kind === 'dot' ? [st.center, st.center] : st.points };
            }),
            yDown: u.coordinates.yAxis === 'down',
          };
        };

        // Korean: the inventory is jamo, so exercise the syllables the app composes.
        let texts;
        if (group === 'korean') {
          // Every modern precomposed syllable, U+AC00 to U+D7A3. The traversal walks the
          // whole syllable's skeleton, so the wrapping-vowel limit that constrains the
          // app's per-region fitting does not apply here.
          texts = [];
          for (let cp = 0xac00; cp <= 0xd7a3; cp++) {
            const ch = String.fromCodePoint(cp);
            if (decomposeHangul(ch)) texts.push(ch);
          }
        } else {
          texts = Object.keys(motor.units);
        }
        const step = Math.max(1, Math.floor(texts.length / LIMIT));
        const sample = texts.filter((_, i) => i % step === 0).slice(0, LIMIT);

        const perGlyph = [];
        let n = 0,
          inkSum = 0,
          ownedSum = 0,
          jumpBad = 0,
          walkSum = 0,
          floorSum = 0,
          modelSum = 0,
          startSum = 0,
          startN = 0,
          skipped = 0,
          fullyOwned = 0,
          declined = 0;
        const t0 = performance.now();
        for (const ch of sample) {
          try {
            const parts = group === 'korean' ? decomposeHangul(ch).letters : [ch];
            const models = parts.map(modelOf);
            if (models.some((m) => !m)) {
              skipped++;
              continue;
            }
            const shape = await provider.shape({ scriptId: SCRIPT, text: ch, fontId });
            const ink = rasterize(shape);
            const skeleton = await thinInk(ink, PX, PX);
            const trails = graphTrails(skeleton, PX, PX);
            if (!trails.length) {
              skipped++;
              continue;
            }
            let l = PX,
              t = PX,
              r = 0,
              b = 0;
            for (let i = 0; i < ink.length; i++)
              if (ink[i]) {
                l = Math.min(l, i % PX);
                r = Math.max(r, i % PX);
                t = Math.min(t, Math.floor(i / PX));
                b = Math.max(b, Math.floor(i / PX));
              }
            let res, flat;
            if (group === 'korean') {
              // Each jamo model fills its own em box, so concatenating them would map every
              // jamo onto the whole syllable. Split the syllable the way the runtime does
              // and order each jamo inside its own region.
              const cut = (axis, lo, hi, otherLo, otherHi) => {
                let best = -1,
                  score = Infinity;
                for (let k = Math.round(lo); k <= Math.round(hi); k++) {
                  let sum = 0;
                  for (let q = Math.round(otherLo); q <= Math.round(otherHi); q++)
                    sum += axis === 'x' ? ink[q * PX + k] : ink[k * PX + q];
                  const v = sum + Math.abs(k - (lo + hi) / 2) * 0.001;
                  if (v < score) {
                    best = k;
                    score = v;
                  }
                }
                return best;
              };
              const d = decomposeHangul(ch);
              const regions = hangulRegions({
                vowel: d.vowel,
                finals: d.finals,
                ink,
                width: PX,
                box: [l, t, r, b],
                cut,
              });
              flat = models.flatMap((m) => m.strokes);
              if (!regions || regions.length !== parts.length) {
                // A wrapping vowel cannot be separated by rectangles, so the runtime
                // declines it. Ordering still has to produce something, so fall back to
                // traversing the whole syllable: worse ordering, complete coverage.
                declined++;
                res = orderByModel(trails, flat, [l, t, r, b], models[0].yDown, PRUNE);
              } else {
                // Every trail belongs to exactly one region, chosen by where its midpoint
                // lands. Requiring a trail to lie wholly inside dropped the ones crossing a
                // cut, and their ink then had no stroke to be owned by.
                const buckets = regions.map(() => []);
                for (const tr of trails) {
                  const mid = tr[Math.floor(tr.length / 2)];
                  let bi = 0,
                    bd = Infinity;
                  regions.forEach((bx, i) => {
                    const cx = (bx[0] + bx[2]) / 2,
                      cy = (bx[1] + bx[3]) / 2;
                    const inside =
                      mid[0] >= bx[0] &&
                      mid[0] <= bx[2] &&
                      mid[1] >= bx[1] &&
                      mid[1] <= bx[3];
                    const d = (inside ? 0 : 1e6) + Math.hypot(mid[0] - cx, mid[1] - cy);
                    if (d < bd) {
                      bd = d;
                      bi = i;
                    }
                  });
                  buckets[bi].push(tr);
                }
                const strokes = [];
                let covered = 0,
                  total = 0,
                  floor = 0;
                const starts = [];
                buckets.forEach((inside, i) => {
                  total += inside.length;
                  if (!inside.length) return;
                  const sub = orderByModel(
                    inside,
                    models[i].strokes,
                    regions[i],
                    models[i].yDown,
                    PRUNE,
                  );
                  strokes.push(...sub.strokes);
                  covered += sub.covered;
                  floor += sub.floor;
                  starts.push(...sub.starts);
                });
                res = { strokes, covered, total, floor, starts };
              }
            } else {
              flat = models[0].strokes;
              res = orderByModel(trails, flat, [l, t, r, b], models[0].yDown, PRUNE);
            }
            if (!res.strokes.length) {
              skipped++;
              continue;
            }
            n++;
            walkSum += res.strokes.length;
            floorSum += res.floor;
            modelSum += flat.length;
            for (const s of res.starts) {
              startSum += s;
              startN++;
            }
            const span = Math.max(r - l, b - t, 1);
            let worst = 0;
            for (const st of res.strokes)
              for (let i = 1; i < st.length; i++)
                worst = Math.max(
                  worst,
                  Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]) / span,
                );
            if (worst > 0.15) jumpBad++;
            const cov = dilateCoverage(ink, PX, PX);
            const assign = await assignOwnership(cov, skeleton, res.strokes, PX, PX, 0);
            let cells = 0,
              owned = 0;
            for (let i = 0; i < ink.length; i++)
              if (ink[i]) {
                cells++;
                if (assign.owners[i]) owned++;
              }
            inkSum += cells;
            ownedSum += owned;
            if (owned === cells) fullyOwned++;
            perGlyph.push({
              ch,
              pct: cells ? owned / cells : 1,
              strokes: res.strokes.length,
            });
          } catch (e) {
            skipped++;
          }
        }
        return {
          script: SCRIPT,
          group,
          fontId,
          n,
          skipped,
          declined,
          jumpBad,
          walkSum,
          floorSum,
          modelSum,
          fullyOwned,
          inkPct: inkSum ? (ownedSum / inkSum) * 100 : 0,
          meanStart: startN ? startSum / startN : 0,
          msPer: (performance.now() - t0) / Math.max(n, 1),
          worst: perGlyph.sort((a, b) => a.pct - b.pct).slice(0, 12),
          buckets: [0.5, 0.8, 0.9, 0.95, 0.99, 1].map((th, i, a) => ({
            under: th,
            n: perGlyph.filter((g) => g.pct < th && (i === 0 || g.pct >= a[i - 1]))
              .length,
          })),
        };
      },
      { origin, SCRIPT, LIMIT, PRUNE },
    );
    console.log(JSON.stringify(out));
  } finally {
    try {
      if (browser) await browser.close();
    } finally {
      await new Promise((r) => server.close(r));
    }
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
