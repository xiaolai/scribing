'use strict';
// Drives tools/font-coverage/ through its real controls in a real browser.
//
// The tool's whole claim is that it reports the tier a caller would actually get, so a
// gate that stubbed the runtime would check nothing worth checking. This one loads real
// font bytes off disk, runs the shipped pipeline, and asserts the tiers the runtime is
// known to produce for those glyphs. It also asserts the tool stays self-hosted: any
// request leaving the origin aborts and fails the run.
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
  '.ttf': 'font/ttf',
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
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
const catalog = require(path.join(root, 'fonts/catalog.json'));
const assetOf = (id) => {
  const font = catalog.fonts.find((f) => f.id === id);
  assert.ok(font, `catalog is missing ${id}`);
  return { file: path.join(root, font.file), sha256: font.sha256 };
};

(async () => {
  let browser;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
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
    await page.goto(origin + '/tools/font-coverage/');

    // The catalogue drives the script list, so an empty list means init() failed
    // silently rather than that the tool has nothing to offer.
    await page.waitForFunction(
      () => document.querySelectorAll('#script option').length > 0,
    );
    assert.equal(await page.locator('#script option').count(), catalog.scripts.length);
    assert.equal(await page.locator('#script').inputValue(), 'english');
    assert.match(
      await page.locator('#script option').first().textContent(),
      /has stroke order$/,
      'scripts with motor data must sort ahead of the rest',
    );
    // The default character set comes from the script's own inventory.
    assert.equal(
      (await page.locator('#chars').inputValue()).length,
      catalog.scripts.find((s) => s.id === 'english').inventory.length,
    );

    const load = async (id) => {
      const asset = assetOf(id);
      await page.setInputFiles('#file', asset.file);
      await page.waitForFunction(
        (sha) => document.getElementById('font-status').textContent.includes(sha),
        asset.sha256.slice(0, 12),
      );
      return asset;
    };
    // A digest read back from the page proves the bytes arrived intact, which a status
    // line saying "loaded" would not.
    const sans = await load('NotoSans');
    assert.ok(sans.sha256, 'the catalogue pins a digest for NotoSans');

    const tiersFor = async (text) => {
      await page.fill('#chars', text);
      await page.click('#run');
      await page.waitForFunction(
        (n) => document.querySelectorAll('#grid .cell').length === n,
        Array.from(text).length,
      );
      await page.waitForSelector('#export:not([disabled])');
      return page.$$eval('#grid .badge', (b) => b.map((x) => x.textContent));
    };

    // These four exercise every path the tiering can take on a Latin face. A and F fit,
    // so the model's own geometry survives. J and a cannot be fitted but enclose the
    // same holes as their model, so the model still lends its order.
    assert.deepEqual(await tiersFor('AFJa'), [
      'source-adapted',
      'source-adapted',
      'source-ordered',
      'source-ordered',
    ]);
    const cells = await page.locator('#grid .cell').count();
    assert.equal(cells, 4);
    // Every cell draws its strokes, numbered, so order never rests on colour alone.
    assert.ok(
      (await page.locator('#grid .cell svg polyline').count()) >= 4,
      'strokes must be drawn',
    );
    assert.ok(
      (await page.locator('#grid .cell svg text').count()) >= 4,
      'stroke numbers must be drawn',
    );
    assert.equal(await page.locator('#summary tr').count(), 2);

    await load('NotoSerif');
    // NotoSerif's double-storey g encloses two counters where the single-storey model
    // encloses one, so no tier may claim its order and the tool must say `generated`.
    assert.deepEqual(await tiersFor('ag'), ['source-ordered', 'generated']);

    // A font with no Latin at all must report every character missing rather than throw.
    await load('NotoSansThaana');
    assert.deepEqual(await tiersFor('ab'), ['missing', 'missing']);

    // Detection walks the script list and stops at the first script the font shapes.
    await load('NotoSans');
    await page.click('#detect');
    await page.waitForFunction(() =>
      document.getElementById('run-status').textContent.startsWith('Detected'),
    );
    assert.equal(await page.locator('#script').inputValue(), 'english');

    await tiersFor('AJ');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#export'),
    ]);
    const body = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
    assert.equal(body.tool, 'scribing-font-coverage');
    assert.equal(body.font.sha256, sans.sha256);
    assert.equal(body.script.id, 'english');
    assert.deepEqual(body.coordinates, { units: 'em', yAxis: 'up' });
    assert.deepEqual(
      body.characters.map((c) => c.tier),
      ['source-adapted', 'source-ordered'],
    );
    assert.equal(body.characters[0].codepoint, 'U+0041');
    // Points are divided by the em, so a glyph's ink lands near the unit square. A
    // coordinate in the hundreds would mean the export leaked raw font units.
    for (const character of body.characters)
      for (const stroke of character.strokes)
        for (const [x, y] of stroke.points)
          assert.ok(
            Math.abs(x) <= 2 && Math.abs(y) <= 2,
            `export must be in em units, saw ${x},${y}`,
          );
    assert.ok(
      body.characters[1].strokes.every((s) => s.source?.unitId),
      'an ordered glyph must name the unit that ordered it',
    );

    assert.deepEqual(errors, []);
    assert.deepEqual(external, []);
    console.log(
      'Font coverage tool gate passed: catalogue-driven script list, real font bytes verified by digest, all three tiers plus missing glyphs, detection, and an em-normalised export.',
    );
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
