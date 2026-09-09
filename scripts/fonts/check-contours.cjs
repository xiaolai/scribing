const fs = require('node:fs'),
  http = require('node:http'),
  path = require('node:path'),
  assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..'),
  { chromium } = require(path.join(root, 'node_modules/playwright'));
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
};
const server = http.createServer((req, res) => {
  try {
    let f = path.join(root, new URL(req.url, 'http://localhost').pathname);
    if (fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(f)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(f));
  } catch {
    res.writeHead(404).end();
  }
});
(async () => {
  fs.mkdirSync(path.join(root, 'work/fonts/contour-gate'), { recursive: true });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(),
    base = `http://127.0.0.1:${server.address().port}`,
    results = [];
  try {
    for (const deviceRatio of process.env.ISO_SMALL ? [1] : [1, 3]) {
      const context = await browser.newContext({ deviceScaleFactor: deviceRatio });
      try {
        const page = await context.newPage();
        await page.goto(base + '/');
        await page.addScriptTag({ url: base + '/dist/scribing.js' });
        for (const sizePx of process.env.ISO_SMALL ? [320] : [320, 960])
          for (const rendererName of process.env.ISO_SMALL
            ? ['svg']
            : ['canvas', 'svg']) {
            const result = await page.evaluate(
              async ({ size, renderer }) => {
                const { fontShapeKey } = await import('/extras/fonts/animation.mjs');
                const host = document.createElement('div');
                document.body.append(host);
                const writer = Scribing.createFontWriter(host, {
                    width: size,
                    height: size,
                    padding: 12,
                    renderer,
                    referenceColor: 'transparent',
                    animationColor: '#000',
                  }),
                  ratio = devicePixelRatio;
                const rect = 'M5 5H95V95H5Z',
                  shape = (outline) => ({
                    schemaVersion: 1,
                    text: 'a',
                    font: {
                      id: 'fixture',
                      name: 'Analytic contour fixture',
                      sha256: 'a'.repeat(64),
                    },
                    script: 'Latn',
                    language: 'en',
                    direction: 'ltr',
                    em: 100,
                    bounds: [5, 5, 90, 90],
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
                const copyPixels = async () => {
                  if (renderer === 'canvas')
                    return host.firstChild
                      .getContext('2d')
                      .getImageData(0, 0, host.firstChild.width, host.firstChild.height);
                  const c = document.createElement('canvas');
                  c.width = size * ratio;
                  c.height = size * ratio;
                  const ctx = c.getContext('2d'),
                    img = new Image();
                  img.src =
                    'data:image/svg+xml;base64,' +
                    btoa(new XMLSerializer().serializeToString(host.firstChild));
                  await img.decode();
                  ctx.drawImage(img, 0, 0, c.width, c.height);
                  return ctx.getImageData(0, 0, c.width, c.height);
                };
                const out = [];
                let last;
                for (const field of ['horizontal', 'diagonal', 'owner-split', 'saddle']) {
                  await writer.setShape(shape(rect));
                  const width = 16,
                    height = 16,
                    owners = new Uint16Array(width * height),
                    progress = new Uint16Array(width * height),
                    scalar = (x, y) =>
                      field === 'diagonal'
                        ? (x + y) / 200
                        : field === 'saddle'
                          ? 0.5 + ((x - 50) * (y - 50)) / 5000
                          : x / 100;
                  for (let r = 0; r < height; r++)
                    for (let c = 0; c < width; c++) {
                      const x = ((c + 0.5) * 100) / width,
                        y = 100 - ((r + 0.5) * 100) / height;
                      owners[r * width + c] = field === 'owner-split' && y < 50 ? 2 : 1;
                      progress[r * width + c] = Math.round(scalar(x, y) * 65535);
                    }
                  const strokes = Array.from(
                    { length: field === 'owner-split' ? 2 : 1 },
                    (_, i) => ({
                      id: 's' + i,
                      kind: 'curve',
                      provenance: 'generated',
                      points: [
                        [5, 25 + i * 50],
                        [95, 25 + i * 50],
                      ],
                    }),
                  );
                  await writer.setAnimation({
                    schemaVersion: 1,
                    shapeKey: fontShapeKey(writer.getShape()),
                    provenance: 'generated',
                    strokes,
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
                  writer.hideReference();
                  const phases =
                    field === 'saddle'
                      ? [0.49, 0.5, 0.51]
                      : [0.465, 0.46875, 0.473, 0.501];
                  for (const stroke of field === 'owner-split' ? [0, 1] : [0])
                    for (const phase of phases) {
                      writer.animationState = { stroke, progress: phase };
                      writer.render();
                      const pixels = await copyPixels(),
                        data = pixels.data,
                        t = writer.transform,
                        screenScale = t.scale * ratio,
                        pxToWorld = 1 / screenScale;
                      let opaqueCracks = 0,
                        futureLeak = 0,
                        wrongSide = 0,
                        maxFrontResidual = 0,
                        antialias = 0,
                        ink = 0;
                      const samples = [],
                        crackPoints = [];
                      for (let y = 0; y < pixels.height; y++)
                        for (let x = 0; x < pixels.width; x++) {
                          const wx = ((x + 0.5) / ratio - t.x) / t.scale,
                            wy = (t.y - (y + 0.5) / ratio) / t.scale;
                          if (
                            wx < 5 + 2 * pxToWorld ||
                            wx > 95 - 2 * pxToWorld ||
                            wy < 5 + 2 * pxToWorld ||
                            wy > 95 - 2 * pxToWorld
                          )
                            continue;
                          const alpha = data[(y * pixels.width + x) * 4 + 3],
                            owner = field === 'owner-split' && wy < 50 ? 2 : 1,
                            delta = scalar(wx, wy) - phase,
                            margin =
                              field === 'saddle'
                                ? 0.015
                                : (2 * pxToWorld) /
                                  (field === 'diagonal' ? Math.sqrt(20000) : 100);
                          if (alpha > 0) ink++;
                          if (alpha > 0 && alpha < 255) antialias++;
                          if (owner > stroke + 1 && Math.abs(wy - 50) > 2 * pxToWorld) {
                            if (alpha > 0) futureLeak++;
                            continue;
                          }
                          if (
                            field === 'owner-split' &&
                            Math.abs(wy - 50) < 2 * pxToWorld
                          )
                            continue;
                          const shouldFill = owner < stroke + 1 || delta < -margin,
                            shouldEmpty = owner === stroke + 1 && delta > margin;
                          if (shouldFill && alpha < 250) {
                            opaqueCracks++;
                            if (crackPoints.length < 8)
                              crackPoints.push({ x, y, wx, wy, alpha, delta, margin });
                          }
                          if (shouldEmpty && alpha > 5) wrongSide++;
                          if (
                            field === 'horizontal' &&
                            owner === stroke + 1 &&
                            alpha > 5 &&
                            alpha < 250
                          )
                            maxFrontResidual = Math.max(
                              maxFrontResidual,
                              Math.abs(wx - phase * 100) * screenScale,
                            );
                        }
                      if (field === 'horizontal')
                        for (const wy of [15, 25, 35, 50, 65, 75, 85]) {
                          const sy = Math.floor((t.y - wy * t.scale) * ratio);
                          let end = -1,
                            sum = 0;
                          for (let sx = 0; sx < pixels.width; sx++) {
                            const a = data[(sy * pixels.width + sx) * 4 + 3];
                            if (a >= 128) end = sx;
                            sum += a / 255;
                          }
                          samples.push({ wy, edge: end, area: sum });
                        }
                      const span = samples.length
                        ? Math.max(...samples.map((s) => s.edge)) -
                          Math.min(...samples.map((s) => s.edge))
                        : 0;
                      out.push({
                        field,
                        stroke,
                        phase,
                        opaqueCracks,
                        futureLeak,
                        wrongSide,
                        frontSpan: span,
                        maxFrontResidual,
                        antialias,
                        ink,
                        samples,
                        crackPoints,
                      });
                      if (
                        (opaqueCracks || futureLeak || wrongSide || span > 1) &&
                        !last
                      ) {
                        const c = document.createElement('canvas');
                        c.width = pixels.width;
                        c.height = pixels.height;
                        c.getContext('2d').putImageData(pixels, 0, 0);
                        last = c.toDataURL();
                      }
                    }
                }
                // Final exact vector clip including slanted outer edges and a counter.
                await writer.setShape(shape('M5 5L95 8L93 92L8 95Z M42 42V58H58V42Z'));
                const owners = new Uint16Array(256).fill(1),
                  progress = new Uint16Array(256);
                for (let i = 0; i < 256; i++) progress[i] = Math.round((i / 255) * 65535);
                await writer.setAnimation({
                  schemaVersion: 1,
                  shapeKey: fontShapeKey(writer.getShape()),
                  provenance: 'generated',
                  strokes: [
                    {
                      id: 'final',
                      kind: 'curve',
                      provenance: 'generated',
                      points: [
                        [5, 5],
                        [95, 95],
                      ],
                    },
                  ],
                  tiles: [
                    {
                      glyphIndices: [0],
                      bounds: [0, 0, 100, 100],
                      width: 16,
                      height: 16,
                      owners,
                      progress,
                    },
                  ],
                });
                writer.hideReference();
                writer.animationState = { stroke: 0, progress: 1 };
                writer.render();
                const masked = await copyPixels();
                writer.cancel();
                writer.options.referenceColor = '#000';
                writer.showReference();
                const reference = await copyPixels();
                let finalMissing = 0,
                  finalAlphaDelta = 0,
                  finalInteriorMissing = 0;
                for (let i = 3; i < masked.data.length; i += 4) {
                  const a = reference.data[i],
                    b = masked.data[i];
                  if (a - b > 8) finalMissing++;
                  if (a === 255 && b < 250) finalInteriorMissing++;
                  finalAlphaDelta += Math.abs(a - b);
                }
                writer.destroy();
                host.remove();
                return {
                  size,
                  renderer,
                  ratio,
                  frames: out,
                  finalMissing,
                  finalInteriorMissing,
                  finalAlphaDelta,
                  ...(last ? { failureImage: last } : {}),
                };
              },
              { size: sizePx, renderer: rendererName },
            );
            if (result.failureImage) {
              fs.writeFileSync(
                path.join(
                  root,
                  'work/fonts/contour-gate',
                  `iso-failure-${rendererName}-${sizePx}-${deviceRatio}.png`,
                ),
                Buffer.from(result.failureImage.split(',')[1], 'base64'),
              );
              delete result.failureImage;
            }
            for (const frame of result.frames) {
              assert.equal(frame.opaqueCracks, 0, 'interior primitive seam');
              assert.equal(frame.futureLeak, 0, 'future owner revealed');
              assert.equal(frame.wrongSide, 0, 'wrong side of scalar contour');
              assert(frame.frontSpan <= 1, 'straight front exceeds one pixel');
            }
            assert.equal(result.finalInteriorMissing, 0, 'final interior gap');
            results.push(result);
            console.log(
              JSON.stringify({
                size: sizePx,
                renderer: rendererName,
                ratio: deviceRatio,
                frames: result.frames.length,
                maxCracks: Math.max(...result.frames.map((f) => f.opaqueCracks)),
                maxFutureLeak: Math.max(...result.frames.map((f) => f.futureLeak)),
                maxWrongSide: Math.max(...result.frames.map((f) => f.wrongSide)),
                maxFrontSpan: Math.max(...result.frames.map((f) => f.frontSpan)),
                finalInteriorMissing: result.finalInteriorMissing,
                finalMissing: result.finalMissing,
                finalAlphaDelta: result.finalAlphaDelta,
              }),
            );
          }
      } finally {
        await context.close();
      }
    }
    fs.writeFileSync(
      path.join(root, 'work/fonts/contour-gate', 'iso-contour.json'),
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
