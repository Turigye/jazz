/* Jazz — product site behaviour.
   Three things happen here and nothing else: the meter runs, the demo types,
   and the download button asks GitHub which release is current.

   No analytics, no third-party requests, no framework. A page whose argument
   is that nothing leaves your machine cannot itself phone home. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── The meter ──────────────────────────────────────────────────────────
     Same model as the app: deflection is linear in amplitude (the log scale
     lives in where the numbers are painted, not in the movement), and the
     needle is a damped spring so it overshoots and settles rather than easing.

     When the visitor lends us their microphone we read its level with an
     AnalyserNode — level only, in their browser, never recorded and never
     sent anywhere. Otherwise the needle runs on a synthetic speech envelope,
     which is what most people will see and so has to look right on its own. */

  var VU = { REF: 0.16, MIN_DB: -20, MAX_DB: 3, MAX_ANGLE: 58, OMEGA: 22, ZETA: 0.7, PEAK_HOLD: 900 };
  var AMP_MIN = Math.pow(10, VU.MIN_DB / 20);
  var AMP_MAX = Math.pow(10, VU.MAX_DB / 20);

  var needle = document.getElementById('needle');
  // The meter's geometry is generated from the app's constants, so the pivot
  // lives in the markup rather than being repeated here. Hardcoding it meant
  // the needle span was swinging around (75,74) while the hub was drawn at
  // (70,68) — the two silently disagreed after the SVG was regenerated.
  var PX = needle ? +needle.getAttribute('data-px') : 70;
  var PY = needle ? +needle.getAttribute('data-py') : 68;
  var peakArc = document.getElementById('peakArc');
  var timecode = document.getElementById('timecode');
  var micBtn = document.getElementById('micBtn');
  var micLabel = document.getElementById('micLabel');

  var level = 0;          // current input amplitude, 0..1-ish
  var pos = 0, vel = 0;   // needle state
  var peakUntil = 0;
  var analyser = null, micData = null;
  var envT = 0;
  var running = { on: false, since: 0 };

  function angleFor(amp) {
    var f = (amp - AMP_MIN) / (AMP_MAX - AMP_MIN);
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    return -VU.MAX_ANGLE + f * VU.MAX_ANGLE * 2;
  }

  function readMic() {
    analyser.getByteTimeDomainData(micData);
    var sum = 0;
    for (var i = 0; i < micData.length; i++) {
      var v = (micData[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / micData.length);
  }

  function envelope(dt) {
    // Syllables riding a slower phrase contour, with brief gaps for breath.
    envT += dt;
    var syllable = Math.max(0, Math.sin(envT * 3.6));
    var phrase = Math.max(0, Math.sin(envT * 1.15));
    return (syllable * phrase * 0.9 + Math.random() * 0.02) * VU.REF * 1.15;
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min((now - last) / 1000, 0.033);
    last = now;

    level = analyser ? readMic() : envelope(dt);

    var target = level / VU.REF;
    var accel = VU.OMEGA * VU.OMEGA * (target - pos) - 2 * VU.ZETA * VU.OMEGA * vel;
    vel += accel * dt;
    pos += vel * dt;
    if (pos < 0) { pos = 0; vel = 0; }

    if (needle) {
      needle.setAttribute('transform', 'rotate(' + angleFor(pos).toFixed(2) + ' ' + PX + ' ' + PY + ')');
    }
    if (pos > 1) peakUntil = now + VU.PEAK_HOLD;
    if (peakArc) peakArc.setAttribute('opacity', now < peakUntil ? '1' : '0.28');

    if (timecode) {
      var secs = running.on ? Math.floor((now - running.since) / 1000) : 0;
      timecode.textContent =
        String(Math.floor(secs / 60)).padStart(2, '0') + ':' + String(secs % 60).padStart(2, '0');
    }
    requestAnimationFrame(frame);
  }

  if (needle && !reduced) requestAnimationFrame(frame);
  if (reduced && needle) needle.setAttribute('transform', 'rotate(-18 ' + PX + ' ' + PY + ')');

  if (micBtn) {
    micBtn.addEventListener('click', function () {
      if (analyser) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        micLabel.textContent = 'Microphone unavailable in this browser';
        return;
      }
      micLabel.textContent = 'Waiting for permission…';
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var src = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        micData = new Uint8Array(analyser.fftSize);
        src.connect(analyser);
        micBtn.classList.add('live');
        micLabel.textContent = 'Live — that needle is your voice';
        running.on = true;
        running.since = performance.now();
      }).catch(function () {
        // Declining is a completely reasonable thing to do to a page you just met.
        micLabel.textContent = 'No problem — the needle keeps its own time';
        setTimeout(function () { micLabel.textContent = 'Use my microphone'; }, 3200);
      });
    });
  }

  /* ── Hold to dictate ────────────────────────────────────────────────────
     A scripted demo, paced to the real thing: the meter rides while held, then
     text arrives after a delay in the range the app actually takes. */

  var PHRASE = 'Rewrite the opening paragraph so it leads with the result, then ' +
               'tighten the second half by about a third.';
  var hold = document.getElementById('hold');
  var editor = document.getElementById('editor');
  var holding = false, typeTimer = null, holdStart = 0;

  function setEditor(text, caret) {
    if (!editor) return;
    editor.classList.remove('idle');
    editor.innerHTML = '';
    editor.appendChild(document.createTextNode(text));
    if (caret) {
      var c = document.createElement('span');
      c.className = 'caret';
      editor.appendChild(c);
    }
  }

  function startHold() {
    if (holding) return;
    holding = true;
    holdStart = performance.now();
    clearTimeout(typeTimer);
    if (hold) { hold.classList.add('active'); hold.textContent = 'Listening — release to transcribe'; }
    if (!analyser) { running.on = true; running.since = performance.now(); }
    setEditor('', true);
  }

  function endHold() {
    if (!holding) return;
    holding = false;
    if (hold) { hold.classList.remove('active'); hold.textContent = 'Hold to dictate'; }
    if (!analyser) running.on = false;

    var held = performance.now() - holdStart;
    if (held < 350) {                       // too brief to be speech
      if (editor) { editor.classList.add('idle'); editor.textContent = 'Hold it a little longer.'; }
      return;
    }
    setEditor('', true);
    if (hold) hold.textContent = 'Transcribing…';

    // Roughly what the app takes: fixed model overhead plus a little per second.
    var wait = reduced ? 120 : 900 + Math.min(held, 6000) * 0.09;
    typeTimer = setTimeout(function () {
      if (hold) hold.textContent = 'Hold to dictate';
      var i = 0;
      (function typeOn() {
        if (holding) return;              // a new hold interrupts the old result
        i += 2;
        setEditor(PHRASE.slice(0, i), i < PHRASE.length);
        if (i < PHRASE.length) typeTimer = setTimeout(typeOn, reduced ? 0 : 16);
      })();
    }, wait);
  }

  if (hold) {
    hold.addEventListener('pointerdown', function (e) { e.preventDefault(); startHold(); });
    hold.addEventListener('pointerup', endHold);
    hold.addEventListener('pointercancel', endHold);
    hold.addEventListener('pointerleave', function () { if (holding) endHold(); });
    // Keyboard parity: the control is a button, so it must work from the keyboard.
    hold.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); startHold(); }
    });
    hold.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); endHold(); }
    });
  }

  // Space anywhere on the page also works, as long as focus isn't in a control.
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' || e.repeat) return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'BUTTON' || t === 'A') return;
    e.preventDefault(); startHold();
  });
  document.addEventListener('keyup', function (e) {
    if (e.code !== 'Space') return;
    var t = e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'BUTTON' || t === 'A') return;
    endHold();
  });

  /* ── Latest release ─────────────────────────────────────────────────────
     Read the current tag and asset size from GitHub so the button can never
     point at a stale build. If the call fails the markup already links to
     /releases/latest, so nothing breaks. */

  fetch('https://api.github.com/repos/Turigye/jazz/releases/latest')
    .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
    .then(function (rel) {
      var dmg = (rel.assets || []).filter(function (a) { return /\.dmg$/.test(a.name); })[0];
      var v = document.getElementById('dlVersion');
      var s = document.getElementById('dlSize');
      var meta = document.getElementById('heroMeta');
      if (v && rel.tag_name) v.textContent = rel.tag_name + ' · notarized';
      if (dmg) {
        var btn = document.getElementById('dlBtn');
        if (btn) btn.href = dmg.browser_download_url;
        if (s) s.textContent = Math.round(dmg.size / 1048576) + ' MB';
      }
      if (meta && rel.tag_name) {
        meta.textContent = 'Apple Silicon · ' + rel.tag_name + ' · notarized by Apple';
      }
    })
    .catch(function () { /* the static link stands */ });


  /* ── Before / after example switch ──────────────────────────────────────
     Two audiences, one section: the same deterministic clean-up shown on code
     and on ordinary correspondence, because the objection "that's a developer
     tool" is answered faster by an example than by a sentence. */
  var switches = document.querySelectorAll('.sw');
  Array.prototype.forEach.call(switches, function (btn) {
    btn.addEventListener('click', function () {
      var want = btn.getAttribute('data-ex');
      Array.prototype.forEach.call(switches, function (b) {
        var on = b === btn;
        b.classList.toggle('on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      ['dev', 'mail'].forEach(function (k) {
        var el = document.getElementById('ex-' + k);
        if (el) el.hidden = (k !== want);
      });
    });
  });

  /* ── Chrome ─────────────────────────────────────────────────────────── */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('stuck', window.scrollY > 8); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // One quiet reveal per block. No scroll-jacking, no parallax.
  var items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || reduced) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px' });
    Array.prototype.forEach.call(items, function (el) { io.observe(el); });
  }
})();
