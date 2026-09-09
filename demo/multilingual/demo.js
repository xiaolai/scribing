(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const actions = ['animate', 'guided', 'practice', 'show', 'stop', 'find'];
  let catalog;
  let pack;
  let presentation;
  let provider;
  let writer;
  let generation = 0;
  let action = 0;
  let pending;
  const status = (text) => {
    $('status').textContent = text;
  };
  const options = (select, entries) => {
    select.textContent = '';
    entries.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    });
  };
  const busy = (value) => {
    $('writing-area').setAttribute('aria-busy', String(value));
    actions.forEach((id) => {
      $(id).disabled = value;
    });
    $('unit').disabled = value;
    $('plan').disabled = value;
    $('renderer').disabled = value;
    $('tolerance').disabled = value;
  };
  const stop = () => {
    action++;
    if (writer) writer.cancelQuiz();
  };
  const size = () => Math.max(64, $('writing-area').clientWidth);
  const createWriter = () => {
    if (writer) writer.destroy();
    writer = new Scribing('writing-area', {
      width: size(),
      height: size(),
      padding: 24,
      renderer: $('renderer').value,
      showCharacter: true,
      showOutline: true,
      strokeColor: '#242424',
      highlightColor: '#246bb0',
      outlineColor: '#dddddd',
      drawingColor: '#246bb0',
    });
  };
  const loadJSON = async (path, signal) => {
    const response = await fetch(path, { signal });
    if (!response.ok)
      throw new Error(
        `Cannot load ${path} (${response.status}). Build the data packs and serve the repository over HTTP.`,
      );
    return response.json();
  };
  const loadUnit = async (id) => {
    const token = ++generation;
    stop();
    busy(true);
    status(`Loading ${id}…`);
    try {
      await writer.setUnit({ id, provider });
      if (token !== generation) return;
      const unit = await writer.getUnitData();
      if (token !== generation) return;
      $('unit').value = unit.id;
      $('text').value = unit.text;
      options(
        $('plan'),
        unit.plans.map((plan) => [plan.id, plan.id]),
      );
      $('plan').value = unit.defaultPlanId;
      $('alternatives').disabled = unit.plans.length < 2;
      $('alternatives').checked = false;
      const AUTHORED_NOTE =
        'Original clean print models with a defined stroke plan, authored for this project. These are not certified curriculum models.';
      const RECORDED_NOTE =
        'This model comes from a recorded observation. Omniglot participants copied displayed symbols; the observed order is not a native teaching recommendation.';
      const CONVERTED_NOTE =
        'Supplied geometry has been converted for replay and practice; it is not a new recording or a certified teaching model.';
      let provenanceNote = CONVERTED_NOTE;
      if (presentation === 'textbook') provenanceNote = AUTHORED_NOTE;
      else if (pack.provenance === 'recorded') provenanceNote = RECORDED_NOTE;
      $('details').textContent =
        `${unit.id}: ${unit.motorStrokes.length} motor strokes; ${unit.plans.length} supplied order plan(s). ${unit.style || 'Source-defined style'}. ${provenanceNote}`;
      busy(false);
      status(
        `Ready: ${unit.text} · ${unit.motorStrokes.length} strokes. ${pack.status}.`,
      );
    } catch (error) {
      if (token !== generation) return;
      status(error.message || String(error));
      // Allow recovery through another real unit or an explicit lookup.
      $('unit').disabled = false;
      $('find').disabled = false;
    }
  };
  const loadPack = async () => {
    const token = ++generation;
    stop();
    busy(true);
    if (writer) {
      writer.destroy();
      writer = undefined;
    }
    provider = undefined;
    $('source').textContent = '';
    $('details').textContent = '';
    if (pending) pending.abort();
    pending = new AbortController();
    status('Loading local source…');
    try {
      const entry = catalog.packs.find((item) => item.id === $('pack').value);
      if (!entry) throw new Error('No source selected.');
      const loadedPack = await loadJSON(
        `../../packs/generated/${entry.file}`,
        pending.signal,
      );
      if (token !== generation) return;
      pack = loadedPack;
      presentation = entry.presentation;
      $('tolerance').value = pack.provenance === 'recorded' ? '1.5' : '1';
      provider = Scribing.createDataProvider(pack);
      $('source').textContent =
        `${pack.name} · ${pack.status} · ${pack.provenance} · ${pack.license} · ${pack.source.name} (${pack.source.revision || 'see source manifest'})`;
      options(
        $('unit'),
        Object.entries(pack.units).map(([id, unit]) => [
          id,
          unit.text === id ? id : `${unit.text} — ${id}`,
        ]),
      );
      createWriter();
      await loadUnit($('unit').value);
    } catch (error) {
      if (token !== generation || error.name === 'AbortError') return;
      status(error.message || String(error));
    }
  };
  const selectView = () => {
    const models = $('view').value === 'models';
    $('view-help').textContent = models
      ? 'Original clean English and Korean print models, plus KanjiVG ordered vector models. Each has a defined stroke plan; none is certified as a teaching curriculum.'
      : 'Source samples preserve supplied geometry and real, sometimes rough recorded observations. Recorded order reflects that sample, not a teaching recommendation.';
    const entries = catalog.packs.filter(
      (entry) => models === ['textbook', 'vector'].includes(entry.presentation),
    );
    options(
      $('pack'),
      entries.map((entry) => [
        entry.id,
        `${entry.name || entry.id} (${entry.unitCount} units)`,
      ]),
    );
    return loadPack();
  };
  const initialize = async () => {
    try {
      catalog = await loadJSON('../../packs/generated/catalog.json');
      const first = [
        'english-textbook',
        'korean-textbook',
        'japanese-kana',
        'japanese-grade-1',
      ];
      catalog.packs.sort(
        (a, b) =>
          (first.includes(a.id) ? first.indexOf(a.id) : 99) -
          (first.includes(b.id) ? first.indexOf(b.id) : 99),
      );
      await selectView();
    } catch (error) {
      status(error.message || String(error));
    }
  };
  const run = async (operation) => {
    stop();
    const token = action;
    try {
      await operation(token);
    } catch (error) {
      if (token === action) status(error.message || String(error));
    }
  };
  $('view').addEventListener('change', () => {
    if (catalog) selectView();
  });
  $('pack').addEventListener('change', loadPack);
  $('unit').addEventListener('change', () => loadUnit($('unit').value));
  $('renderer').addEventListener('change', () => {
    if (provider) {
      createWriter();
      loadUnit($('unit').value);
    }
  });
  $('plan').addEventListener('change', () => {
    stop();
    status('Order plan selected for animation and new practice sessions.');
  });
  $('tolerance').addEventListener('change', () => {
    stop();
    status(
      'Practice stopped. Matching tolerance changed; start a new session to use it.',
    );
  });
  $('lookup').addEventListener('submit', (event) => {
    event.preventDefault();
    if (provider) loadUnit($('text').value.trim());
  });
  $('retry').addEventListener('click', () => (catalog ? loadPack() : initialize()));
  $('animate').addEventListener('click', () =>
    run(async () => {
      status('Animating selected stroke plan…');
      await writer.animateCharacter({ planId: $('plan').value });
    }),
  );
  const quiz = (guided) =>
    run(async () => {
      const token = action;
      const tolerance = $('tolerance');
      const label = tolerance.options[tolerance.selectedIndex].textContent;
      status(
        `${guided ? 'Trace the model, starting with the highlighted stroke.' : 'Write the selected unit from memory.'} ${label} matching against this source model.`,
      );
      await writer.quizUnit({
        guided,
        leniency: Number(tolerance.value),
        planId: $('plan').value,
        acceptAlternatePlans: $('alternatives').checked,
        onCorrectStroke: (event) => {
          if (token === action)
            status(`Accepted. ${event.strokesRemaining} stroke(s) remaining.`);
        },
        onMistake: (event) => {
          if (token === action) status(`Try again: ${event.reason.replace(/-/g, ' ')}.`);
        },
        onComplete: (event) => {
          if (token === action)
            status(
              `Complete · ${event.totalMistakes} mistake(s). This checks the selected source model.`,
            );
        },
      });
    });
  $('guided').addEventListener('click', () => quiz(true));
  $('practice').addEventListener('click', () => quiz(false));
  $('show').addEventListener('click', () =>
    run(async (token) => {
      await writer.showCharacter();
      if (token === action) status('Model shown.');
    }),
  );
  $('stop').addEventListener('click', () =>
    run(async (token) => {
      await writer.showCharacter();
      if (token === action) status('Practice stopped.');
    }),
  );
  window.addEventListener('resize', () => {
    if (writer) writer.updateDimensions({ width: size(), height: size() });
  });
  window.addEventListener('pagehide', () => {
    generation++;
    stop();
    if (pending) pending.abort();
    if (writer) writer.destroy();
  });
  initialize();
})();
