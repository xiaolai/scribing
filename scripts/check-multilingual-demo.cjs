/* Real browser gate: run after yarn build and data generation. */
'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const path = require('path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  let file = path.resolve(root, `.${pathname}`);
  if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    const content = fs.readFileSync(file);
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
    response.end(content);
  } catch { response.writeHead(404).end('Not found'); }
});

(async () => {
  let browser;
  const errors = [];
  const external = [];
  const checks = [];
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 960, height: 1100 } });
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin !== origin) {
        external.push(route.request().url());
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(15000);
    await page.goto(`${origin}/demo/multilingual/`);
    const ready = async () => {
      try { await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Ready:')); }
      catch (error) { throw new Error(`Demo not ready (${await page.locator('#pack').inputValue()}): ${await page.locator('#status').textContent()}`); }
    };
    await ready();
    await page.evaluate(() => {
      const animate = Scribing.prototype.animateCharacter;
      Scribing.prototype.animateCharacter = async function(options) {
        const result = await animate.call(this, options);
        window.__lastAnimationPlan = options && options.planId;
        return result;
      };
      const original = Scribing.prototype.quizUnit;
      Scribing.prototype.quizUnit = async function(options) {
        window.__lastQuizWriter = this;
        const result = await original.call(this, options);
        window.__lastQuizLeniency = this._unitQuiz && this._unitQuiz._options.leniency;
        return result;
      };
    });
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'packs/generated/catalog.json'), 'utf8'));
    const primary = ['english-letterpaths-print', 'english-glyphed', 'japanese-kana', 'japanese-grade-1', 'korean-omniglot'];
    const broad = catalog.packs.find(entry => entry.id.startsWith('omniglot-'));
    assert(broad, 'An unmapped source collection must be available');
    async function selectPack(id) {
      await page.selectOption('#pack', id);
      await ready();
      const entry = catalog.packs.find(item => item.id === id);
      assert.equal(await page.locator('#unit option').count(), entry.unitCount);
      assert.match(await page.locator('#source').textContent(), /technical-preview/);
    }
    async function selectUnit(id) {
      await page.selectOption('#unit', id);
      await ready();
    }
    for (const id of [...primary, broad.id]) {
      await selectPack(id);
      assert.equal(await page.locator('#tolerance').inputValue(), id === 'korean-omniglot' || id === broad.id ? '1.5' : '1');
      checks.push(`loaded ${id}`);
    }
    assert.match(await page.locator('#details').textContent(), /recorded observation/i);
    // Unsupported lookups must leave recovery controls usable and never create markup.
    await page.fill('#text', '<img src=x onerror=alert(1)>');
    await page.click('#find');
    await page.waitForFunction(() => /unavailable/.test(document.getElementById('status').textContent));
    assert.equal(await page.locator('img').count(), 0);
    await selectPack('english-letterpaths-print');
    await selectUnit('i');
    checks.push('unsupported lookup and safe text recovery');
    await page.selectOption('#tolerance', '2');
    await page.click('#guided');
    await page.waitForFunction(() => window.__lastQuizLeniency === 2);
    assert.match(await page.locator('#status').textContent(), /Relaxed \(2\) matching/);
    await page.selectOption('#tolerance', '1');
    assert.match(await page.locator('#status').textContent(), /Practice stopped/);
    assert(await page.evaluate(() => !window.__lastQuizWriter._unitQuiz), 'Tolerance changes cancel active practice');
    await page.evaluate(() => {
      document.getElementById('guided').click();
      const tolerance = document.getElementById('tolerance');
      tolerance.value = '1.5';
      tolerance.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(() => !window.__lastQuizWriter._unitQuiz);
    assert.match(await page.locator('#status').textContent(), /Practice stopped/);
    checks.push('source tolerance defaults, actual quiz leniency, active and queued cancellation');
    await page.click('#animate');
    await page.waitForFunction(() => window.__lastAnimationPlan === document.getElementById('plan').value);
    assert.match(await page.locator('#status').textContent(), /Animating selected stroke plan/);
    checks.push('selected stroke plan passed to actual animation');

    // A separate writer compiles source geometry to obtain exact source-to-pixel positions.
    // Completion is still driven exclusively through real mouse events on the demo target.
    async function geometry() {
      return page.evaluate(async () => {
        const catalog = await (await fetch('../../packs/generated/catalog.json')).json();
        const entry = catalog.packs.find(item => item.id === document.getElementById('pack').value);
        const pack = await (await fetch('../../packs/generated/' + entry.file)).json();
        const unit = pack.units[document.getElementById('unit').value];
        const holder = document.createElement('div');
        holder.style.cssText = 'position:absolute;left:-10000px;top:0';
        document.body.appendChild(holder);
        const area = document.getElementById('writing-area');
        const width = Math.max(64, area.clientWidth);
        const probe = new Scribing(holder, { width, height: width, padding: 24 });
        try {
          await probe.setUnit(unit);
          const p = probe._positioner;
          const box = area.getBoundingClientRect();
          const compiled = probe._character.unit;
          const plan = compiled.plans.find(item => item.id === document.getElementById('plan').value);
          return plan.steps.map(step => {
            const stroke = compiled.strokes[step.strokeIndex];
            // Keep actual points, sampled at bounded index spacing for browser event cost.
            const count = Math.min(100, stroke.points.length);
            const points = Array.from({ length: count }, (_, i) => stroke.points[count === 1 ? 0 : Math.round(i * (stroke.points.length - 1) / (count - 1))]);
            return { kind: stroke.kind, points: points.map(point => ({
              x: box.left + point.x * p.scale + p.xOffset,
              y: box.top + p.height - p.yOffset - point.y * p.scale,
            })) };
          });
        } finally { probe.destroy(); holder.remove(); }
      });
    }
    async function draw(stroke) {
      const [first, ...rest] = stroke.points;
      await page.mouse.move(first.x, first.y);
      await page.mouse.down();
      for (const point of rest) await page.mouse.move(point.x, point.y);
      await page.mouse.up();
    }
    for (const width of [960, 320]) {
      await page.setViewportSize({ width, height: 1100 });
      for (const renderer of ['svg', 'canvas']) {
        await page.selectOption('#renderer', renderer);
        await ready();
        for (const [packId, id, strokeCount] of [['english-letterpaths-print', 'i', 2], ['japanese-kana', 'あ', 3], ['japanese-kana', 'ぬ', 2]]) {
          await selectPack(packId);
          await selectUnit(id);
          await page.locator('#writing-area').scrollIntoViewIfNeeded();
          if (id === 'i' && renderer === 'svg') {
            assert(await page.locator('#writing-area circle').evaluateAll(nodes => nodes.some(node => Number(node.getAttribute('r')) > 0)), 'Native dot must be visible');
          }
          if (renderer === 'canvas') {
            assert(await page.locator('#writing-area canvas').evaluate(canvas => {
              const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
              for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
              return false;
            }), 'Canvas must contain visible ink');
          }
          await page.click(id === 'ぬ' ? '#practice' : '#guided');
          await page.locator('#writing-area').scrollIntoViewIfNeeded();
          // Clicking can scroll the document; derive coordinates after that final scroll.
          const strokes = await geometry();
          assert.equal(strokes.length, strokeCount);
          if (id === 'i') {
            assert.equal(strokes[1].kind, 'dot');
            await draw(strokes[1]);
            await page.waitForFunction(() => /wrong order/.test(document.getElementById('status').textContent));
          }
          for (let i = 0; i < strokes.length; i++) {
            const currentStrokes = await geometry();
            await draw(currentStrokes[i]);
            if (i < strokes.length - 1) {
              try { await page.waitForFunction(() => /Accepted/.test(document.getElementById('status').textContent)); }
              catch { throw new Error(`${renderer}/${width}/${id}/stroke${i}: ${await page.locator('#status').textContent()}`); }
            }
          }
          await page.waitForFunction(() => document.getElementById('status').textContent.startsWith('Complete'));
          assert.match(await page.locator('#status').textContent(), id === 'i' ? /1 mistake/ : /0 mistake/);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Narrow layout must not overflow');
          checks.push(`${renderer} ${width}px actual mouse ${id}: ${strokeCount} strokes complete`);
        }
      }
    }
    const benchmark = await page.evaluate(async () => {
      const pack = await (await fetch('../../packs/generated/english-letterpaths-print.json')).json();
      const unit = pack.units.i;
      const holder = document.createElement('div');
      holder.style.cssText = 'position:absolute;left:-10000px;top:0';document.body.appendChild(holder);
      const writer = new Scribing(holder, { width: 400, height: 400, padding: 24, drawingFadeDuration: 0 });
      const load = [], gesture = [];
      try {
        for (let i = 0; i < 45; i++) {
          let start = performance.now(); await writer.setUnit(unit);
          if (i >= 5) load.push(performance.now() - start);
          await writer.quizUnit();
          const quiz = writer._unitQuiz;
          const p = writer._positioner;
          for (const stroke of writer._character.unit.strokes) {
            const points = stroke.points.map(point => ({ x: point.x * p.scale + p.xOffset, y: p.height - p.yOffset - point.y * p.scale }));
            start = performance.now();
            quiz.startUserStroke(points[0]);
            points.slice(1).forEach(point => quiz.continueUserStroke(point));
            quiz.endUserStroke();
            if (i >= 5) gesture.push(performance.now() - start);
          }
          if (quiz._isActive) throw new Error('Benchmark source replay did not complete');
        }
      } finally { writer.destroy();holder.remove(); }
      const stats = values => { values.sort((a,b)=>a-b);return { samples: values.length, p50ms: values[Math.ceil(values.length * .5)-1], p95ms: values[Math.ceil(values.length * .95)-1] }; };
      return { userAgent: navigator.userAgent, fixture: 'letterpaths print i; supplied-model replay', warmups: 5, compileAndMount: stats(load), directGestureCalls: stats(gesture), limitation: 'Headless desktop Chromium; synthetic source replay, not physical-device or human-input validation.' };
    });
    assert.deepEqual(external, [], 'No external runtime network requests');
    assert.deepEqual(errors, [], 'No uncaught browser errors');
    const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    console.log(JSON.stringify({ status: 'passed', bundleSHA256: digest('dist/scribing.js'), catalogSHA256: digest('packs/generated/catalog.json'), browser: await browser.version(), checks, externalRequests: external.length, pageErrors: errors, benchmark }, null, 2));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
