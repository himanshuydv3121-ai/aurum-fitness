(function () {
  'use strict';
  // Replaces the built-in program, trainer and plan cards with live data from the API.
  // If the API is unreachable the static cards already on the page stay as they are.
  var A = window.AURUM;
  if (!A) return;
  var h = A.h;
  var page = document.body.getAttribute('data-page');

  var ICONS = {
    bar: 'M3 12h18M6 8v8M9 6v12M15 6v12M18 8v8',
    pulse: 'M3 12h4l2-6 4 12 2-6h6',
    snow: 'M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9',
    leaf: 'M12 4c2 3 2 7 0 10-2-3-2-7 0-10zM4 12c4 0 6 2 8 6M20 12c-4 0-6 2-8 6',
    bolt: 'M13 3L5 13h6l-1 8 8-10h-6z',
    arc: 'M4 18c4-10 12-10 16 0M8 18c2-5 6-5 8 0',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    glove: 'M5 9h9a4 4 0 0 1 4 4v3H9a4 4 0 0 1-4-4V9zM9 20h9'
  };
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function icon(name) {
    var d = ICONS[name];
    var box = h('div', { 'class': 'icon' });
    if (!d) return box;
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    box.appendChild(svg);
    return box;
  }

  function get(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function swap(id, nodes) {
    var grid = document.getElementById(id);
    if (!grid || !nodes.length) return null;
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    nodes.forEach(function (n) { grid.appendChild(n); });
    A.refresh(grid);
    return grid;
  }

  function programCard(p) {
    var dots = [];
    for (var i = 0; i < 5; i++) dots.push(h('i', { 'class': i < p.level ? 'on' : '' }));
    return h('article', { 'class': 'card', 'data-tilt': true, 'data-cat': p.category }, [
      icon(p.icon),
      h('span', { 'class': 'tag', text: p.categoryLabel }),
      h('h3', { text: p.name }),
      h('p', { text: p.description }),
      h('div', { 'class': 'meta' }, [
        h('span', null, [h('b', { text: p.duration })]),
        h('span', { 'class': 'dots', role: 'img', 'aria-label': 'Intensity ' + p.level + ' of 5' }, dots),
        h('span', { text: p.schedule }),
        h('span', { text: 'Coach ' + p.coach })
      ])
    ]);
  }

  function trainerCard(t) {
    var portrait = h('div', { 'class': 'portrait' }, [h('b', { text: t.initials })]);
    if (/^#[0-9a-f]{3,8}$/i.test(t.color)) portrait.style.setProperty('--c1', t.color);
    return h('article', { 'class': 'card trainer reveal', 'data-tilt': true }, [
      portrait,
      h('span', { 'class': 'tag', text: t.role }),
      h('h3', { text: t.name }),
      h('p', { text: t.bio }),
      h('div', { 'class': 'meta' }, [h('span', null, [h('b', { text: t.cert })])])
    ]);
  }

  function rupees(n) { return '₹' + Number(n).toLocaleString('en-IN'); }

  function planCard(p) {
    var saving = Math.round((1 - p.annualPrice / p.monthlyPrice) * 100);
    var items = p.features.map(function (f) { return h('li', { text: f }); })
      .concat(p.excluded.map(function (f) { return h('li', { 'class': 'off', text: f }); }));
    return h('article', { 'class': 'card plan reveal' + (p.featured ? ' featured' : ''), 'data-tilt': true }, [
      p.featured ? h('span', { 'class': 'badge', text: 'Most chosen' }) : null,
      h('span', { 'class': 'tag', text: p.tag }),
      h('h3', { text: p.name }),
      h('div', { 'class': 'price' }, [
        h('b', { 'data-monthly': p.monthlyPrice, 'data-annual': p.annualPrice, text: rupees(p.monthlyPrice) }),
        h('span', { 'data-per': true, text: 'per month' })
      ]),
      h('p', { 'class': 'note', 'data-note': 'Save ' + saving + ' percent with annual billing' }),
      h('a', {
        'class': 'btn' + (p.featured ? '' : ' btn--ghost'), 'data-magnetic': true, 'data-plan-link': p.slug,
        href: 'checkout.html?plan=' + encodeURIComponent(p.slug) + '&billing=monthly', text: 'Choose ' + p.name
      }),
      h('ul', null, items)
    ]);
  }

  if (page === 'programs') {
    get('/api/programs').then(function (d) {
      var grid = swap('programs-grid', d.programs.map(programCard));
      if (!grid) return;
      var c = document.getElementById('count');
      if (c) c.textContent = d.programs.length + ' programs';
      var all = document.querySelector('[data-filter="all"]');
      if (all) all.click();
    }).catch(function () { /* keep the static cards */ });
  }

  if (page === 'trainers') {
    get('/api/trainers').then(function (d) {
      swap('trainers-grid', d.trainers.map(trainerCard));
    }).catch(function () {});
  }

  if (page === 'membership') {
    get('/api/plans').then(function (d) {
      if (!swap('plans-grid', d.plans.map(planCard))) return;
      var sw = document.getElementById('billing');
      if (!sw) return;
      var sync = function () {
        var billing = sw.getAttribute('aria-checked') === 'true' ? 'annual' : 'monthly';
        Array.prototype.forEach.call(document.querySelectorAll('[data-plan-link]'), function (a) {
          a.setAttribute('href', 'checkout.html?plan=' + encodeURIComponent(a.getAttribute('data-plan-link')) + '&billing=' + billing);
        });
      };
      // app.js registered its own click handler first, so aria-checked is already updated here.
      sw.addEventListener('click', sync);
      sync();
    }).catch(function () {});
  }
})();
