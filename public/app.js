(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TAU = Math.PI * 2;

  function qa(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function mk(cls) { var d = document.createElement('div'); d.className = cls; d.setAttribute('aria-hidden', 'true'); document.body.appendChild(d); return d; }

  /* ---------- scroll progress + header ---------- */
  var bar = mk('progress');
  var header = document.querySelector('.site-header');
  function onScroll() {
    var h = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? Math.min(window.scrollY / h, 1) : 0) + ')';
    if (header) header.classList.toggle('scrolled', window.scrollY > 24);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- cursor, trail, click effects ---------- */
  var cv = null, ctx = null, W = window.innerWidth, H = window.innerHeight;
  var dot = mk('cur-dot'), ring = mk('cur-ring');
  var mx = W / 2, my = H / 2, rx = mx, ry = my, lx = mx, ly = my, shown = false;
  var nx = 0, ny = 0, tx = 0, ty = 0;
  var parts = [], sparks = [], rings = [];

  if (!reduce) {
    cv = document.createElement('canvas');
    cv.id = 'fx';
    cv.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cv);
    ctx = cv.getContext('2d');
    var fit = function () {
      var d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };
    fit();
    window.addEventListener('resize', fit);
  }

  var mags = qa('[data-magnetic]');
  var depths = qa('[data-depth]');
  var spots = qa('[data-spot]');

  function magnet() {
    mags.forEach(function (el) {
      var r = el.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = mx - cx, dy = my - cy, d = Math.sqrt(dx * dx + dy * dy);
      var reach = Math.max(r.width, r.height) * 0.9;
      if (d < reach) {
        el.style.transform = 'translate(' + (dx * 0.28).toFixed(1) + 'px,' + (dy * 0.28).toFixed(1) + 'px)';
        el.classList.add('mag-on');
      } else if (el.classList.contains('mag-on')) {
        el.style.transform = '';
        el.classList.remove('mag-on');
      }
    });
  }

  function spotlight() {
    spots.forEach(function (el) {
      var r = el.getBoundingClientRect();
      el.style.setProperty('--hx', (mx - r.left).toFixed(0) + 'px');
      el.style.setProperty('--hy', (my - r.top).toFixed(0) + 'px');
      el.style.setProperty('--gx', ((mx / W - 0.5) * 40).toFixed(1));
      el.style.setProperty('--gy', ((my / H - 0.5) * 20).toFixed(1));
    });
  }

  function spawnTrail(x, y) {
    parts.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8 - 0.15,
      life: 1,
      decay: 0.018 + Math.random() * 0.02,
      size: 2 + Math.random() * 3.2
    });
    if (parts.length > 260) parts.splice(0, parts.length - 260);
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    mx = e.clientX; my = e.clientY;
    nx = mx / W - 0.5; ny = my / H - 0.5;
    if (!shown) {
      shown = true; rx = mx; ry = my; lx = mx; ly = my;
      if (e.pointerType === 'mouse') root.classList.add('has-cursor');
    }
    dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    if (!reduce) {
      var dx = mx - lx, dy = my - ly, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 6) {
        var n = Math.min(5, Math.floor(dist / 6));
        for (var i = 1; i <= n; i++) spawnTrail(lx + dx * (i / n), ly + dy * (i / n));
        lx = mx; ly = my;
      }
      spotlight();
    }
    magnet();
  }, { passive: true });

  window.addEventListener('pointerdown', function (e) {
    if (reduce) return;
    var x = e.clientX, y = e.clientY, i;
    rings.push({ x: x, y: y, r: 4, max: 96, life: 1, w: 2, wait: 0 });
    rings.push({ x: x, y: y, r: 2, max: 170, life: 1, w: 1, wait: 5 });
    for (i = 0; i < 20; i++) {
      var a = (i / 20) * TAU + (Math.random() - 0.5) * 0.35;
      var sp = 2.2 + Math.random() * 5.2;
      sparks.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.022 + Math.random() * 0.02, len: 5 + Math.random() * 9 });
    }
    for (i = 0; i < 8; i++) {
      var b = Math.random() * TAU;
      parts.push({ x: x, y: y, vx: Math.cos(b) * 1.2, vy: Math.sin(b) * 1.2, life: 1, decay: 0.03, size: 3 + Math.random() * 4 });
    }
    if (sparks.length > 240) sparks.splice(0, sparks.length - 240);
    ring.classList.add('is-down');
  }, { passive: true });
  function up() { ring.classList.remove('is-down'); }
  window.addEventListener('pointerup', up, { passive: true });
  window.addEventListener('pointercancel', up, { passive: true });

  document.addEventListener('pointerover', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    ring.classList.toggle('is-link', !!t.closest('a, button, summary, label, [data-hover], .card'));
    root.classList.toggle('is-field', !!t.closest('input, textarea, select'));
  }, { passive: true });
  document.addEventListener('pointerleave', function () { root.classList.remove('is-field'); });

  function frame() {
    rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
    if (shown) ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';

    if (!reduce) {
      tx += (nx - tx) * 0.07; ty += (ny - ty) * 0.07;
      depths.forEach(function (el) {
        var d = parseFloat(el.getAttribute('data-depth')) || 20;
        el.style.transform = 'translate3d(' + (tx * d).toFixed(2) + 'px,' + (ty * d).toFixed(2) + 'px,0)';
      });

      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      var i, p;
      for (i = parts.length - 1; i >= 0; i--) {
        p = parts[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.97; p.vy *= 0.97; p.life -= p.decay;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(214,178,94,' + (p.life * 0.16).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3.2 * p.life, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(242,217,143,' + (p.life * 0.85).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6 * p.life + 0.4, 0, TAU); ctx.fill();
      }
      for (i = sparks.length - 1; i >= 0; i--) {
        p = sparks[i];
        p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy = p.vy * 0.94 + 0.06; p.life -= p.decay;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        ctx.strokeStyle = 'rgba(242,217,143,' + p.life.toFixed(3) + ')';
        ctx.lineWidth = 1.6 * p.life + 0.3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - (p.vx / sp) * p.len * p.life, p.y - (p.vy / sp) * p.len * p.life);
        ctx.stroke();
      }
      for (i = rings.length - 1; i >= 0; i--) {
        p = rings[i];
        if (p.wait > 0) { p.wait--; continue; }
        p.r += (p.max - p.r) * 0.09;
        p.life -= 0.026;
        if (p.life <= 0) { rings.splice(i, 1); continue; }
        ctx.fillStyle = 'rgba(214,178,94,' + (p.life * 0.07).toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(242,217,143,' + (p.life * 0.9).toFixed(3) + ')';
        ctx.lineWidth = p.w * (0.4 + p.life);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);

  /* ---------- tilt + spotlight cards ---------- */
  function bindTilt(el) {
    if (el._tilt) return;
    el._tilt = true;
    el.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'touch') return;
      var r = el.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      el.style.setProperty('--sx', (px * 100).toFixed(1) + '%');
      el.style.setProperty('--sy', (py * 100).toFixed(1) + '%');
      if (!reduce) {
        el.style.transform = 'perspective(900px) rotateX(' + ((0.5 - py) * 8).toFixed(2) + 'deg) rotateY(' + ((px - 0.5) * 10).toFixed(2) + 'deg) translateY(-4px)';
      }
    });
    el.addEventListener('pointerleave', function () { el.style.transform = ''; });
  }
  qa('[data-tilt]').forEach(bindTilt);

  /* ---------- reveal on scroll + counters ---------- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var pre = el.getAttribute('data-prefix') || '';
    var suf = el.getAttribute('data-suffix') || '';
    var t0 = null;
    function step(t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / 1700, 1);
      var v = Math.round(target * (1 - Math.pow(1 - p, 4)));
      el.textContent = pre + v.toLocaleString('en-IN') + suf;
      if (p < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  var io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        io.unobserve(el);
        if (el.hasAttribute('data-count')) { if (!reduce) countUp(el); return; }
        el.classList.add('in');
        window.setTimeout(function () { el.classList.remove('reveal', 'in'); }, 1500);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  }
  function observeNew(scope) {
    var els = (scope || document).querySelectorAll('.reveal:not([data-obs]), [data-count]:not([data-obs])');
    Array.prototype.forEach.call(els, function (el, i) {
      el.setAttribute('data-obs', '1');
      if (!io) { el.classList.remove('reveal'); return; }
      if (el.classList.contains('reveal') && !el.style.getPropertyValue('--d')) {
        el.style.setProperty('--d', ((i % 4) * 0.08).toFixed(2) + 's');
      }
      io.observe(el);
    });
  }
  observeNew(document);

  /* ---------- tiny DOM helper, shared with content.js and pages.js ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : String(v));
    });
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    });
    return el;
  }

  window.AURUM = {
    h: h,
    // Call after inserting new cards or buttons so they get the same effects as the rest of the page.
    refresh: function (scope) {
      mags = qa('[data-magnetic]');
      depths = qa('[data-depth]');
      spots = qa('[data-spot]');
      qa('[data-tilt]').forEach(bindTilt);
      observeNew(scope);
    }
  };

  /* ---------- nav ---------- */
  var menu = document.querySelector('.menu-btn'), nav = document.getElementById('nav');
  if (menu && nav) {
    menu.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) { nav.classList.remove('open'); menu.setAttribute('aria-expanded', 'false'); }
    });
  }

  /* ---------- page transition ---------- */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button || a.target || reduce) return;
    var h = a.getAttribute('href');
    if (!h || h.charAt(0) === '#' || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;
    e.preventDefault();
    root.classList.add('leaving');
    window.setTimeout(function () { window.location.href = a.href; }, 360);
  });
  window.addEventListener('pageshow', function () { root.classList.remove('leaving'); });

  /* ---------- programs filter ---------- */
  var counter = document.getElementById('count');
  document.addEventListener('click', function (e) {
    var chip = e.target.closest && e.target.closest('[data-filter]');
    if (!chip) return;
    var f = chip.getAttribute('data-filter'), n = 0;
    qa('[data-filter]').forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
    qa('[data-cat]').forEach(function (it) {
      var show = f === 'all' || it.getAttribute('data-cat') === f;
      it.hidden = !show;
      if (show) { n++; it.classList.remove('pop'); void it.offsetWidth; it.classList.add('pop'); }
    });
    if (counter) counter.textContent = n + (n === 1 ? ' program' : ' programs');
  });

  /* ---------- pricing toggle ---------- */
  var sw = document.getElementById('billing');
  if (sw) {
    sw.addEventListener('click', function () {
      var annual = sw.getAttribute('aria-checked') !== 'true';
      sw.setAttribute('aria-checked', annual ? 'true' : 'false');
      qa('[data-monthly]').forEach(function (el) {
        var v = parseInt(el.getAttribute(annual ? 'data-annual' : 'data-monthly'), 10);
        el.textContent = '₹' + v.toLocaleString('en-IN');
      });
      qa('[data-note]').forEach(function (el) {
        el.textContent = annual ? el.getAttribute('data-note') : '';
      });
      qa('[data-per]').forEach(function (el) { el.textContent = annual ? 'per month, billed yearly' : 'per month'; });
    });
  }

  /* ---------- copy buttons ---------- */
  qa('[data-copy]').forEach(function (btn) {
    function selectText() {
      var t = btn.previousElementSibling;
      if (!t || !window.getSelection) return;
      var r = document.createRange(); r.selectNodeContents(t);
      var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
    }
    btn.addEventListener('click', function () {
      var label = btn.textContent;
      function done() { btn.textContent = 'Copied'; window.setTimeout(function () { btn.textContent = label; }, 1400); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(done, selectText);
      } else { selectText(); }
    });
  });
})();
