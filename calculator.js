/**
 * Pure iOS-style calculator logic (no DOM).
 * Works in both browser and Node.js.
 */
(function (root) {
  'use strict';

  function createCalculator() {
    var MAX_DIGITS = 9;
    var s;

    function reset() {
      s = {
        value: 0,          // current numeric value shown
        typing: null,      // string being typed, or null
        tokens: [],        // pending expression: [num, op, num, op, ...]
        opJustPressed: false,
        lastOp: null,      // for repeated "="
        lastOperand: null,
        error: false
      };
    }
    reset();

    // Remove floating-point noise (0.1+0.2 -> 0.3)
    function clean(x) {
      if (!isFinite(x)) return x;
      if (x === 0) return 0;
      return parseFloat(x.toPrecision(15));
    }

    function apply(a, op, b) {
      var r;
      switch (op) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/': if (b === 0) return NaN; r = a / b; break;
      }
      return clean(r);
    }

    function isMul(op) { return op === '*' || op === '/'; }

    // Evaluate [n, op, n, op, n] with standard precedence (as iOS does).
    function evaluate(list) {
      var terms = [list[0]], ops = [];
      for (var i = 1; i < list.length; i += 2) {
        var op = list[i], n = list[i + 1];
        if (isMul(op)) terms[terms.length - 1] = apply(terms[terms.length - 1], op, n);
        else { ops.push(op); terms.push(n); }
      }
      var r = terms[0];
      for (var j = 0; j < ops.length; j++) r = apply(r, ops[j], terms[j + 1]);
      return r;
    }

    // Value to preview after an operator is pressed
    function preview() {
      var list = s.tokens.slice(0, -1);
      var op = s.tokens[s.tokens.length - 1];
      if (!isMul(op)) return evaluate(list);
      var i = list.length - 1;
      while (i - 1 >= 0 && isMul(list[i - 1])) i -= 2;
      return evaluate(list.slice(i));
    }

    function setResult(v) {
      if (!isFinite(v) || isNaN(v)) {
        s.error = true;
        s.value = 0;
        s.typing = null;
        s.tokens = [];
        s.opJustPressed = false;
        return;
      }
      s.value = v;
      s.typing = null;
    }

    function digitCount(str) { return str.replace(/[^0-9]/g, '').length; }

    function inputDigit(d) {
      if (s.error) reset();
      if (s.typing === null) {
        s.typing = d;
      } else if (s.typing === '0' || s.typing === '-0') {
        s.typing = s.typing.replace('0', d);
      } else {
        if (digitCount(s.typing) >= MAX_DIGITS) return;
        s.typing += d;
      }
      s.opJustPressed = false;
      s.value = parseFloat(s.typing);
    }

    function inputDot() {
      if (s.error) reset();
      if (s.typing === null) s.typing = '0.';
      else if (s.typing.indexOf('.') === -1) {
        if (digitCount(s.typing) >= MAX_DIGITS) return;
        s.typing += '.';
      }
      s.opJustPressed = false;
      s.value = parseFloat(s.typing);
    }

    function inputOp(op) {
      if (s.error) return;
      if (s.opJustPressed && s.tokens.length) {
        s.tokens[s.tokens.length - 1] = op;  // change operator
      } else {
        s.tokens.push(s.value, op);
      }
      setResult(preview());
      if (!s.error) s.opJustPressed = true;
    }

    function equals() {
      if (s.error) return;
      if (s.tokens.length === 0) {
        if (s.lastOp !== null) setResult(apply(s.value, s.lastOp, s.lastOperand));
        else setResult(s.value);
        s.opJustPressed = false;
        return;
      }
      var operand = s.value;
      var lastOp = s.tokens[s.tokens.length - 1];
      s.tokens.push(operand);
      var r = evaluate(s.tokens);
      s.tokens = [];
      s.lastOp = lastOp;
      s.lastOperand = operand;
      s.opJustPressed = false;
      setResult(r);
    }

    function percent() {
      if (s.error) return;
      var v = s.value, r;
      var last = s.tokens[s.tokens.length - 1];
      if (s.tokens.length && (last === '+' || last === '-')) {
        r = clean(evaluate(s.tokens.slice(0, -1)) * v / 100);   // 200 + 10% -> 200 + 20
      } else {
        r = clean(v / 100);
      }
      s.opJustPressed = false;
      setResult(r);
    }

    function toggleSign() {
      if (s.error) return;
      if (s.opJustPressed) { s.typing = '-0'; s.value = -0; s.opJustPressed = false; return; }
      if (s.typing !== null) {
        s.typing = s.typing.charAt(0) === '-' ? s.typing.slice(1) : '-' + s.typing;
        s.value = parseFloat(s.typing);
      } else {
        s.value = -s.value;
      }
    }

    function backspace() {
      if (s.error) { reset(); return; }
      if (s.typing === null) return;
      var t = s.typing.slice(0, -1);
      if (t === '' || t === '-') { s.typing = null; s.value = 0; return; }
      s.typing = t;
      s.value = parseFloat(t);
    }

    function showC() {
      return !s.error && (s.typing !== null || s.value !== 0);
    }

    function clear() {
      // "C": clear the current entry, keep pending operation; "AC": reset everything
      if (showC()) {
        s.typing = null;
        s.value = 0;
        if (s.tokens.length) s.opJustPressed = true; // re-highlight pending operator
      } else {
        reset();
      }
    }

    // ---------- formatting ----------
    function addCommas(intStr) {
      return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    function formatExp(n) {
      var str = n.toExponential(6);   // e.g. 1.234567e+12
      var parts = str.split('e');
      var mant = parts[0];
      if (mant.indexOf('.') !== -1) mant = mant.replace(/0+$/, '').replace(/\.$/, '');
      var exp = parseInt(parts[1], 10);
      return mant + 'e' + exp;
    }

    function formatNumber(n) {
      if (!isFinite(n) || isNaN(n)) return 'Error';
      if (n === 0) return '0';
      var abs = Math.abs(n);
      if (abs >= 1e9 || abs < 1e-8) return formatExp(n);
      var intDigits = abs < 1 ? 1 : Math.floor(Math.log10(abs)) + 1;
      var decimals = Math.max(0, MAX_DIGITS - intDigits);
      var rounded = parseFloat(n.toFixed(decimals));
      if (Math.abs(rounded) >= 1e9) return formatExp(n);
      if (rounded === 0) return formatExp(n);
      var str = rounded.toFixed(decimals);
      if (str.indexOf('.') !== -1) str = str.replace(/0+$/, '').replace(/\.$/, '');
      var neg = str.charAt(0) === '-';
      if (neg) str = str.slice(1);
      var p = str.split('.');
      return (neg ? '-' : '') + addCommas(p[0]) + (p.length > 1 ? '.' + p[1] : '');
    }

    function formatTyping(t) {
      var neg = t.charAt(0) === '-';
      if (neg) t = t.slice(1);
      var dot = t.indexOf('.');
      var ip = dot === -1 ? t : t.slice(0, dot);
      var fp = dot === -1 ? '' : t.slice(dot);
      return (neg ? '-' : '') + addCommas(ip) + fp;
    }

    function press(key) {
      key = String(key);
      if (/^[0-9]$/.test(key)) inputDigit(key);
      else if (key === '.') inputDot();
      else if (key === '+' || key === '-' || key === '*' || key === '/') inputOp(key);
      else if (key === '=') equals();
      else if (key === '%') percent();
      else if (key === 'sign') toggleSign();
      else if (key === 'back') backspace();
      else if (key === 'clear') clear();
      else if (key === 'allclear') reset();
      return api;
    }

    var api = {
      press: press,
      pressAll: function (seq) { seq.forEach(press); return api; },
      display: function () {
        if (s.error) return 'Error';
        return s.typing !== null ? formatTyping(s.typing) : formatNumber(s.value);
      },
      activeOp: function () {
        return (s.opJustPressed && s.tokens.length) ? s.tokens[s.tokens.length - 1] : null;
      },
      clearLabel: function () { return showC() ? 'C' : 'AC'; },
      format: formatNumber
    };
    return api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createCalculator: createCalculator };
  } else {
    root.createCalculator = createCalculator;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
