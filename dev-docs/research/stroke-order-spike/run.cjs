'use strict';
/**
 * Runs the spike against every candidate font through the real rasterizer and
 * skeletonizer, and reports the properties that decide whether the strategy works:
 * coverage, stroke-count agreement with the model, and how far each stroke begins
 * from where the model says the pen lands.
 *
 * Usage: node dev-docs/research/stroke-order-spike/run.cjs <font-dir>
 */
const fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  crypto = require('node:crypto'),
  { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const fontDir = process.argv[2] || path.join(root, 'work');
const mime = {
  '.html': 'text/html',
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
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
const FONTS = [
  ['Andika', 'Andika-Regular.ttf'],
  ['PatrickHand', 'PatrickHand-Regular.ttf'],
  ['Delius', 'Delius-Regular.ttf'],
  ['ArchitectsDaughter', 'ArchitectsDaughter-Regular.ttf'],
  ['IndieFlower', 'IndieFlower-Regular.ttf'],
  ['Kalam', 'Kalam-Regular.ttf'],
  ['EduQLDBeginner', 'EduQLDBeginner.ttf'],
  ['Caveat', 'Caveat-var.ttf'],
  ['ShadowsIntoLight', 'ShadowsIntoLight.ttf'],
  ['DancingScript', 'DancingScript-var.ttf'],
  ['GreatVibes', 'GreatVibes-Regular.ttf'],
  ['CedarvilleCursive', 'Cedarville-Cursive.ttf'],
  ['Parisienne', 'Parisienne-Regular.ttf'],
];
const meta = FONTS.filter(([, f]) => fs.existsSync(path.join(fontDir, f))).map(
  ([id, file]) => {
    const b = fs.readFileSync(path.join(fontDir, file));
    fs.copyFileSync(path.join(fontDir, file), path.join(root, 'work', file));
    return {
      id,
      file: `work/${file}`,
      sha256: crypto.createHash('sha256').update(b).digest('hex'),
      sizeBytes: b.length,
    };
  },
);
(async () => {
  let browser;
  try {
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('PAGEERR', e.message));
    await page.goto(origin + '/demo/multilingual/?prune=' + (process.argv[3] || 0));
    const rows = await page.evaluate(
      async ({ origin, meta }) => {
        const { createFontProvider } = await import('/extras/fonts/provider.mjs');
        const { thinInk, graphTrails, assignOwnership, dilateCoverage } =
          await import('/extras/fonts/skeleton.mjs');
        const { orderByModel } =
          await import('/dev-docs/research/stroke-order-spike/traversal.mjs');
        const base = await (await fetch('/fonts/catalog.json')).json();
        const ranges = await (await fetch('/fonts/script-ranges.json')).json();
        const english = base.scripts.find((s) => s.id === 'english');
        const motor = await (await fetch('/fonts/motor/english.json')).json();
        const L = 'abcdefghijklmnopqrstuvwxyz';
        const PX = 192;
        const PRUNE = new URLSearchParams(location.search).get('prune') || 0;

        // Rasterize one glyph the way the shipped pipeline does: fill the outline, then thin.
        const rasterize = (shape) => {
          const [bx, by, bw, bh] = shape.bounds;
          const scale = Math.min(PX / bw, PX / bh) * 0.86;
          const w = PX,
            h = PX;
          const c = new OffscreenCanvas(w, h),
            ctx = c.getContext('2d');
          ctx.fillStyle = '#000';
          ctx.translate(
            (w - bw * scale) / 2 - bx * scale,
            (h - bh * scale) / 2 + (by + bh) * scale,
          );
          ctx.scale(scale, -scale);
          for (const g of shape.glyphs) {
            ctx.save();
            ctx.translate(g.x, g.y);
            ctx.fill(new Path2D(g.path), 'nonzero');
            ctx.restore();
          }
          const d = ctx.getImageData(0, 0, w, h).data,
            ink = new Uint8Array(w * h);
          for (let i = 0; i < ink.length; i++) ink[i] = d[4 * i + 3] > 0 ? 1 : 0;
          return { ink, w, h };
        };

        const out = [];
        for (const m of meta) {
          const catalog = JSON.parse(JSON.stringify(base));
          catalog.fonts = [
            {
              id: m.id,
              name: m.id,
              family: m.id,
              style: 'Regular',
              file: m.file,
              license: 'OFL-1.1',
              notice: 'fonts/notices/Noto-OFL.txt',
              source: { url: 'l', revision: 'l' },
              sha256: m.sha256,
              sizeBytes: m.sizeBytes,
              glyphCount: 1,
              coverageRanges: [[0x20, 0x7e]],
            },
          ];
          catalog.scripts = [{ ...english, fontIds: [m.id] }];
          const provider = createFontProvider({
            catalog,
            scriptRanges: ranges,
            baseUrl: origin + '/',
          });
          let letters = 0,
            fullyCovered = 0,
            countMatch = 0,
            startSum = 0,
            startN = 0,
            empty = 0,
            jumpSum = 0,
            jumpN = 0,
            jumpBad = 0,
            walkSum = 0,
            floorSum = 0,
            modelSum = 0,
            inkSum = 0,
            ownedSum = 0,
            unowned = 0;
          for (const ch of L) {
            const rec = motor.units[ch];
            if (!rec) continue;
            try {
              const shape = await provider.shape({
                scriptId: 'english',
                text: ch,
                fontId: m.id,
              });
              const { ink, w, h } = rasterize(shape);
              const skeleton = await thinInk(ink, w, h);
              const trails = graphTrails(skeleton, w, h);
              if (!trails.length) {
                empty++;
                continue;
              }
              let l = w,
                t = h,
                r = 0,
                b = 0;
              for (let i = 0; i < ink.length; i++)
                if (ink[i]) {
                  l = Math.min(l, i % w);
                  r = Math.max(r, i % w);
                  t = Math.min(t, Math.floor(i / w));
                  b = Math.max(b, Math.floor(i / w));
                }
              const model = rec.unit.plans[0].steps.map((s) => {
                const st = rec.unit.motorStrokes.find((x) => x.id === s.strokeId);
                return { points: st.kind === 'dot' ? [st.center, st.center] : st.points };
              });
              const yDown = rec.unit.coordinates.yAxis === 'down';
              const res = orderByModel(trails, model, [l, t, r, b], yDown, Number(PRUNE));
              letters++;
              if (res.covered === res.total) fullyCovered++;
              if (res.strokes.length === model.length) countMatch++;
              for (const s of res.starts) {
                startSum += s;
                startN++;
              }
              // A stroke that teleports is not a pen movement. Measure the largest gap
              // between consecutive points, normalized by glyph size.
              const span = Math.max(r - l, b - t, 1);
              let worst = 0;
              for (const st of res.strokes)
                for (let i = 1; i < st.length; i++)
                  worst = Math.max(
                    worst,
                    Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]) / span,
                  );
              jumpSum += worst;
              jumpN++;
              walkSum += res.strokes.length;
              floorSum += res.floor;
              modelSum += model.length;
              // Pruning drops skeleton twigs, so the honest completeness test is whether
              // every ink cell still receives an owner once ownership floods outward.
              const cov = dilateCoverage(ink, w, h);
              const assign = await assignOwnership(cov, skeleton, res.strokes, w, h, 0);
              let inkCells = 0,
                owned = 0;
              for (let i = 0; i < ink.length; i++)
                if (ink[i]) {
                  inkCells++;
                  if (assign.owners[i]) owned++;
                }
              inkSum += inkCells;
              ownedSum += owned;
              if (owned < inkCells) unowned++;
              if (worst > 0.15) jumpBad++;
            } catch (e) {
              empty++;
            }
          }
          out.push({
            id: m.id,
            letters,
            fullyCovered,
            countMatch,
            meanStart: startN ? startSum / startN : null,
            meanJump: jumpN ? jumpSum / jumpN : null,
            jumpBad,
            empty,
            walkSum,
            floorSum,
            modelSum,
            inkSum,
            ownedSum,
            unowned,
          });
        }
        return out;
      },
      { origin, meta },
    );

    console.log(
      'font                 covered  jump>.15  strokes  min-possible  model  start offset  ink owned',
    );
    for (const r of rows)
      console.log(
        `${r.id.padEnd(20)} ${String(r.fullyCovered + '/' + r.letters).padStart(7)}  ` +
          `${String(r.jumpBad).padStart(8)}  ${String(r.walkSum).padStart(7)}  ${String(r.floorSum).padStart(12)}  ` +
          `${String(r.modelSum).padStart(5)}  ${(r.meanStart ?? 0).toFixed(3).padStart(12)}  ` +
          `${(r.inkSum ? (r.ownedSum / r.inkSum) * 100 : 0).toFixed(2).padStart(7)}%`,
      );
    fs.writeFileSync(
      path.join(__dirname, 'evidence.json'),
      JSON.stringify(rows, null, 2) + '\n',
    );
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
