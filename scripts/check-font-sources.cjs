'use strict';
const assert = require('node:assert/strict'),
  fs = require('node:fs'),
  path = require('node:path'),
  http = require('node:http'),
  { createHash } = require('node:crypto'),
  { chromium, webkit } = require('playwright');
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
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fs.readFileSync(file));
  } catch {
    res.writeHead(404).end();
  }
});
const index = JSON.parse(fs.readFileSync(path.join(root, 'fonts/motor/index.json'))),
  schemaBytes = Buffer.from(JSON.stringify({ schemaVersion: 1, units: { A: null } })),
  schemaIndex = JSON.parse(JSON.stringify(index));
Object.assign(
  schemaIndex.groups.find((g) => g.id === 'english'),
  {
    unitCount: 1,
    sizeBytes: schemaBytes.length,
    sha256: createHash('sha256').update(schemaBytes).digest('hex'),
  },
);
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/demo/multilingual/`;
  let total = 0;
  try {
    for (const engine of [chromium, webkit]) {
      const browser = await engine.launch();
      try {
        const page = await browser.newPage({ viewport: { width: 1000, height: 1100 } }),
          errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(url);
        const sourceReady = () =>
          page.waitForFunction(
            () =>
              document
                .querySelector('#font-animation-note')
                .textContent.includes('3 strokes') &&
              !document.querySelector('#font-animate').disabled,
          );
        await sourceReady();
        assert.equal(
          await page.locator('#font-animate').textContent(),
          'Animate strokes',
        );
        await page.click('#font-animate');
        await page.waitForFunction(
          () => document.querySelectorAll('#font-area mask').length === 1,
        );
        await page.click('#font-stop');
        await page.fill('#font-text', 'F');
        await page.click('#font-form button');
        await sourceReady();
        assert.equal(
          await page.locator('#font-animate').textContent(),
          'Animate strokes',
        );
        await page.fill('#font-text', 'A');
        await page.selectOption('#font-family', 'NotoSerif');
        await sourceReady();
        await page.fill('#font-text', 'a');
        await page.click('#font-form button');
        await page.waitForFunction(
          () => document.querySelector('#font-animate').textContent === 'Reveal shape',
        );
        assert.match(await page.locator('#font-animation-note').textContent(), /paths/);
        assert.doesNotMatch(
          await page.locator('#font-animation-note').textContent(),
          /\d+ strokes/,
        );
        await page.selectOption('#font-script', 'korean');
        await page.fill('#font-text', '가');
        await page.click('#font-form button');
        await page.waitForFunction(() =>
          document.querySelector('#font-animation-note').textContent.startsWith('Mixed'),
        );
        assert.equal(await page.locator('#font-animate').textContent(), 'Reveal shape');
        assert.match(await page.locator('#font-animation-note').textContent(), /3 paths/);
        await page.selectOption('#font-script', 'greek');
        await page.waitForFunction(
          () => document.querySelector('#font-animate').textContent === 'Reveal shape',
        );
        assert.match(await page.locator('#font-animation-note').textContent(), /paths/);
        assert.deepEqual(errors, []);
        await page.close();
        total += 6;
        for (const scenario of ['index404', 'group404', 'offline', 'json', 'schema']) {
          const p = await browser.newPage({ viewport: { width: 1000, height: 1100 } }),
            failures = [];
          p.on('pageerror', (e) => failures.push(e.message));
          let mode = scenario,
            delayed = false,
            release,
            entered;
          let delayGate, seen;
          await p.route('**/fonts/motor/**', async (route) => {
            const file = new URL(route.request().url()).pathname;
            if (mode === 'index404' && file.endsWith('index.json'))
              return route.fulfill({ status: 404, body: '' });
            if (mode === 'json' && file.endsWith('index.json'))
              return route.fulfill({ contentType: 'application/json', body: '{' });
            if (mode === 'schema' && file.endsWith('index.json'))
              return route.fulfill({
                contentType: 'application/json',
                body: JSON.stringify(schemaIndex),
              });
            if (file.endsWith('english.json')) {
              if (mode === 'group404') return route.fulfill({ status: 404, body: '' });
              if (mode === 'offline') return route.abort('failed');
              if (mode === 'schema')
                return route.fulfill({
                  contentType: 'application/json',
                  body: schemaBytes.toString(),
                });
              if (mode === 'delay' && !delayed) {
                delayed = true;
                entered();
                await delayGate;
                return route.fulfill({ status: 500, body: '' }).catch(() => {});
              }
            }
            return route.continue().catch(() => {});
          });
          await p.goto(url);
          await p.locator('#font-retry-guide').waitFor({ state: 'visible' });
          assert.match(
            await p.locator('#font-animation-note').textContent(),
            /Stroke source could not be loaded/,
          );
          assert(await p.locator('#font-animate').isDisabled());
          assert.equal(await p.locator('#font-area path').count(), 1);
          assert(!(await p.locator('#font-trace').isDisabled()));
          await p.locator('#font-area').scrollIntoViewIfNeeded();
          const bounds = await p.locator('#font-area').boundingBox();
          await p.mouse.move(bounds.x + 100, bounds.y + 100);
          await p.mouse.down();
          await p.mouse.move(bounds.x + 150, bounds.y + 170, { steps: 5 });
          await p.mouse.up();
          const before = await p.locator('#font-result').textContent();
          assert.match(before, /covered/);
          await p.evaluate(
            () =>
              (window.savedFontSurface =
                document.querySelector('#font-area').firstElementChild),
          );
          mode = 'ok';
          await p.click('#font-retry-guide');
          await p.waitForFunction(
            () =>
              document
                .querySelector('#font-animation-note')
                .textContent.includes('3 strokes') &&
              !document.querySelector('#font-animate').disabled,
          );
          assert(
            await p.evaluate(
              () =>
                window.savedFontSurface ===
                document.querySelector('#font-area').firstElementChild,
            ),
          );
          await p.click('#font-check');
          assert.equal(await p.locator('#font-result').textContent(), before);
          assert.equal(await p.locator('#font-animate').textContent(), 'Animate strokes');
          if (scenario === 'offline') {
            // A delayed failing retry must not overwrite a newly selected F target.
            mode = 'offline';
            await p.reload();
            await p.locator('#font-retry-guide').waitFor({ state: 'visible' });
            mode = 'delay';
            delayGate = new Promise((r) => (release = r));
            seen = new Promise((r) => (entered = r));
            await p.click('#font-retry-guide');
            await seen;
            await p.fill('#font-text', 'F');
            await p.click('#font-form button');
            await p.waitForFunction(
              () =>
                document
                  .querySelector('#font-animation-note')
                  .textContent.includes('3 strokes') &&
                !document.querySelector('#font-animate').disabled,
            );
            release();
            await p.waitForTimeout(100);
            assert.equal(await p.locator('#font-text').inputValue(), 'F');
            assert.equal(
              await p.locator('#font-animate').textContent(),
              'Animate strokes',
            );
            assert(await p.locator('#font-retry-guide').isHidden());
          }
          assert.deepEqual(failures, []);
          await p.close();
          total++;
        }
        console.log(
          `${engine.name()}: source A/F, generated/mixed labels, five failure/retry cases, ink preservation and stale retry passed.`,
        );
      } finally {
        await browser.close();
      }
    }
    console.log(`Source workflow gate passed: ${total} Chromium/WebKit scenarios.`);
  } finally {
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
