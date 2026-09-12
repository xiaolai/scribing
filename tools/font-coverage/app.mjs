// Reports what stroke order Scribing can produce for a font the user already has.
//
// The point of this tool is that it runs the shipped runtime rather than a model of it.
// A report produced by a reimplementation would be a guess about the library's output;
// this one is the library's output, so a tier shown here is the tier a caller will get.
// Everything stays in the page: the font is read from the local file, and the only
// network traffic is this repository's own motor data and the HarfBuzz shaper.
import { createFontProvider } from '../../extras/fonts/provider.mjs';
import { prepareFontAnimation } from '../../extras/fonts/animation.mjs';

const ROOT = new URL('../../', import.meta.url);
const MAX_FONT_BYTES = 32 * 1024 * 1024;
const TIERS = {
  'source-adapted': "The model's own geometry was fitted onto the outline.",
  'source-ordered': "The font's skeleton is drawn in the model's order.",
  mixed: 'Some components came from the model and some were generated.',
  generated: 'Ordered by shape alone; no model applied to this glyph.',
  missing: 'The font has no glyph for this character.',
  failed: 'Preparation raised an error.',
};
const codepointOf = (char) =>
  'U+' + char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
const tally = (rows) =>
  rows.reduce((acc, r) => ((acc[r.tier] = (acc[r.tier] || 0) + 1), acc), {});
const el = (id) => document.getElementById(id);
const dom = {
  drop: el('drop'),
  file: el('file'),
  fontStatus: el('font-status'),
  script: el('script'),
  detect: el('detect'),
  resetChars: el('reset-chars'),
  chars: el('chars'),
  charsStatus: el('chars-status'),
  run: el('run'),
  cancel: el('cancel'),
  export: el('export'),
  progress: el('progress'),
  runStatus: el('run-status'),
  summaryPanel: el('summary-panel'),
  summary: el('summary'),
  grid: el('grid'),
};

const state = {
  provider: null,
  scripts: new Map(),
  font: null, // { name, bytes, digest }
  report: null,
  running: false,
  // Every asynchronous commit carries the generation it started in. Reading the live
  // font after an await let a slow load overwrite a newer selection, and let a run
  // that outlived a font change attribute one font's glyphs to another.
  generation: 0,
  controller: null,
};

function say(node, message, isError) {
  node.textContent = message;
  node.classList.toggle('error', !!isError);
}

/** Characters, not UTF-16 units: one astral codepoint is one glyph to prepare. */
const chars = (text) => Array.from(text).filter((c) => !/\s/.test(c));

async function init() {
  try {
    const [catalog, scriptRanges] = await Promise.all([
      fetch(new URL('fonts/catalog.json', ROOT)).then((r) => r.json()),
      fetch(new URL('fonts/script-ranges.json', ROOT)).then((r) => r.json()),
    ]);
    state.provider = createFontProvider({
      catalog,
      scriptRanges,
      baseUrl: ROOT.href,
    });
    // Scripts with normative motor data come first: those are the ones where a tier
    // above `generated` is even possible, and burying them under 110 others hid that.
    const sorted = [...catalog.scripts].sort(
      (a, b) =>
        Number(b.strokeOrder === 'normative') - Number(a.strokeOrder === 'normative') ||
        a.name.localeCompare(b.name),
    );
    for (const s of sorted) {
      state.scripts.set(s.id, s);
      const option = document.createElement('option');
      option.value = s.id;
      option.textContent =
        s.name + (s.strokeOrder === 'normative' ? ' — has stroke order' : '');
      dom.script.append(option);
    }
    dom.script.value = 'english';
    resetChars();
  } catch (cause) {
    say(dom.fontStatus, 'Could not load the catalogue: ' + cause.message, true);
  }
}

function resetChars() {
  const script = state.scripts.get(dom.script.value);
  dom.chars.value = (script?.inventory || []).join('');
  countChars();
}

function countChars() {
  const n = chars(dom.chars.value).length;
  const script = state.scripts.get(dom.script.value);
  const note =
    script?.strokeOrder === 'normative'
      ? ''
      : ' This script has no motor data, so every glyph will be generated.';
  say(dom.charsStatus, `${n} character${n === 1 ? '' : 's'} queued.` + note);
  // Without the provider check, Run was clickable before the catalogue finished loading
  // and after it failed, and every character then died on a null provider.
  dom.run.disabled = !state.provider || !state.font || !n || state.running;
}

async function digestOf(bytes) {
  if (!globalThis.crypto?.subtle) return null;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function loadFont(file) {
  if (!file) return;
  if (file.size > MAX_FONT_BYTES) {
    say(dom.fontStatus, 'That font is larger than the 32 MiB limit.', true);
    return;
  }
  const mine = ++state.generation;
  say(dom.fontStatus, `Reading ${file.name}…`);
  let font;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    font = { name: file.name, bytes, digest: await digestOf(bytes) };
  } catch (cause) {
    // Both the read and the digest can reject. Neither had a handler, so a failure
    // surfaced only as an unhandled rejection and the page kept its previous font.
    if (mine === state.generation) say(dom.fontStatus, 'Could not read that font.', true);
    return;
  }
  // A larger file picked first can finish last. Without this the earlier selection won.
  if (mine !== state.generation) return;
  state.font = font;
  say(
    dom.fontStatus,
    `${file.name} — ${(file.size / 1024).toFixed(0)} KB${
      font.digest ? ' · sha256 ' + font.digest.slice(0, 12) : ''
    }`,
  );
  countChars();
}

/** Shapes one character with an explicit font, or throws the provider's own error. */
const shapeOne = (text, scriptId, font, signal) =>
  state.provider.shapeCustom(
    { text, bytes: font.bytes, name: font.name, scriptId },
    { signal },
  );

/** Codes that mean "this font does not cover that character", as opposed to a fault. */
const COVERAGE_MISS = new Set(['MISSING_GLYPH', 'INVALID_TEXT', 'EMPTY_OUTLINE']);

async function detectScript() {
  if (!state.font || state.running) return;
  const font = state.font,
    mine = state.generation;
  say(dom.runStatus, 'Detecting…');
  // Ask in the order the list is sorted, so a font covering several scripts lands on
  // one with motor data rather than on whichever range happens to sort first. Probing
  // several characters matters for subset fonts: the first inventory entry alone
  // reported "no matching script" for fonts that clearly cover it.
  for (const option of dom.script.options) {
    const script = state.scripts.get(option.value);
    const samples = (script?.inventory || []).slice(0, 4);
    for (const sample of samples) {
      try {
        await shapeOne(sample, script.id, font);
      } catch (cause) {
        // Only a coverage miss means "try the next script". Anything else is a real
        // fault, and swallowing it reported a broken font as an unmatched one.
        if (COVERAGE_MISS.has(cause?.code)) continue;
        if (mine === state.generation && state.font === font)
          say(dom.runStatus, 'Detection failed: ' + (cause?.message || cause), true);
        return;
      }
      // The generation alone is not enough: `loadFont` raises it when a read starts and
      // commits when it finishes, so a font that was already pending when detection
      // began commits inside the captured generation. Compare the font itself too.
      if (mine !== state.generation || state.font !== font) return;
      dom.script.value = script.id;
      resetChars();
      say(dom.runStatus, `Detected ${script.name}.`);
      return;
    }
  }
  if (mine === state.generation && state.font === font)
    say(dom.runStatus, 'No catalogued script matched this font.', true);
}

function ramp(index, count) {
  // Stroke index is an ordered magnitude, so the ramp is one hue light-to-dark. The
  // number printed at each start is what carries the order for a reader who cannot
  // separate the steps by colour.
  // Both ramps run from nearest the surface to furthest from it, so every step stays
  // visible against its own background. On a dark surface that means dim to bright,
  // which is the reverse of the light ramp rather than a flip of the same values.
  // A lone stroke carries no order, so it takes the high-contrast end instead of the
  // pale one; at t=0 a single-stroke letter was the hardest glyph on the page to read.
  const t = count < 2 ? 1 : index / (count - 1);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? `hsl(152 40% ${50 + t * 36}%)` : `hsl(152 46% ${60 - t * 38}%)`;
}

function drawCell(char, result) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  if (result.strokes) {
    const [bx, by, bw, bh] = result.bounds;
    // Every cell renders into the same square box so a tall glyph does not tower over
    // the row, and the box is padded so a stroke number sitting on the ink's top edge
    // is not clipped away. `extent` is what the viewport scales by, so sizing the
    // marks against it keeps them the same size on screen across glyphs.
    const extent = Math.max(bw, bh),
      pad = extent * 0.16,
      side = extent + 2 * pad;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute(
      'viewBox',
      `${bx + bw / 2 - side / 2} ${by + bh / 2 - side / 2} ${side} ${side}`,
    );
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${char}, ${result.strokes.length} strokes`);
    // Font units put y upward and SVG puts it downward, so the group mirrors about the
    // box. Without this every glyph renders upside down.
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(0 ${2 * by + bh}) scale(1 -1)`);
    const width = extent / 19;
    result.strokes.forEach((stroke, index) => {
      const colour = ramp(index, result.strokes.length);
      const node = document.createElementNS(
        'http://www.w3.org/2000/svg',
        stroke.kind === 'dot' ? 'circle' : 'polyline',
      );
      if (stroke.kind === 'dot') {
        node.setAttribute('cx', stroke.points[0][0]);
        node.setAttribute('cy', stroke.points[0][1]);
        node.setAttribute('r', width);
        node.setAttribute('fill', colour);
      } else {
        node.setAttribute('points', stroke.points.map((p) => p.join(',')).join(' '));
        node.setAttribute('fill', 'none');
        node.setAttribute('stroke', colour);
        node.setAttribute('stroke-width', width);
        node.setAttribute('stroke-linecap', 'round');
        node.setAttribute('stroke-linejoin', 'round');
      }
      g.append(node);
    });
    svg.append(g);
    result.strokes.forEach((stroke, index) => {
      const [px, py] = stroke.points[0];
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.textContent = String(index + 1);
      label.setAttribute('x', px);
      label.setAttribute('y', 2 * by + bh - py - width);
      label.setAttribute('font-size', side / 12);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', 'currentColor');
      label.setAttribute('opacity', '0.65');
      svg.append(label);
    });
    cell.append(svg);
  }
  const caption = document.createElement('div');
  caption.className = 'ch';
  caption.textContent =
    char +
    '  ' +
    codepointOf(char) +
    (result.strokes ? `  ·  ${result.strokes.length}` : '');
  cell.append(caption);
  const badge = document.createElement('span');
  badge.className = 'badge ' + result.tier;
  badge.textContent = result.tier;
  badge.title = TIERS[result.tier] + (result.error ? ' ' + result.error : '');
  cell.append(badge);
  dom.grid.append(cell);
}

function renderSummary(rows) {
  dom.summary.replaceChildren();
  const total = rows.length;
  const counts = tally(rows);
  for (const tier of Object.keys(TIERS)) {
    const n = counts[tier] || 0;
    if (!n) continue;
    const tr = document.createElement('tr');
    for (const [text, cls] of [
      [tier, ''],
      [String(n), 'n'],
      [((n / total) * 100).toFixed(1) + '%', 'n'],
      [TIERS[tier], ''],
    ]) {
      const td = document.createElement('td');
      td.className = cls;
      td.textContent = text;
      tr.append(td);
    }
    dom.summary.append(tr);
  }
  dom.summaryPanel.hidden = false;
}

async function run() {
  if (!state.provider || !state.font) return;
  const list = chars(dom.chars.value);
  if (!list.length) return;
  const scriptId = dom.script.value,
    // The whole run belongs to one font. Reading `state.font` per character let a font
    // swap mid-run produce a single report describing two different fonts.
    font = state.font,
    script = state.scripts.get(scriptId);
  state.controller = new AbortController();
  state.running = true;
  dom.run.disabled = dom.export.disabled = true;
  dom.cancel.disabled = false;
  dom.grid.replaceChildren();
  // The old summary described the previous run and sat beside the new results as they
  // accumulated, which read as though it were describing them.
  dom.summaryPanel.hidden = true;
  dom.progress.max = list.length;
  dom.progress.value = 0;
  const rows = [];
  const started = performance.now();
  for (const char of list) {
    if (state.controller.signal.aborted) break;
    const row = { char, tier: 'failed' };
    try {
      const shape = await shapeOne(char, scriptId, font, state.controller.signal);
      const animation = await prepareFontAnimation(shape, {
        signal: state.controller.signal,
      });
      // `mixed` is a tier the runtime really returns, for a syllable whose components
      // did not all fit. Rewriting it as `generated` contradicted this page's claim to
      // report the tier a caller actually gets.
      row.tier = animation.provenance;
      row.em = shape.em;
      row.bounds = shape.bounds;
      row.strokes = animation.strokes.map((s) => ({
        kind: s.kind,
        provenance: s.provenance,
        points: s.points,
        source: s.source,
      }));
    } catch (cause) {
      if (state.controller.signal.aborted) break;
      row.tier = cause?.code === 'MISSING_GLYPH' ? 'missing' : 'failed';
      row.error = cause?.message || String(cause);
    }
    rows.push(row);
    drawCell(char, row);
    dom.progress.value = rows.length;
    say(dom.runStatus, `${rows.length} of ${list.length}…`);
    // Hand the frame back so the grid fills in as it goes and Cancel stays live.
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
  const elapsed = ((performance.now() - started) / 1000).toFixed(1);
  const cancelled = state.controller.signal.aborted;
  renderSummary(rows);
  // The report carries its own font and completion state. Exporting from live state
  // attributed one font's strokes to whichever font happened to be loaded later.
  state.report = {
    scriptId,
    scriptName: script?.name,
    strokeOrder: script?.strokeOrder,
    font: { name: font.name, bytes: font.bytes.byteLength, sha256: font.digest },
    requested: list.length,
    complete: !cancelled,
    rows,
  };
  state.running = false;
  state.controller = null;
  dom.cancel.disabled = true;
  dom.export.disabled = false;
  countChars();
  say(
    dom.runStatus,
    `${cancelled ? 'Cancelled after' : 'Prepared'} ${rows.length} of ${list.length} character${
      list.length === 1 ? '' : 's'
    } in ${elapsed}s.`,
  );
}

function exportReport() {
  if (!state.report) return;
  // Everything here comes from the report, never from live state. Reading the current
  // font meant that running font A, loading font B, then downloading produced A's
  // strokes under B's name, digest and filename.
  const { scriptId, scriptName, strokeOrder, font, rows, requested, complete } =
    state.report;
  // Points are divided by the em so the export does not depend on the font's units,
  // which differ between families. y stays upward, as the runtime reports it.
  const payload = {
    tool: 'scribing-font-coverage',
    schemaVersion: 1,
    generated: new Date().toISOString(),
    font,
    script: { id: scriptId, name: scriptName, strokeOrder },
    coordinates: { units: 'em', yAxis: 'up' },
    // A cancelled run exported the same shape as a finished one, so a consumer could
    // not tell a partial audit from a complete one.
    run: { complete, requested, prepared: rows.length },
    summary: tally(rows),
    characters: rows.map((r) => ({
      char: r.char,
      codepoint: codepointOf(r.char),
      tier: r.tier,
      error: r.error,
      strokes: r.strokes?.map((s) => ({
        kind: s.kind,
        provenance: s.provenance,
        source: s.source,
        points: s.points.map(([x, y]) => [
          +(x / r.em).toFixed(5),
          +(y / r.em).toFixed(5),
        ]),
      })),
    })),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = font.name.replace(/\.[^.]+$/, '') + '.' + scriptId + '.coverage.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

dom.file.addEventListener('change', () => loadFont(dom.file.files[0]));
for (const type of ['dragenter', 'dragover'])
  dom.drop.addEventListener(type, (e) => {
    e.preventDefault();
    dom.drop.classList.add('over');
  });
for (const type of ['dragleave', 'drop'])
  dom.drop.addEventListener(type, (e) => {
    e.preventDefault();
    dom.drop.classList.remove('over');
    if (type === 'drop') loadFont(e.dataTransfer?.files?.[0]);
  });
dom.script.addEventListener('change', resetChars);
dom.chars.addEventListener('input', countChars);
dom.resetChars.addEventListener('click', resetChars);
dom.detect.addEventListener('click', detectScript);
dom.run.addEventListener('click', run);
dom.cancel.addEventListener('click', () => {
  // Aborting the signal stops the shaping and preparation already under way. Setting a
  // flag only stopped the loop between characters, so a slow glyph ignored Cancel.
  state.controller?.abort();
});
dom.export.addEventListener('click', exportReport);

// Read-only handle for the browser gate. The gate drives the real file input and the
// real buttons so a broken control still fails it; this only lets it read the result,
// which is otherwise locked inside the rendered grid.
globalThis.fontCoverageTool = { report: () => state.report, font: () => state.font };
await init();
