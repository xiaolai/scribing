const fs = require('fs'),
  http = require('http'),
  path = require('path');
const root = path.resolve(__dirname, '../..'),
  { chromium } = require(path.join(root, 'node_modules/playwright'));
const server = http.createServer((q, r) => {
  try {
    let f = path.join(root, new URL(q.url, 'http://x').pathname);
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    r.setHeader(
      'Content-Type',
      {
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.html': 'text/html',
        '.json': 'application/json',
        '.wasm': 'application/wasm',
      }[path.extname(f)] || 'application/octet-stream',
    );
    r.setHeader('Cache-Control', 'no-store');
    r.end(fs.readFileSync(f));
  } catch {
    r.writeHead(404).end();
  }
});
(async () => {
  fs.mkdirSync(path.join(root, 'work/fonts/contour-gate'), { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(),
    base = `http://127.0.0.1:${server.address().port}`,
    results = [];
  try {
    for (const deviceRatio of [1, 3]) {
      const context = await browser.newContext({ deviceScaleFactor: deviceRatio });
      try {
        const page = await context.newPage();
        await page.goto(base + '/');
        await page.addScriptTag({ url: base + '/dist/scribing.js' });
        for (const sizePx of [320, 960])
          for (const rendererName of ['canvas', 'svg']) {
            const report = await page.evaluate(
              async ({ size, renderer }) => {
                const { fontShapeKey } = await import('/extras/fonts/animation.mjs');
                const host = document.createElement('div');
                document.body.append(host);
                const w = Scribing.createFontWriter(host, {
                    width: size,
                    height: size,
                    padding: 12,
                    renderer,
                    referenceColor: 'transparent',
                    animationColor: '#000',
                  }),
                  ratio = devicePixelRatio;
                const pixels = async () => {
                  if (renderer === 'canvas')
                    return host.firstChild
                      .getContext('2d')
                      .getImageData(0, 0, size * ratio, size * ratio);
                  const c = document.createElement('canvas');
                  c.width = c.height = size * ratio;
                  const img = new Image();
                  img.src =
                    'data:image/svg+xml;base64,' +
                    btoa(new XMLSerializer().serializeToString(host.firstChild));
                  await img.decode();
                  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                  return c.getContext('2d').getImageData(0, 0, c.width, c.height);
                };
                const circle = (r, reverse = false) => {
                  const k = r * 0.5522847498307936;
                  return reverse
                    ? `M${50 + r} 50C${50 + r} ${50 - k} ${50 + k} ${50 - r} 50 ${50 - r}C${50 - k} ${50 - r} ${50 - r} ${50 - k} ${50 - r} 50C${50 - r} ${50 + k} ${50 - k} ${50 + r} 50 ${50 + r}C${50 + k} ${50 + r} ${50 + r} ${50 + k} ${50 + r} 50Z`
                    : `M${50 + r} 50C${50 + r} ${50 + k} ${50 + k} ${50 + r} 50 ${50 + r}C${50 - k} ${50 + r} ${50 - r} ${50 + k} ${50 - r} 50C${50 - r} ${50 - k} ${50 - k} ${50 - r} 50 ${50 - r}C${50 + k} ${50 - r} ${50 + r} ${50 - k} ${50 + r} 50Z`;
                };
                const cases = [];
                for (const name of ['endpoint', 'loop']) {
                  const isLoop = name === 'loop',
                    outline = isLoop
                      ? circle(35) + ' ' + circle(20, true)
                      : 'M0 0H100V100H0Z';
                  await w.setShape({
                    schemaVersion: 1,
                    text: 'a',
                    font: { id: 'fixture', name: 'fixture', sha256: 'a'.repeat(64) },
                    script: 'Latn',
                    language: 'en',
                    direction: 'ltr',
                    em: 100,
                    bounds: isLoop ? [15, 15, 70, 70] : [0, 0, 100, 100],
                    glyphs: [
                      {
                        id: 1,
                        cluster: 0,
                        path: outline,
                        x: 0,
                        y: 0,
                        advanceX: 100,
                        advanceY: 0,
                      },
                    ],
                  });
                  const width = 32,
                    height = 32,
                    owners = new Uint16Array(width * height),
                    progress = new Uint16Array(width * height);
                  for (let r = 0; r < height; r++)
                    for (let c = 0; c < width; c++) {
                      const x = ((c + 0.5) * 100) / width,
                        y = 100 - ((r + 0.5) * 100) / height,
                        radius = Math.hypot(x - 50, y - 50);
                      owners[r * width + c] =
                        !isLoop || (radius >= 16 && radius <= 39) ? 1 : 0;
                      const a =
                        (Math.atan2(y - 50, x - 50) + 2 * Math.PI) % (2 * Math.PI);
                      progress[r * width + c] = owners[r * width + c]
                        ? Math.round(
                            (isLoop ? a / (2 * Math.PI) : c / (width - 1)) * 65535,
                          )
                        : 0;
                    }
                  const points = isLoop
                    ? Array.from({ length: 65 }, (_, i) => [
                        50 + 27.5 * Math.cos((i / 64) * 2 * Math.PI),
                        50 + 27.5 * Math.sin((i / 64) * 2 * Math.PI),
                      ])
                    : [
                        [0, 50],
                        [100, 50],
                      ];
                  await w.setAnimation({
                    schemaVersion: 1,
                    shapeKey: fontShapeKey(w.getShape()),
                    provenance: 'generated',
                    strokes: [
                      { id: 's1', kind: 'curve', provenance: 'generated', points },
                    ],
                    tiles: [
                      {
                        glyphIndices: [0],
                        bounds: [0, 0, 100, 100],
                        width,
                        height,
                        owners,
                        progress,
                      },
                    ],
                  });
                  w.hideReference();
                  const frames = [];
                  for (const phase of [
                    0, 0.000001, 0.001, 0.01, 0.025, 0.25, 0.5, 0.75, 0.975, 0.99,
                    0.999999, 1,
                  ]) {
                    w.animationState = { stroke: 0, progress: phase };
                    w.render();
                    const im = await pixels(),
                      t = w.transform;
                    let alphaArea = 0,
                      early = 0,
                      late = 0;
                    for (let y = 0; y < im.height; y++)
                      for (let x = 0; x < im.width; x++) {
                        const a = im.data[(y * im.width + x) * 4 + 3];
                        alphaArea += a / 255;
                        if (!isLoop) continue;
                        const wx = ((x + 0.5) / ratio - t.x) / t.scale,
                          wy = (t.y - (y + 0.5) / ratio) / t.scale,
                          r = Math.hypot(wx - 50, wy - 50);
                        if (r < 24 || r > 31) continue;
                        const p =
                          ((Math.atan2(wy - 50, wx - 50) + 2 * Math.PI) % (2 * Math.PI)) /
                          (2 * Math.PI);
                        if (p < phase - 0.025 && a < 250) late++;
                        if (p > phase + 0.025 && a > 5) early++;
                      }
                    frames.push({ phase, alphaArea, early, late });
                  }
                  cases.push({
                    name,
                    frames,
                    startJump: frames[1].alphaArea - frames[0].alphaArea,
                    finishJump: frames.at(-1).alphaArea - frames.at(-2).alphaArea,
                    finalArea: frames.at(-1).alphaArea,
                  });
                }
                w.destroy();
                host.remove();
                return { size, renderer, ratio, cases };
              },
              { size: sizePx, renderer: rendererName },
            );
            for (const c of report.cases) {
              if (
                c.startJump > (sizePx * deviceRatio) / 128 ||
                c.finishJump > (sizePx * deviceRatio) / 128 ||
                c.frames.some((f) => f.early || f.late)
              )
                throw Error(
                  'Endpoint pop or loop phase leak: ' +
                    JSON.stringify({
                      size: sizePx,
                      renderer: rendererName,
                      ratio: deviceRatio,
                      name: c.name,
                      start: c.startJump,
                      finish: c.finishJump,
                    }),
                );
            }
            results.push(report);
            console.log(
              JSON.stringify({
                size: sizePx,
                renderer: rendererName,
                ratio: deviceRatio,
                cases: report.cases.map((c) => ({
                  name: c.name,
                  startJump: c.startJump,
                  finishJump: c.finishJump,
                  maxEarly: Math.max(...c.frames.map((f) => f.early)),
                  maxLate: Math.max(...c.frames.map((f) => f.late)),
                })),
              }),
            );
          }
      } finally {
        await context.close();
      }
    }
    fs.writeFileSync(
      path.join(root, 'work/fonts/contour-gate', 'endpoint-loop.json'),
      JSON.stringify(results, null, 2),
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
