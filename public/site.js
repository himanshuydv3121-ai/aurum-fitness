(function () {
  'use strict';
  // Shared helpers for every page: API calls, formatting, the signed-in state in the navigation,
  // the newsletter form, and the owner's "Edit this page" button.
  var A = window.AURUM;
  if (!A) return;
  var h = A.h;

  A.api = function (method, url, body, raw) {
    var opts = { method: method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (raw) { opts.body = raw.body; opts.headers['Content-Type'] = raw.type; }
    else if (body !== undefined) { opts.body = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; }
    return fetch(url, opts).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Something went wrong. Please try again.');
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  };

  A.$ = function (id) { return document.getElementById(id); };
  A.clear = function (el) { while (el.firstChild) el.removeChild(el.firstChild); return el; };
  A.money = function (minor, cur) {
    var sym = !cur || cur === 'INR' ? '₹' : cur + ' ';
    return sym + (Number(minor) / 100).toLocaleString('en-IN');
  };
  A.rupees = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };
  A.date = function (v, tz) {
    if (!v) return '-';
    var d = new Date(v);
    return isNaN(d) ? '-' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: tz || undefined });
  };
  A.dateTime = function (v, tz) {
    var d = new Date(v);
    return isNaN(d) ? '-' : d.toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: tz || undefined });
  };
  A.dayKey = function (v, tz) {
    return new Date(v).toLocaleDateString('en-CA', { timeZone: tz || undefined });
  };
  A.dayLabel = function (v, tz) {
    return new Date(v).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz || undefined });
  };
  A.timeOnly = function (v, tz) {
    return new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz || undefined });
  };
  A.pill = function (status) { return h('span', { 'class': 'pill pill--' + status, text: status }); };
  A.show = function (el, text, kind) {
    el.textContent = text;
    el.className = 'form-note' + (kind === 'error' ? ' is-error' : '');
    el.hidden = false;
  };
  // Only same-site paths are allowed as a post-login destination.
  A.safeNext = function (value, fallback) {
    return /^\/[a-z]*(\?[A-Za-z0-9=&_%\-]*)?$/.test(value || '') ? value : fallback;
  };
  A.go = function (url) {
    document.documentElement.classList.add('leaving');
    window.setTimeout(function () { window.location.href = url; }, 250);
  };
  A.toLogin = function () {
    A.go('/login?next=' + encodeURIComponent(window.location.pathname + window.location.search));
  };
  A.table = function (headers, rows) {
    var head = h('tr', null, headers.map(function (t) { return h('th', { text: t }); }));
    return h('div', { 'class': 'scroll' }, [h('table', null, [h('thead', null, [head]), h('tbody', null, rows)])]);
  };
  A.cell = function (content, cls) { return h('td', cls ? { 'class': cls } : null, [content]); };

  /* ---------- who is signed in ---------- */
  // The server sets a plain "aurum_hint" cookie with the session, so visitors without one never
  // trigger a request.
  var mePromise = null;
  A.me = function () {
    if (!mePromise) {
      mePromise = /(?:^|;\s*)aurum_hint=/.test(document.cookie)
        ? A.api('GET', '/api/auth/me').then(function (r) { return r.member; }, function () { return null; })
        : Promise.resolve(null);
    }
    return mePromise;
  };

  A.me().then(function (m) {
    if (!m) return;
    document.documentElement.setAttribute('data-signed-in', m.role === 'admin' ? 'admin' : 'member');
    var nav = document.getElementById('nav');
    if (!nav || m.role !== 'admin') return;
    var book = nav.querySelector('.btn');
    var admin = h('a', { href: '/admin', 'class': 'nav-admin', text: 'Admin' });
    var edit = h('button', { type: 'button', 'class': 'nav-edit', text: 'Edit this page' });
    nav.insertBefore(admin, book);
    if (document.body.getAttribute('data-page') !== 'admin') nav.insertBefore(edit, book);
    edit.addEventListener('click', function () {
      if (window.AURUM_EDITOR) return window.AURUM_EDITOR.toggle();
      edit.disabled = true;
      var s = document.createElement('script');
      s.src = '/editor.js';
      s.onload = function () { edit.disabled = false; window.AURUM_EDITOR.toggle(); };
      s.onerror = function () { edit.disabled = false; };
      document.head.appendChild(s);
    });
  });

  /* ---------- newsletter ---------- */
  Array.prototype.forEach.call(document.querySelectorAll('[data-newsletter]'), function (form) {
    var note = form.querySelector('.form-note');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      var hp = form.elements.website;
      btn.disabled = true;
      A.api('POST', '/api/newsletter/subscribe', { email: form.elements.email.value, website: hp ? hp.value : '' })
        .then(function () { form.elements.email.value = ''; A.show(note, 'Thank you. You are on the list.'); })
        .catch(function (err) { A.show(note, err.message, 'error'); })
        .then(function () { btn.disabled = false; });
    });
  });
})();
