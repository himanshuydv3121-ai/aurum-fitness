(function () {
  'use strict';
  // Fills the program, trainer and plan areas with live data from the API.
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

  function fill(id, nodes, emptyText) {
    var grid = document.getElementById(id);
    if (!grid) return null;
    A.clear(grid);
    if (!nodes.length) {
      grid.appendChild(h('p', { 'class': 'muted', text: emptyText }));
      return grid;
    }
    nodes.forEach(function (n) { grid.appendChild(n); });
    A.refresh(grid);
    return grid;
  }

  function programCard(p, wrap) {
    var dots = [];
    for (var i = 0; i < 5; i++) dots.push(h('i', { 'class': i < p.level ? 'on' : '' }));
    var meta = [
      h('span', null, [h('b', { text: p.duration })]),
      h('span', { 'class': 'dots', role: 'img', 'aria-label': 'Intensity ' + p.level + ' of 5' }, dots)
    ];
    if (p.schedule) meta.push(h('span', { text: p.schedule }));
    if (p.coach) meta.push(h('span', { text: 'Coach ' + p.coach }));
    var card = h('article', { 'class': 'card', 'data-tilt': true, 'data-cat': p.category }, [
      icon(p.icon),
      h('span', { 'class': 'tag', text: p.categoryLabel }),
      h('h3', { text: p.name }),
      h('p', { text: p.description }),
      h('div', { 'class': 'meta' }, meta),
      h('a', { 'class': 'link-arrow card-link', href: '/programs?program=' + encodeURIComponent(p.slug) + '#timetable', 'data-magnetic': true }, ['See class times ', h('span', { text: '→' })])
    ]);
    return wrap ? h('div', { 'class': 'reveal' }, [card]) : card;
  }

  function trainerCard(t) {
    var portrait = h('div', { 'class': 'portrait' }, t.photo ? [h('img', { src: t.photo, alt: t.name, loading: 'lazy' })] : [h('b', { text: t.initials })]);
    if (/^#[0-9a-f]{3,8}$/i.test(t.color)) portrait.style.setProperty('--c1', t.color);
    return h('article', { 'class': 'card trainer reveal', 'data-tilt': true }, [
      portrait,
      h('span', { 'class': 'tag', text: t.role }),
      h('h3', { text: t.name }),
      h('p', { text: t.bio }),
      t.cert ? h('div', { 'class': 'meta' }, [h('span', null, [h('b', { text: t.cert })])]) : null
    ]);
  }

  function planCard(p) {
    var saving = Math.max(0, Math.round((1 - p.annualPrice / p.monthlyPrice) * 100));
    var items = p.features.map(function (f) { return h('li', { text: f }); })
      .concat(p.excluded.map(function (f) { return h('li', { 'class': 'off', text: f }); }));
    return h('article', { 'class': 'card plan reveal' + (p.featured ? ' featured' : ''), 'data-tilt': true }, [
      p.featured ? h('span', { 'class': 'badge', text: 'Most chosen' }) : null,
      h('span', { 'class': 'tag', text: p.tag }),
      h('h3', { text: p.name }),
      h('div', { 'class': 'price' }, [
        h('b', { 'data-monthly': p.monthlyPrice, 'data-annual': p.annualPrice, text: A.rupees(p.monthlyPrice) }),
        h('span', { 'data-per': true, text: 'per month' })
      ]),
      h('p', { 'class': 'note', 'data-note': saving ? 'Save ' + saving + ' percent with annual billing' : '' }),
      h('a', {
        'class': 'btn' + (p.featured ? '' : ' btn--ghost'), 'data-magnetic': true, 'data-plan-link': p.slug,
        href: '/checkout?plan=' + encodeURIComponent(p.slug) + '&billing=monthly', text: 'Choose ' + p.name
      }),
      h('ul', null, items)
    ]);
  }

  if (page === 'programs' || page === 'index') {
    get('/api/programs').then(function (d) {
      var list = d.programs;
      if (page === 'index') {
        var featured = list.filter(function (p) { return p.featured; });
        fill('featured-grid', (featured.length ? featured : list.slice(0, 3)).map(function (p) { return programCard(p, true); }), 'Programs are coming soon.');
        return;
      }
      fill('programs-grid', list.map(function (p) { return programCard(p); }), 'Programs are coming soon.');
      // Filter chips follow whatever categories the owner has set up.
      var chips = document.querySelector('.filters');
      var seen = {};
      list.forEach(function (p) {
        if (seen[p.category]) return;
        seen[p.category] = true;
        chips.appendChild(h('button', { 'class': 'chip', type: 'button', 'data-filter': p.category, 'aria-pressed': 'false', text: p.categoryLabel }));
      });
      var all = document.querySelector('[data-filter="all"]');
      if (all) all.click();
    }).catch(function () {
      var g = document.getElementById('programs-grid') || document.getElementById('featured-grid');
      if (g) g.textContent = 'Programs could not be loaded. Please refresh.';
    });
  }

  if (page === 'trainers') {
    get('/api/trainers').then(function (d) {
      fill('trainers-grid', d.trainers.map(trainerCard), 'Our coaches will be listed here soon.');
    }).catch(function () {
      var g = document.getElementById('trainers-grid');
      if (g) g.textContent = 'Coaches could not be loaded. Please refresh.';
    });
  }

  if (page === 'membership') {
    get('/api/plans').then(function (d) {
      if (!fill('plans-grid', d.plans.map(planCard), 'Plans are coming soon.')) return;
      var sw = document.getElementById('billing');
      if (!sw) return;
      var sync = function () {
        var billing = sw.getAttribute('aria-checked') === 'true' ? 'annual' : 'monthly';
        Array.prototype.forEach.call(document.querySelectorAll('[data-plan-link]'), function (a) {
          a.setAttribute('href', '/checkout?plan=' + encodeURIComponent(a.getAttribute('data-plan-link')) + '&billing=' + billing);
        });
      };
      // app.js registered its own click handler first, so aria-checked is already updated here.
      sw.addEventListener('click', sync);
      sync();
    }).catch(function () {
      var g = document.getElementById('plans-grid');
      if (g) g.textContent = 'Plans could not be loaded. Please refresh.';
    });
  }

  if (page === 'contact') {
    var sel = document.getElementById('plan');
    if (sel) get('/api/plans').then(function (d) {
      d.plans.forEach(function (p) { sel.appendChild(h('option', { value: p.name, text: p.name, selected: p.featured })); });
    }).catch(function () {});
  }
})();
