const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

async function main() {
  const html = fs.readFileSync(path.join(__dirname, '../demo/index.html'), 'utf8');
  const script = fs.readFileSync(path.join(__dirname, '../demo/test.js'), 'utf8');
  assert(!html.includes('polyfill.io'), 'Demo must not load polyfill.io');
  const css = fs.readFileSync(path.join(__dirname, '../demo/styles.css'), 'utf8');
  assert(html.includes('name="viewport"'), 'Mobile demo requires a viewport declaration');
  // Collect every declaration that applies to a selector, across all the blocks that
  // name it. The old version took a substring from the first `\n<selector> {` it found,
  // so it silently read the wrong block whenever the selector appeared in a grouped
  // rule first, and broke outright on a whitespace change.
  const rule = (selector) => {
    const declarations = [];
    for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const names = selectors.split(',').map((name) => name.trim());
      if (names.includes(selector)) declarations.push(body);
    }
    assert(declarations.length > 0, `No CSS rule found for ${selector}`);
    // Normalize whitespace so assertions are about declarations, not formatting.
    return declarations.join(';').replace(/\s+/g, ' ');
  };
  assert(
    rule('#target').includes('width: calc(100% - 32px)'),
    'Writing area must fit narrow viewports',
  );
  assert(
    rule('#target').includes('aspect-ratio: 1'),
    'Writing area must retain square proportions',
  );
  assert(rule('#target svg').includes('width: 100%'), 'SVG must scale with its target');
  assert(
    rule('.actions').includes('auto-fit'),
    'Action buttons must wrap in narrow viewports',
  );

  const dom = new JSDOM(html, {
    url: 'https://example.test/demo/#%E0%A4%A',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  const loads = [];
  let instances = 0;
  class Writer {
    constructor() {
      instances++;
      this.shown = false;
      window.document
        .querySelector('#target')
        .appendChild(
          window.document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
        );
    }
    setCharacter(character) {
      return new Promise((resolve, reject) => loads.push({ character, resolve, reject }));
    }
    hideCharacter() {
      this.shown = false;
      return Promise.resolve();
    }
    showCharacter() {
      this.shown = true;
      return Promise.resolve();
    }
    showOutline() {
      return Promise.resolve();
    }
    hideOutline() {
      return Promise.resolve();
    }
    animateCharacter() {
      return Promise.resolve();
    }
    quiz() {
      return Promise.resolve();
    }
  }
  window.Scribing = Writer;
  window.eval(script);
  const start = window.onload;
  window.onload = null;
  start();
  const $ = (selector) => window.document.querySelector(selector);
  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
  };
  const submit = (character) => {
    $('.js-char').value = character;
    $('.js-char').dispatchEvent(new window.Event('input'));
    $('.js-char-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
  };
  assert.strictEqual(
    loads[0].character,
    '我',
    'Malformed fragment must use default character',
  );
  assert($('.js-animate').disabled, 'Actions must be disabled while loading');
  assert.strictEqual($('#target').getAttribute('aria-busy'), 'true');
  loads[0].resolve();
  await flush();
  assert(!$('.js-animate').disabled);
  $('.js-toggle').click();
  assert(window.writer.shown, 'First toggle must reveal the initially hidden character');
  assert.strictEqual($('.js-toggle').getAttribute('aria-pressed'), 'true');
  submit('𠮷');
  assert.strictEqual(
    loads[1].character,
    '𠮷',
    'Supplementary characters must remain intact',
  );
  submit('你');
  loads[1].resolve();
  await flush();
  assert($('.js-animate').disabled, 'Stale completion must not enable controls');
  loads[2].reject(new Error('offline'));
  await flush();
  assert($('#status').textContent.includes('Could not load 你'));
  assert.strictEqual($('#target').getAttribute('aria-busy'), 'false');
  assert($('.js-quiz').disabled);
  submit('好');
  loads[3].resolve();
  await flush();
  assert(!$('.js-quiz').disabled, 'Retry must restore actions');
  assert.strictEqual(
    instances,
    1,
    'Character updates must reuse the writer and listeners',
  );
  submit('你好');
  assert.strictEqual(loads.length, 4, 'Multiple characters must not start a load');
  assert($('.js-char').validationMessage.includes('one character'));
  dom.window.close();

  // Exercise the real bundle as well: a stub cannot catch SVG viewport clipping.
  const realDom = new JSDOM(html, {
    url: 'https://example.test/demo/',
    runScripts: 'outside-only',
  });
  const realWindow = realDom.window;
  realWindow.eval(fs.readFileSync(path.join(__dirname, '../dist/scribing.js'), 'utf8'));
  const Scribing = realWindow.Scribing;
  const characterData = require('hanzi-writer-data/我.json');
  realWindow.Scribing = class extends Scribing {
    constructor(target, options) {
      super(target, { ...options, charDataLoader: () => characterData });
    }
  };
  realWindow.eval(script);
  const realStart = realWindow.onload;
  realWindow.onload = null;
  realStart();
  await new Promise((resolve) => setTimeout(resolve, 0));
  const svg = realWindow.document.querySelector('#target svg');
  assert.strictEqual(
    svg.getAttribute('viewBox'),
    '0 0 400 400',
    'The real SVG needs a logical viewBox to scale without clipping',
  );
  assert(svg.querySelector('path'), 'Real character paths must render');
  const realToggle = realWindow.document.querySelector('.js-toggle');
  realWindow.document.querySelector('.js-animate').click();
  assert.strictEqual(
    realToggle.getAttribute('aria-pressed'),
    'true',
    'Animate must immediately synchronize character visibility',
  );
  realToggle.click();
  assert.strictEqual(
    realToggle.getAttribute('aria-pressed'),
    'false',
    'Toggle after Animate must hide the character',
  );
  realWindow.writer.destroy();
  realDom.window.close();
  console.log(
    'Demo smoke passed: Unicode input, loading/retry, stale loads, writer reuse, and real-bundle SVG scaling/visibility.',
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
