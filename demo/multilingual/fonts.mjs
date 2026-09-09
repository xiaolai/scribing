import { createFontProvider } from '../../extras/fonts/provider.mjs';
import { prepareFontAnimation } from '../../extras/fonts/animation.mjs';
const $ = (id) => document.getElementById(id);
const root = new URL('../../', import.meta.url);
let guideController,
  guideGeneration = 0,
  preparedAnimation,
  animationPreparation,
  animationReady = false,
  catalog,
  provider,
  writer,
  controller,
  generation = 0,
  custom,
  reference = true,
  ready = false,
  replaySerial = 0;
const actionIds = [
  'font-animate',
  'font-stop',
  'font-trace',
  'font-copy',
  'font-reference',
  'font-check',
  'font-replay',
  'font-clear',
];
function buttons(value) {
  actionIds.forEach((id) => ($(id).disabled = !value));
}
function invalidate() {
  guideGeneration++;
  guideController?.abort();
  $('font-retry-guide').hidden = true;
  $('font-animate').textContent = 'Prepare guide';
  preparedAnimation = undefined;
  animationReady = false;
  animationPreparation = undefined;
  $('font-animation-note').textContent = '';
  generation++;
  replaySerial++;
  controller?.abort();
  controller = new AbortController();
  writer?.destroy();
  writer = undefined;
  ready = false;
  buttons(false);
  $('font-area').replaceChildren();
  $('font-area').setAttribute('aria-busy', 'true');
  $('font-result').textContent = '';
  return generation;
}
function selected() {
  return catalog.scripts.find((s) => s.id === $('font-script').value);
}
function option(value, text) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = text;
  return o;
}
function textForSample() {
  const s = selected();
  return s.id === 'english' ? 'A' : s.examples[0].text;
}
function scriptControls() {
  const s = selected();
  $('font-family').replaceChildren(
    ...s.fontIds.map((id) => {
      const font = catalog.fonts.find((candidate) => candidate.id === id);
      return option(id, font.name);
    }),
  );
  $('font-sample').replaceChildren(
    ...[...new Set([...s.examples.map((e) => e.text), ...s.inventory])].map((text) =>
      option(text, text),
    ),
  );
  $('font-text').value = textForSample();
  $('font-sample').value = $('font-text').value;
  custom = undefined;
  $('font-file').value = '';
}
function updateReference() {
  $('font-reference').textContent = reference ? 'Hide reference' : 'Show reference';
  $('font-reference').setAttribute('aria-pressed', String(reference));
}
function compare() {
  if (!ready) return;
  const r = writer.check();
  $('font-result').textContent = r.hasInput
    ? `Reference area covered: ${Math.round(r.targetCoverage * 100)}%. Ink inside reference: ${Math.round(r.userAlignment * 100)}%. This compares shape only; it does not judge stroke order or handwriting correctness.`
    : 'Draw some ink first. These are shape comparisons, with no pass/fail score.';
}
function prepareGuide() {
  const token = generation,
    guideToken = ++guideGeneration,
    currentWriter = writer;
  guideController?.abort();
  guideController = new AbortController();
  preparedAnimation = undefined;
  animationReady = false;
  $('font-animate').disabled = true;
  $('font-animate').textContent = 'Preparing guide…';
  $('font-retry-guide').hidden = true;
  $('font-animation-note').textContent =
    'Loading source plans and preparing this exact typeface…';
  animationPreparation = prepareFontAnimation(currentWriter.getShape(), {
    signal: guideController.signal,
  })
    .then((plan) => {
      if (token !== generation || guideToken !== guideGeneration) return;
      preparedAnimation = plan;
      animationReady = true;
      const supplied = plan.provenance === 'source-adapted';
      $('font-animate').disabled = false;
      $('font-animate').textContent = supplied ? 'Animate strokes' : 'Reveal shape';
      const PROVENANCE_LABELS = {
        'source-adapted': 'Source-adapted stroke plan',
        mixed: 'Mixed source and generated shape reveal',
        generated: 'Generated shape reveal',
      };
      const label = PROVENANCE_LABELS[plan.provenance];
      $('font-animation-note').textContent =
        `${label} · ${plan.strokes.length} ${supplied ? 'strokes' : 'paths'}. ${supplied ? 'Follows the supplied stroke plan, fitted to this font.' : 'This reveals the selected font shape; it does not demonstrate conventional handwriting stroke order.'}`;
    })
    .catch((error) => {
      if (
        token !== generation ||
        guideToken !== guideGeneration ||
        error.name === 'AbortError'
      )
        return;
      $('font-animate').disabled = true;
      $('font-animate').textContent = 'Guide unavailable';
      $('font-retry-guide').hidden = false;
      $('font-animation-note').textContent =
        error.name === 'MotorSourceError'
          ? `Stroke source could not be loaded. ${error.message} Restore the demo server and choose Retry. Your font and ink remain available.`
          : `Guide preparation failed: ${error.message} Choose Retry. Your font and ink remain available.`;
      throw error;
    });
  animationPreparation.catch(() => {});
}
async function load() {
  const token = invalidate();
  if ($('mode').value !== 'fonts') return;
  const s = selected(),
    text = $('font-text').value,
    fontId = $('font-family').value;
  $('font-status').textContent = custom
    ? `Loading ${custom.name}…`
    : `Loading ${catalog.fonts.find((f) => f.id === fontId).name}…`;
  try {
    const shape = custom
      ? await provider.shapeCustom(
          { text, bytes: custom.bytes, name: custom.name, scriptId: s.id },
          { signal: controller.signal },
        )
      : await provider.shape(
          { text, fontId, scriptId: s.id },
          { signal: controller.signal },
        );
    if (token !== generation) return;
    const area = $('font-area'),
      width = Math.max(64, Math.floor(area.clientWidth) - 2),
      height = Math.max(64, Math.floor(area.clientHeight) - 2);
    writer = Scribing.createFontWriter(area, {
      width,
      height,
      padding: 30,
      renderer: $('font-renderer').value,
      onChange: compare,
    });
    await writer.setShape(shape);
    if (token !== generation) {
      writer?.destroy();
      return;
    }
    writer.startTrace();
    reference = true;
    updateReference();
    ready = true;
    buttons(true);
    area.setAttribute('aria-busy', 'false');
    $('font-status').textContent =
      `Ready: ${s.name} · ${shape.font.name} · ${shape.glyphs.length} shaped glyph${shape.glyphs.length === 1 ? '' : 's'}`;
    $('font-note').textContent = [
      s.fontChoiceNote || 'Switch typefaces to compare their actual outlines.',
      shape.direction === 'ttb' ? 'This script uses a vertical glyph run.' : '',
      custom ? 'Local font selected.' : 'Bundled fonts load from this local site.',
    ]
      .filter(Boolean)
      .join(' ');
    $('font-result').textContent =
      'Trace follows the reference. Copy from memory hides it.';
    prepareGuide();
  } catch (e) {
    if (token !== generation || e.name === 'AbortError') return;
    ready = false;
    buttons(false);
    $('font-area').setAttribute('aria-busy', 'false');
    $('font-status').textContent = `Unable to show this text: ${e.message}`;
  }
}
$('font-script').addEventListener('change', () => {
  scriptControls();
  load();
});
$('font-family').addEventListener('change', () => {
  custom = undefined;
  $('font-file').value = '';
  load();
});
$('font-sample').addEventListener('change', () => {
  $('font-text').value = $('font-sample').value;
  load();
});
$('font-renderer').addEventListener('change', load);
$('font-form').addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});
$('font-text').addEventListener('input', () => {
  invalidate();
  $('font-status').textContent = 'Text changed. Choose Use text to load its outlines.';
});
$('font-file').addEventListener('change', async () => {
  const token = invalidate(),
    file = $('font-file').files[0];
  custom = undefined;
  if (!file) {
    load();
    return;
  }
  $('font-status').textContent = 'Reading local font…';
  try {
    if (file.size > 32 * 1024 * 1024) throw new Error('Choose a font up to 32 MiB.');
    const bytes = await file.arrayBuffer();
    if (token !== generation) return;
    custom = { bytes, name: file.name };
    load();
  } catch (e) {
    if (token === generation) {
      $('font-status').textContent = e.message;
      $('font-area').setAttribute('aria-busy', 'false');
    }
  }
});
$('font-reset').addEventListener('click', () => {
  custom = undefined;
  $('font-file').value = '';
  load();
});

$('font-retry-guide').addEventListener('click', () => {
  if (ready) prepareGuide();
});
$('font-animate').addEventListener('click', async () => {
  if (!animationReady) return;
  const token = generation,
    serial = ++replaySerial,
    supplied = preparedAnimation.provenance === 'source-adapted';
  $('font-result').textContent = supplied
    ? 'Animating supplied strokes…'
    : 'Revealing this font shape…';
  try {
    await animationPreparation;
    if (token !== generation || serial !== replaySerial || !animationReady) return;
    writer.cancel();
    await writer.setAnimation(preparedAnimation);
    if (token !== generation || serial !== replaySerial) return;
    reference = true;
    writer.showReference();
    updateReference();
    $('font-result').textContent = supplied
      ? 'Animating supplied strokes…'
      : 'Revealing this font shape…';
    await writer.animate({ speed: Number($('font-speed').value) });
    if (token === generation && serial === replaySerial)
      $('font-result').textContent = supplied
        ? 'Stroke animation finished. Trace or copy the same font.'
        : 'Shape reveal finished. Trace or copy the same font.';
  } catch (error) {
    if (token === generation && serial === replaySerial)
      $('font-result').textContent = error.message;
  }
});
$('font-stop').addEventListener('click', () => {
  replaySerial++;
  writer?.cancel();
  $('font-result').textContent = 'Stopped.';
});
$('font-speed').addEventListener('change', () => {
  replaySerial++;
  writer?.cancel();
  $('font-result').textContent = 'Speed changed. Choose the guide action to play again.';
});
$('font-trace').addEventListener('click', () => {
  replaySerial++;
  writer.startTrace();
  reference = true;
  updateReference();
  $('font-result').textContent = 'Trace the reference shape.';
});
$('font-copy').addEventListener('click', () => {
  replaySerial++;
  writer.startCopy();
  reference = false;
  updateReference();
  $('font-result').textContent =
    'Copy the shape from memory. Show reference when you want to compare.';
});
$('font-reference').addEventListener('click', () => {
  reference = !reference;
  reference ? writer.showReference() : writer.hideReference();
  updateReference();
});
$('font-check').addEventListener('click', compare);
$('font-clear').addEventListener('click', () => {
  replaySerial++;
  writer.clear();
  $('font-result').textContent = 'Ink cleared.';
});
$('font-replay').addEventListener('click', async () => {
  const token = generation,
    serial = ++replaySerial;
  $('font-result').textContent = 'Replaying your recorded ink…';
  await writer.replay();
  if (token === generation && serial === replaySerial)
    $('font-result').textContent =
      'Your ink replay finished. The guide action demonstrates the font; Replay plays only your recorded ink.';
});
$('mode').addEventListener('change', () => {
  invalidate();
  const formal = $('mode').value === 'fonts';
  $('font-view').hidden = !formal;
  $('ordered-view').hidden = formal;
  if (formal) {
    $('ordered-frame').removeAttribute('src');
    load();
  } else $('ordered-frame').src = 'ordered.html';
});
let resizeFrame;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    if (writer && ready) {
      replaySerial++;
      const a = $('font-area');
      writer.updateDimensions({
        width: Math.max(64, Math.floor(a.clientWidth) - 2),
        height: Math.max(64, Math.floor(a.clientHeight) - 2),
        padding: 30,
      });
    }
  });
}).observe($('font-area'));
window.addEventListener('pagehide', () => {
  invalidate();
  provider?.destroy();
});
window.addEventListener('pageshow', async (event) => {
  if (event.persisted && catalog) {
    const scriptRanges = await fetch(new URL(catalog.rangeFile, root)).then((r) =>
      r.json(),
    );
    provider = createFontProvider({ catalog, scriptRanges, baseUrl: root });
    await load();
  }
});
try {
  [catalog] = await Promise.all([
    fetch(new URL('fonts/catalog.json', root)).then((r) => {
      if (!r.ok) throw new Error('Local catalog is unavailable');
      return r.json();
    }),
  ]);
  const scriptRanges = await fetch(new URL(catalog.rangeFile, root)).then((r) =>
    r.json(),
  );
  provider = createFontProvider({ catalog, scriptRanges, baseUrl: root });
  $('font-script').replaceChildren(...catalog.scripts.map((s) => option(s.id, s.name)));
  scriptControls();
  const summary = document.createElement('p');
  summary.textContent = `${catalog.fonts.length} bundled fonts across ${catalog.scripts.length} script/language entries. ${catalog.totals.sourcePacks} old source packs: 100 with exact Unicode text, 39 with independent replacement inventories, and 10 without a verified mapping. These are different coverage claims.`;
  $('font-coverage').append(summary);
  const gap = document.createElement('p');
  gap.textContent =
    'Known source-text font gap: 𧒑 (U+27491), from japanese-kanji-274. It is rejected explicitly. Numbered Omniglot source classes have not been guessed or converted.';
  $('font-coverage').append(gap);
  const list = document.createElement('ul');
  catalog.sourceCoverage
    .filter((c) => c.status === 'unmapped')
    .forEach((c) => {
      const li = document.createElement('li');
      li.textContent = `${c.packId}: ${c.reason}`;
      list.append(li);
    });
  $('font-coverage').append(list);
  await load();
} catch (e) {
  $('font-status').textContent = `Unable to start: ${e.message}`;
  $('font-area').setAttribute('aria-busy', 'false');
}
