/* Math Drill: screens, timer and input handling. */
(function () {
  'use strict';

  var MD = window.MathDrill;
  var ROUND_LENGTH = 10;
  var STORAGE_KEY = 'math-drill:settings';

  function $(id) { return document.getElementById(id); }

  var el = {
    screens: { setup: $('screen-setup'), game: $('screen-game'), score: $('screen-score') },
    opToggles: Array.from(document.querySelectorAll('.op-toggle')),
    segments: Array.from(document.querySelectorAll('.segment')),
    lo: $('range-lo'),
    hi: $('range-hi'),
    setupError: $('setup-error'),
    start: $('start-btn'),
    quit: $('quit-btn'),
    counter: $('q-counter'),
    progress: $('progress'),
    scoreLive: $('score-live'),
    timerBar: $('timer-bar'),
    timerLabel: $('timer-label'),
    problem: $('problem'),
    answerBox: $('answer'),
    answerText: $('answer-text'),
    feedback: $('feedback'),
    keypad: document.querySelector('.keypad'),
    submit: $('submit-btn'),
    finalScore: $('final-score'),
    scoreMessage: $('score-message'),
    scoreDifficulty: $('score-difficulty'),
    scoreRange: $('score-range'),
    results: $('results'),
    again: $('again-btn'),
    changeSettings: $('settings-btn')
  };

  var settings = { ops: ['+'], lo: 0, hi: 100, difficulty: 'normal' };
  var game = null; // { round, index, score, results, typed, deadline, remainingMs, raf }

  /* ---------- Settings persistence ---------- */
  function loadSettings() {
    try {
      var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!saved) return;
      if (Array.isArray(saved.ops)) {
        settings.ops = saved.ops.filter(function (op) { return MD.OPS.indexOf(op) !== -1; });
      }
      if (typeof saved.lo === 'number') settings.lo = saved.lo;
      if (typeof saved.hi === 'number') settings.hi = saved.hi;
      if (MD.DIFFICULTY[saved.difficulty]) settings.difficulty = saved.difficulty;
    } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
  }

  function saveSettings() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }

  /* ---------- Screens ---------- */
  function show(name) {
    Object.keys(el.screens).forEach(function (key) {
      el.screens[key].hidden = key !== name;
    });
    window.scrollTo(0, 0);
  }

  /* ---------- Setup ---------- */
  function readRangeInput(input) {
    var raw = input.value.trim();
    return raw === '' ? NaN : Number(raw);
  }

  function renderSetup() {
    el.opToggles.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(settings.ops.indexOf(btn.dataset.op) !== -1));
    });
    el.segments.forEach(function (btn) {
      // Labels come from MathDrill.DIFFICULTY so the seconds live in one place.
      btn.querySelector('.segment-sub').textContent =
        MD.DIFFICULTY[btn.dataset.difficulty].seconds + ' sec';
      var on = btn.dataset.difficulty === settings.difficulty;
      btn.setAttribute('aria-checked', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
    el.lo.value = isNaN(settings.lo) ? '' : settings.lo;
    el.hi.value = isNaN(settings.hi) ? '' : settings.hi;
    validate();
  }

  function validate() {
    var result = MD.validateSettings(settings);
    el.start.disabled = !result.ok;
    el.setupError.hidden = result.ok;
    el.setupError.textContent = result.message;
    var rangeBad = !result.ok && /whole numbers|Lowest/.test(result.message);
    el.lo.setAttribute('aria-invalid', String(rangeBad));
    el.hi.setAttribute('aria-invalid', String(rangeBad));
    return result.ok;
  }

  el.opToggles.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var op = btn.dataset.op;
      var i = settings.ops.indexOf(op);
      if (i === -1) settings.ops.push(op); else settings.ops.splice(i, 1);
      renderSetup();
      saveSettings();
    });
  });

  function pickDifficulty(key) {
    settings.difficulty = key;
    renderSetup();
    saveSettings();
  }

  el.segments.forEach(function (btn, i) {
    btn.addEventListener('click', function () { pickDifficulty(btn.dataset.difficulty); });
    btn.addEventListener('keydown', function (e) {
      var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (!step) return;
      e.preventDefault();
      var next = el.segments[(i + step + el.segments.length) % el.segments.length];
      pickDifficulty(next.dataset.difficulty);
      next.focus();
    });
  });

  [el.lo, el.hi].forEach(function (input) {
    input.addEventListener('input', function () {
      settings.lo = readRangeInput(el.lo);
      settings.hi = readRangeInput(el.hi);
      if (validate()) saveSettings();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { input.blur(); if (!el.start.disabled) startRound(); }
    });
  });

  el.start.addEventListener('click', startRound);

  /* ---------- Game ---------- */
  function secondsPerQuestion() { return MD.DIFFICULTY[settings.difficulty].seconds; }

  function startRound() {
    if (!validate()) return;
    game = {
      round: MD.makeRound(settings, ROUND_LENGTH),
      index: 0,
      score: 0,
      results: [],
      typed: '',
      // Allow as many digits as the biggest possible answer, so the cap
      // never gives away the size of the current answer.
      maxDigits: String(MD.maxAnswer(settings)).length,
      deadline: 0,
      remainingMs: null,
      raf: 0
    };
    buildProgress();
    show('game');
    showQuestion();
  }

  function buildProgress() {
    el.progress.textContent = '';
    for (var i = 0; i < ROUND_LENGTH; i++) el.progress.appendChild(document.createElement('span'));
  }

  function showQuestion() {
    var q = game.round[game.index];
    game.typed = '';
    el.counter.textContent = 'Question ' + (game.index + 1) + ' of ' + ROUND_LENGTH;
    Array.from(el.progress.children).forEach(function (seg, i) {
      seg.className = i < game.index ? 'done' : i === game.index ? 'current' : '';
    });
    el.scoreLive.textContent = game.score;
    el.problem.innerHTML = '';
    el.problem.appendChild(document.createTextNode(q.text + ' '));
    var eq = document.createElement('span');
    eq.className = 'eq';
    eq.textContent = '=';
    el.problem.appendChild(eq);
    fitProblem();
    clearCorrection();
    renderAnswer();
    startTimer(secondsPerQuestion() * 1000);
  }

  function renderAnswer() {
    el.answerText.textContent = game.typed;
    el.submit.disabled = game.typed === '';
    fitAnswer();
  }

  /* ---------- Fit long numbers ---------- */
  // Shrink an element's font (from its CSS size) until it fits `available` px.
  function fitWidth(node, available) {
    node.style.fontSize = '';
    var width = node.scrollWidth;
    if (width > available && available > 0) {
      var size = parseFloat(getComputedStyle(node).fontSize);
      node.style.fontSize = Math.floor(size * available / width) + 'px';
    }
  }

  function innerWidth(node) {
    var cs = getComputedStyle(node);
    return node.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  function fitProblem() {
    fitWidth(el.problem, innerWidth(el.problem.parentNode));
  }

  function fitAnswer() {
    var box = el.answerText.parentNode;
    var caret = box.querySelector('.caret');
    fitWidth(el.answerText, innerWidth(box) - caret.offsetWidth - 8);
  }

  window.addEventListener('resize', function () {
    if (game && !el.screens.game.hidden) { fitProblem(); fitAnswer(); }
  });

  /* ---------- Timer ---------- */
  function startTimer(ms) {
    stopTimer();
    game.deadline = performance.now() + ms;
    game.remainingMs = null;
    el.timerBar.style.setProperty('--remaining', '1');
    el.timerLabel.textContent = Math.ceil(ms / 1000) + 's';
    game.raf = requestAnimationFrame(tick);
  }

  function stopTimer() {
    if (game && game.raf) cancelAnimationFrame(game.raf);
    if (game) game.raf = 0;
  }

  function tick() {
    // Use performance.now(), not the rAF timestamp: the rAF time is the frame
    // start and can be earlier than the moment the deadline was set.
    var total = secondsPerQuestion() * 1000;
    var left = Math.min(total, Math.max(0, game.deadline - performance.now()));
    el.timerBar.style.setProperty('--remaining', String(left / total));
    el.timerLabel.textContent = Math.ceil(left / 1000) + 's';
    if (left <= 0) {
      game.raf = 0;
      record({ status: 'timeout' });
      return;
    }
    game.raf = requestAnimationFrame(tick);
  }

  document.addEventListener('visibilitychange', function () {
    if (!game || el.screens.game.hidden) return;
    if (document.hidden) {
      if (game.raf) {
        game.remainingMs = Math.max(0, game.deadline - performance.now());
        stopTimer();
      }
    } else if (game.remainingMs !== null) {
      var ms = game.remainingMs;
      game.deadline = performance.now() + ms;
      game.remainingMs = null;
      game.raf = requestAnimationFrame(tick);
    }
  });

  /* ---------- Answering ---------- */
  function press(key) {
    if (!game || el.screens.game.hidden || game.correcting) return;
    if (key === 'clear') {
      game.typed = '';
    } else if (key === 'back') {
      game.typed = game.typed.slice(0, -1);
    } else if (/^[0-9]$/.test(key)) {
      if (game.typed === '0') game.typed = key;
      else if (game.typed.length < game.maxDigits) game.typed += key;
    }
    renderAnswer();
  }

  function submit() {
    if (!game || game.typed === '' || el.screens.game.hidden || game.correcting) return;
    var given = Number(game.typed);
    var correct = given === game.round[game.index].answer;
    if (correct) game.score++;
    record({ status: correct ? 'correct' : 'wrong', given: given });
  }

  function record(result) {
    stopTimer();
    result.question = game.round[game.index];
    game.results.push(result);
    if (result.status === 'correct') advance();
    else showCorrection(result);
  }

  function advance() {
    game.index++;
    if (game.index < ROUND_LENGTH) showQuestion();
    else finishRound();
  }

  /* After a wrong answer or timeout, show the right answer for a few seconds
     with the keypad locked, then move on. */
  function showCorrection(result) {
    var answer = result.question.answer;
    game.correcting = true;
    game.typed = '';
    el.answerBox.classList.add('is-wrong');
    el.answerText.textContent = answer;
    el.feedback.textContent = result.status === 'timeout'
      ? 'Time’s up. The answer is ' + answer + '.'
      : 'The answer is ' + answer + '. You said ' + result.given + '.';
    el.feedback.classList.add('is-shown');
    setKeypadLocked(true);
    fitAnswer();
    game.correctionTimer = setTimeout(function () {
      game.correctionTimer = 0;
      advance();
    }, MD.CORRECTION_SECONDS * 1000);
  }

  function clearCorrection() {
    if (game && game.correctionTimer) clearTimeout(game.correctionTimer);
    if (game) { game.correctionTimer = 0; game.correcting = false; }
    el.answerBox.classList.remove('is-wrong');
    el.feedback.classList.remove('is-shown');
    el.feedback.textContent = '';
    setKeypadLocked(false);
  }

  function setKeypadLocked(locked) {
    el.keypad.querySelectorAll('button').forEach(function (b) { b.disabled = locked; });
    if (locked) el.submit.disabled = true;
  }

  el.keypad.addEventListener('click', function (e) {
    var key = e.target.closest('[data-key]');
    if (key) press(key.dataset.key);
  });

  el.submit.addEventListener('click', submit);

  document.addEventListener('keydown', function (e) {
    if (!game || el.screens.game.hidden || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[0-9]$/.test(e.key)) press(e.key);
    else if (e.key === 'Backspace') press('back');
    else if (e.key === 'Delete' || e.key === 'Escape') press('clear');
    else if (e.key === 'Enter') submit();
    else return;
    e.preventDefault();
  });

  el.quit.addEventListener('click', function () {
    stopTimer();
    clearCorrection();
    game = null;
    renderSetup();
    show('setup');
  });

  /* ---------- Score ---------- */
  var ICON_CHECK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Correct"><path d="M5 12l5 5L20 7"/></svg>';
  var ICON_CROSS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" role="img" aria-label="Incorrect"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  function scoreMessage(score) {
    if (score === ROUND_LENGTH) return 'Perfect!';
    if (score >= 8) return 'Great job!';
    if (score >= 6) return 'Nice work!';
    if (score >= 4) return 'Keep practicing';
    return 'Keep at it';
  }

  function finishRound() {
    el.finalScore.textContent = game.score;
    el.scoreMessage.textContent = scoreMessage(game.score);
    el.scoreDifficulty.textContent = MD.difficultyLabel(settings.difficulty);
    el.scoreRange.textContent = MD.rangeLabel(settings);

    el.results.textContent = '';
    game.results.forEach(function (r, i) {
      var li = document.createElement('li');
      li.className = 'result-row';

      var idx = document.createElement('span');
      idx.className = 'result-index';
      idx.textContent = i + 1;

      var eq = document.createElement('span');
      eq.className = 'result-eq';
      eq.textContent = r.question.text + ' = ' + r.question.answer;

      var mark = document.createElement('span');
      mark.className = 'result-mark' + (r.status === 'correct' ? '' : ' wrong');
      if (r.status === 'correct') {
        mark.innerHTML = ICON_CHECK;
      } else {
        mark.textContent = r.status === 'timeout' ? 'Time’s up' : 'You: ' + r.given;
        mark.insertAdjacentHTML('beforeend', ICON_CROSS);
      }

      li.appendChild(idx);
      li.appendChild(eq);
      li.appendChild(mark);
      el.results.appendChild(li);
    });

    show('score');
  }

  el.again.addEventListener('click', startRound);
  el.changeSettings.addEventListener('click', function () {
    game = null;
    renderSetup();
    show('setup');
  });

  /* ---------- Init ---------- */
  loadSettings();
  renderSetup();
})();
