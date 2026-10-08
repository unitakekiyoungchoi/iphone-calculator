/* Calculator UI wiring (DOM only). Requires createCalculator from calculator.js */
(function () {
  'use strict';
  if (typeof document === 'undefined') return;

  var calc = createCalculator();
  var textEl = document.getElementById('displayText');
  var displayEl = document.getElementById('display');
  var clearKey = document.getElementById('clearKey');
  var opKeys = Array.prototype.slice.call(document.querySelectorAll('.key.op'));
  var keyEls = {};
  Array.prototype.forEach.call(document.querySelectorAll('.key'), function (b) {
    keyEls[b.dataset.key] = b;
  });

  function fit() {
    textEl.style.transform = 'none';
    var avail = displayEl.clientWidth - 16;
    var w = textEl.scrollWidth;
    if (w > avail) textEl.style.transform = 'scale(' + (avail / w) + ')';
  }

  function render() {
    textEl.textContent = calc.display().replace(/^-/, '\u2212'); // typographic minus
    var lbl = calc.clearLabel();
    clearKey.textContent = lbl;
    clearKey.setAttribute('aria-label', lbl === 'C' ? 'Clear' : 'All clear');
    var act = calc.activeOp();
    opKeys.forEach(function (b) {
      b.classList.toggle('active', b.dataset.key === act && act !== '=');
    });
    fit();
  }

  function press(key) { calc.press(key); render(); }

  document.getElementById('keys').addEventListener('click', function (e) {
    var b = e.target.closest('.key');
    if (b) press(b.dataset.key);
  });

  // swipe left/right on display to delete last digit (like iOS)
  var sx = null;
  displayEl.addEventListener('pointerdown', function (e) { sx = e.clientX; });
  displayEl.addEventListener('pointerup', function (e) {
    if (sx !== null && Math.abs(e.clientX - sx) > 30) press('back');
    sx = null;
  });

  function flash(key) {
    var el = keyEls[key === 'back' ? null : key];
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 90);
  }

  var keymap = {
    'Enter': '=', '=': '=', 'Backspace': 'back', 'Escape': 'clear', 'Delete': 'clear',
    '+': '+', '-': '-', '*': '*', 'x': '*', 'X': '*', '/': '/', '.': '.', ',': '.', '%': '%'
  };
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = /^[0-9]$/.test(e.key) ? e.key : keymap[e.key];
    if (!k) return;
    e.preventDefault();
    press(k);
    flash(k);
  });

  // live clock in the fake status bar
  function tick() {
    var d = new Date();
    var el = document.getElementById('clock');
    el.textContent = (d.getHours() % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  tick();
  setInterval(tick, 15000);

  window.addEventListener('resize', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  window.calculator = { press: press, state: calc };
  render();
})();
