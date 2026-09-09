let writer;
let isCharVisible = false;
let isOutlineVisible = true;
let loadGeneration = 0;

function setStatus(message, loading, ready) {
  document.querySelector('#status').textContent = message;
  document.querySelector('#target').setAttribute('aria-busy', String(loading));
  document.querySelectorAll('.actions button').forEach(function (button) {
    button.disabled = !ready;
  });
}

function syncToggleButtons() {
  document
    .querySelector('.js-toggle')
    .setAttribute('aria-pressed', String(isCharVisible));
  document
    .querySelector('.js-toggle-hint')
    .setAttribute('aria-pressed', String(isOutlineVisible));
}

function updateCharacter() {
  const input = document.querySelector('.js-char');
  const character = input.value.trim();
  // HTML maxlength counts UTF-16 code units, so validate Unicode code points here.
  if (Array.from(character).length !== 1 || /^[\uD800-\uDFFF]$/.test(character)) {
    input.setCustomValidity('Enter exactly one character.');
    input.reportValidity();
    return;
  }
  input.setCustomValidity('');
  input.value = character;
  window.location.hash = encodeURIComponent(character);
  const generation = ++loadGeneration;
  setStatus('Loading ' + character + '…', true, false);

  if (!writer) {
    writer = new Scribing('target', {
      width: 400,
      height: 400,
      renderer: 'svg',
      radicalColor: '#166E16',
      showCharacter: false,
    });
    // Keep the logical drawing coordinates when CSS scales the SVG viewport.
    document.querySelector('#target svg').setAttribute('viewBox', '0 0 400 400');
    window.writer = writer;
  }
  return writer
    .setCharacter(character)
    .then(function () {
      if (generation !== loadGeneration) return;
      isCharVisible = false;
      isOutlineVisible = true;
      writer.hideCharacter({ duration: 0 });
      writer.showOutline({ duration: 0 });
      syncToggleButtons();
      setStatus('Ready to practice ' + character + '.', false, true);
    })
    .catch(function () {
      if (generation !== loadGeneration) return;
      setStatus(
        'Could not load ' +
          character +
          '. Check your connection or try another Chinese character.',
        false,
        false,
      );
    });
}

window.onload = function () {
  try {
    const char = decodeURIComponent(window.location.hash.slice(1));
    if (char) document.querySelector('.js-char').value = char;
  } catch {
    // A malformed URL fragment should not prevent the default character loading.
  }

  document.querySelector('.js-char').addEventListener('input', function (evt) {
    evt.target.setCustomValidity('');
  });
  document.querySelector('.js-char-form').addEventListener('submit', function (evt) {
    evt.preventDefault();
    updateCharacter();
  });
  document.querySelector('.js-toggle').addEventListener('click', function () {
    isCharVisible ? writer.hideCharacter() : writer.showCharacter();
    isCharVisible = !isCharVisible;
    syncToggleButtons();
  });
  document.querySelector('.js-toggle-hint').addEventListener('click', function () {
    isOutlineVisible ? writer.hideOutline() : writer.showOutline();
    isOutlineVisible = !isOutlineVisible;
    syncToggleButtons();
  });
  document.querySelector('.js-animate').addEventListener('click', function () {
    const generation = loadGeneration;
    isCharVisible = true;
    syncToggleButtons();
    writer.animateCharacter().then(function (result) {
      if (!result || result.canceled || generation !== loadGeneration) return;
      isCharVisible = true;
      syncToggleButtons();
    });
  });
  document.querySelector('.js-quiz').addEventListener('click', function () {
    const generation = loadGeneration;
    writer.quiz({
      showOutline: true,
      onComplete: function () {
        if (generation !== loadGeneration) return;
        isCharVisible = true;
        syncToggleButtons();
      },
    });
    isCharVisible = false;
    isOutlineVisible = true;
    syncToggleButtons();
  });
  updateCharacter();
};
