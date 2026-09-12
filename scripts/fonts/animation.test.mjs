import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decomposeHangul,
  hangulRegions,
  resample,
} from '../../extras/fonts/animation.mjs';

/**
 * Region splitting and point budgets in the optional animation runtime.
 *
 * The Hangul path is otherwise reached only by the Playwright font-animation gate, so a
 * boundary it declines wrongly would cost a 30-minute run to notice.
 */

test('a resampled stroke refuses a segment that would exceed the budget', () => {
  // Two points 1,000 apart expand to 500 samples at the default step.
  const far = [
    [0, 0],
    [1000, 0],
  ];
  assert.equal(resample(far).length, 501);
  // The budget used to be compared only after a whole stroke had been built, so a source
  // at the validator's million-point ceiling allocated roughly 128 million points first.
  assert.equal(resample(far, 2, 100), null);
  assert.equal(resample(far, 2, 0), null);
  // A budget that fits is still honoured exactly.
  assert.equal(resample(far, 2, 501).length, 501);
});

test('modern syllables decompose into the letters that are written', () => {
  assert.deepEqual(decomposeHangul('가').letters, ['ㄱ', 'ㅏ']);
  assert.deepEqual(decomposeHangul('한').letters, ['ㅎ', 'ㅏ', 'ㄴ']);
  assert.deepEqual(decomposeHangul('글').letters, ['ㄱ', 'ㅡ', 'ㄹ']);
  // A compound final is split into the parts the jamo pack can actually draw.
  assert.deepEqual(decomposeHangul('갃').letters, ['ㄱ', 'ㅏ', 'ㄱ', 'ㅅ']);
  // Outside modern precomposed Hangul, and multi-character input.
  assert.equal(decomposeHangul('a'), null);
  assert.equal(decomposeHangul('가나'), null);
});

/** The emptiest-row search registerKoreanPilot passes into hangulRegions. */
const makeCut = (ink, width) => (axis, lo, hi, otherLo, otherHi) => {
  let best = -1,
    score = Infinity;
  for (let k = Math.round(lo); k <= Math.round(hi); k++) {
    let sum = 0;
    for (let q = Math.round(otherLo); q <= Math.round(otherHi); q++)
      sum += axis === 'x' ? ink[q * width + k] : ink[k * width + q];
    const v = sum + Math.abs(k - (lo + hi) / 2) * 0.001;
    if (v < score) {
      best = k;
      score = v;
    }
  }
  return best;
};

test('a horizontal vowel whose bar reaches the top of the box is declined', () => {
  const width = 20,
    height = 20;
  const ink = new Uint8Array(width * height);
  // Rows 0..11 fully inked: the detected bar walks up to the top edge, leaving cut() an
  // empty range and making it return its -1 "not found" sentinel.
  for (let y = 0; y <= 11; y++) for (let x = 0; x < width; x++) ink[y * width + x] = 1;

  const cut = makeCut(ink, width);

  for (const finals of [[], ['ㄱ']]) {
    const regions = hangulRegions({
      vowel: 'ㅡ',
      finals,
      ink,
      width,
      box: [0, 0, 19, 19],
      cut,
    });
    // Previously returned regions containing -1: an inverted first region that masked
    // nothing, and a second one covering the whole box instead of the vowel's band.
    assert.equal(regions, null, `finals=${finals.length}`);
  }
});

test('a well-formed horizontal vowel still splits into regions', () => {
  const width = 20,
    height = 20;
  const ink = new Uint8Array(width * height);
  const set = (x, y) => (ink[y * width + x] = 1);
  // An initial near the top, a wide vowel bar across the middle, both clear of the edges.
  for (let y = 3; y <= 6; y++) for (let x = 6; x <= 13; x++) set(x, y);
  for (let y = 10; y <= 11; y++) for (let x = 2; x <= 17; x++) set(x, y);

  const cut = makeCut(ink, width);

  const regions = hangulRegions({
    vowel: 'ㅡ',
    finals: [],
    ink,
    width,
    box: [0, 0, 19, 19],
    cut,
  });
  assert.equal(regions.length, 2, 'initial and vowel');
  for (const [x1, y1, x2, y2] of regions) {
    assert.ok(y1 >= 0 && y2 >= y1, `region rows ${y1}..${y2} are a real range`);
    assert.ok(x1 >= 0 && x2 >= x1, `region cols ${x1}..${x2} are a real range`);
  }
  // The two regions partition the box vertically rather than overlapping it.
  assert.equal(regions[0][3] + 1, regions[1][1]);
});

/**
 * Regressions for the band window, reported from the native port in September 2026.
 *
 * The band search looked only between 0.3 and 0.56 of the ink box. That window was
 * tuned when 가, 한 and 글 were the only supported syllables, and all three put their
 * bar inside it. Without a batchim the vowel drops to the foot of the block, so the
 * window saw the initial instead and split it in half.
 */
test('a batchim-less bar at the foot of the box is found, not the initial above it', () => {
  const width = 24,
    height = 24;
  const ink = new Uint8Array(width * height);
  const set = (x, y) => (ink[y * width + x] = 1);
  // A wide initial in the upper half, a clear gap, then ㅡ's bar right at the foot:
  // the old window ended at row 13 and never saw the bar at 21.
  for (let y = 2; y <= 9; y++) for (let x = 4; x <= 19; x++) set(x, y);
  for (let y = 21; y <= 22; y++) for (let x = 1; x <= 22; x++) set(x, y);

  const regions = hangulRegions({
    vowel: 'ㅡ',
    finals: [],
    ink,
    width,
    box: [0, 0, 23, 23],
    cut: makeCut(ink, width),
  });
  assert.ok(regions, 'a clean gap above the bar is separable');
  assert.equal(regions.length, 2);
  const boundary = regions[0][3];
  assert.ok(
    boundary > 9 && boundary < 21,
    `the cut belongs in the gap, not inside the initial; got ${boundary}`,
  );
  // The initial's region must still hold all of the initial.
  assert.ok(regions[0][1] <= 2 && regions[1][3] >= 22);
});

test('a batchim-less vowel whose stem rises into the initial is declined', () => {
  const width = 24,
    height = 24;
  const ink = new Uint8Array(width * height);
  const set = (x, y) => (ink[y * width + x] = 1);
  // The same initial and bar, plus ㅗ's stem climbing from the bar up alongside the
  // initial. No horizontal line separates them, so no pair of rectangles can either.
  for (let y = 2; y <= 9; y++) for (let x = 4; x <= 19; x++) set(x, y);
  for (let y = 21; y <= 22; y++) for (let x = 1; x <= 22; x++) set(x, y);
  for (let y = 6; y <= 20; y++) for (let x = 11; x <= 12; x++) set(x, y);

  for (const vowel of ['ㅗ', 'ㅛ'])
    assert.equal(
      hangulRegions({
        vowel,
        finals: [],
        ink,
        width,
        box: [0, 0, 23, 23],
        cut: makeCut(ink, width),
      }),
      null,
      `${vowel} without a batchim cannot be held apart by rectangles`,
    );
});

test('the same vowel with a batchim is still laid out', () => {
  // A guard, not a regression pin: this held before the decline existed. It is what
  // stops the decline being widened to every ㅗ, which would lose 골 and 글. With a
  // batchim the block compresses and the stem clears the initial.
  const width = 24,
    height = 24;
  const ink = new Uint8Array(width * height);
  const set = (x, y) => (ink[y * width + x] = 1);
  for (let y = 2; y <= 6; y++) for (let x = 4; x <= 19; x++) set(x, y);
  for (let y = 10; y <= 11; y++) for (let x = 1; x <= 22; x++) set(x, y);
  for (let y = 16; y <= 20; y++) for (let x = 4; x <= 19; x++) set(x, y);

  const regions = hangulRegions({
    vowel: 'ㅗ',
    finals: ['ㄹ'],
    ink,
    width,
    box: [0, 0, 23, 23],
    cut: makeCut(ink, width),
  });
  assert.ok(regions, 'a batchim layout is unaffected by the decline');
  assert.equal(regions.length, 3, 'initial, vowel and batchim');
});
