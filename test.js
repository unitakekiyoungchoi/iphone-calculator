#!/usr/bin/env node
/**
 * Automated tests for calculator logic.
 * Run: node test.js
 */
'use strict';

var createCalculator = require('./calculator.js').createCalculator;

var passed = 0;
var failed = 0;

function assertEqual(actual, expected, name) {
  if (actual === expected) {
    passed++;
    console.log('  ✓ ' + name);
  } else {
    failed++;
    console.log('  ✗ ' + name);
    console.log('    expected: ' + JSON.stringify(expected));
    console.log('    actual:   ' + JSON.stringify(actual));
  }
}

function calc() {
  return createCalculator();
}

console.log('\nCalculator tests\n');

// 2 + 3 = 5
(function () {
  var c = calc();
  c.pressAll(['2', '+', '3', '=']);
  assertEqual(c.display(), '5', '2+3=5');
})();

// 5 × 3 = then = gives 45 (repeated equals)
(function () {
  var c = calc();
  c.pressAll(['5', '*', '3', '=', '=']);
  assertEqual(c.display(), '45', '5×3= then = gives 45');
})();

// 0.1 + 0.2 = 0.3 (no float artifacts)
(function () {
  var c = calc();
  c.pressAll(['0', '.', '1', '+', '0', '.', '2', '=']);
  assertEqual(c.display(), '0.3', '0.1+0.2=0.3');
})();

// 9 ÷ 0 = Error
(function () {
  var c = calc();
  c.pressAll(['9', '/', '0', '=']);
  assertEqual(c.display(), 'Error', '9÷0=Error');
})();

// 50% = 0.5
(function () {
  var c = calc();
  c.pressAll(['5', '0', '%']);
  assertEqual(c.display(), '0.5', '50%=0.5');
})();

// 1234567 displays as 1,234,567
(function () {
  var c = calc();
  c.pressAll(['1', '2', '3', '4', '5', '6', '7']);
  assertEqual(c.display(), '1,234,567', '1234567 displays as 1,234,567');
})();

// ± toggling
(function () {
  var c = calc();
  c.pressAll(['5', 'sign']);
  assertEqual(c.display(), '-5', '± toggles 5 to -5');
  c.press('sign');
  assertEqual(c.display(), '5', '± toggles -5 back to 5');
})();

// C vs AC
(function () {
  var c = calc();
  assertEqual(c.clearLabel(), 'AC', 'starts as AC');
  c.pressAll(['1', '2', '3']);
  assertEqual(c.clearLabel(), 'C', 'shows C while typing');
  c.press('clear'); // C: clear entry
  assertEqual(c.display(), '0', 'C clears current entry to 0');
  assertEqual(c.clearLabel(), 'AC', 'becomes AC after C with no pending op');

  // With pending operation: C keeps the op, AC clears all
  c = calc();
  c.pressAll(['8', '+', '2']);
  assertEqual(c.clearLabel(), 'C', 'C while value present after op');
  c.press('clear'); // clear entry, keep pending +
  assertEqual(c.display(), '0', 'C clears entry');
  assertEqual(c.activeOp(), '+', 'C keeps pending operator');
  c.press('clear'); // now AC
  assertEqual(c.clearLabel(), 'AC', 'second clear is AC');
  assertEqual(c.activeOp(), null, 'AC clears pending operator');
})();

// Extra: precedence × ÷ before + −
(function () {
  var c = calc();
  c.pressAll(['2', '+', '3', '*', '4', '=']);
  assertEqual(c.display(), '14', '2+3×4=14 (precedence)');
})();

console.log('\n' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
