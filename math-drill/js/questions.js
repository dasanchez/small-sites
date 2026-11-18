/* Math Drill: settings validation and question generation (no DOM). */
(function (root) {
  'use strict';

  var MAX_VALUE = 999;
  var OPS = ['+', '-', '*', '/'];
  var OP_SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };
  var OP_NAME = { '+': 'addition', '-': 'subtraction', '*': 'multiplication', '/': 'division' };
  var DIFFICULTY = {
    easy: { label: 'Easy', seconds: 30 },
    normal: { label: 'Normal', seconds: 20 },
    hard: { label: 'Hard', seconds: 10 }
  };
  // How long the correct answer stays on screen after a wrong answer or timeout.
  var CORRECTION_SECONDS = 3;

  function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function makeQuestion(a, op, b, answer) {
    return { a: a, op: op, b: b, answer: answer, text: a + ' ' + OP_SYMBOL[op] + ' ' + b };
  }

  /* How the range [lo, hi] applies to each operation:
       +  ×  both operands fall in the range (the answer can be larger)
       −  ÷  the answer falls in the range
     Every generator works for any lo <= hi, so no setting is impossible. */

  /* Zero makes trivial questions (7 × 0, 0 + 5, 0 ÷ 4), so when the range
     includes 0 and other numbers, a drawn 0 is re-drawn once. That makes 0
     much rarer (1 in 11 → about 1 in 121 for 0–10) without ruling it out. */
  function pickNumber(lo, hi) {
    var n = randInt(lo, hi);
    if (n === 0 && hi > 0) n = randInt(lo, hi);
    return n;
  }

  function additionQuestion(lo, hi) {
    var a = pickNumber(lo, hi), b = pickNumber(lo, hi);
    return makeQuestion(a, '+', b, a + b);
  }

  function multiplicationQuestion(lo, hi) {
    var a = pickNumber(lo, hi), b = pickNumber(lo, hi);
    return makeQuestion(a, '*', b, a * b);
  }

  function subtractionQuestion(lo, hi) {
    var c = randInt(lo, hi);
    var b = randInt(1, Math.max(10, hi));
    return makeQuestion(c + b, '-', b, c);
  }

  function divisionQuestion(lo, hi) {
    var c = pickNumber(lo, hi); // answer 0 means 0 ÷ b, so keep it rare too
    var b = randInt(2, 12); // whole-number answers: dividend = answer × divisor
    return makeQuestion(c * b, '/', b, c);
  }

  var GENERATORS = {
    '+': additionQuestion,
    '-': subtractionQuestion,
    '*': multiplicationQuestion,
    '/': divisionQuestion
  };

  function enabledOps(settings) {
    var chosen = Array.from(settings.ops);
    return OPS.filter(function (op) { return chosen.indexOf(op) !== -1; });
  }

  /* Largest answer these settings can produce; sizes the keypad's digit limit. */
  function maxAnswer(settings) {
    var hi = settings.hi;
    var largest = { '+': hi + hi, '-': hi, '*': hi * hi, '/': hi };
    return enabledOps(settings).reduce(function (m, op) { return Math.max(m, largest[op]); }, 0);
  }

  function isWhole(n) {
    return typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
  }

  /* settings: { ops: array or Set of '+','-','*','/', lo: number, hi: number } */
  function validateSettings(settings) {
    var ops = Array.from(settings.ops || []);
    var lo = settings.lo, hi = settings.hi;
    if (ops.length === 0) return { ok: false, message: 'Pick at least one operation.' };
    if (!isWhole(lo) || !isWhole(hi) || lo < 0 || hi < 0 || lo > MAX_VALUE || hi > MAX_VALUE) {
      return { ok: false, message: 'Use whole numbers from 0 to ' + MAX_VALUE + '.' };
    }
    if (lo > hi) return { ok: false, message: 'Lowest can’t be more than Highest.' };
    return { ok: true, message: '' };
  }

  function makeRound(settings, n) {
    n = n || 10;
    var ops = enabledOps(settings);
    var lo = settings.lo, hi = settings.hi;

    function generate(op) { return GENERATORS[op](lo, hi); }

    var round = [], seen = {};
    for (var i = 0; i < n; i++) {
      var q = null;
      // Try for a question not yet used this round; settle for one that
      // at least differs from the previous question.
      for (var attempt = 0; attempt < 60; attempt++) {
        var candidate = generate(ops[randInt(0, ops.length - 1)]);
        var prev = round[round.length - 1];
        var isRepeatOfPrev = prev && prev.text === candidate.text;
        if (!seen[candidate.text]) { q = candidate; break; }
        if (!isRepeatOfPrev && attempt >= 30) { q = candidate; break; }
        if (!q && !isRepeatOfPrev) q = candidate;
      }
      if (!q) q = generate(ops[randInt(0, ops.length - 1)]); // single-question pool
      seen[q.text] = true;
      round.push(q);
    }
    return round;
  }

  function difficultyLabel(key) {
    var d = DIFFICULTY[key];
    return d.label + ' · ' + d.seconds + ' sec';
  }

  function rangeLabel(settings) {
    var symbols = enabledOps(settings).map(function (op) { return OP_SYMBOL[op]; });
    return symbols.join(' ') + ' · range ' + settings.lo + '–' + settings.hi;
  }

  var api = {
    MAX_VALUE: MAX_VALUE,
    OPS: OPS,
    OP_SYMBOL: OP_SYMBOL,
    OP_NAME: OP_NAME,
    DIFFICULTY: DIFFICULTY,
    CORRECTION_SECONDS: CORRECTION_SECONDS,
    validateSettings: validateSettings,
    makeRound: makeRound,
    maxAnswer: maxAnswer,
    difficultyLabel: difficultyLabel,
    rangeLabel: rangeLabel
  };

  root.MathDrill = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
