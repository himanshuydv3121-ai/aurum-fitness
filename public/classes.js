(function () {
  'use strict';
  // Class timetable on the Programs page: browse upcoming classes by day and book a seat.
  var A = window.AURUM;
  if (!A || document.body.getAttribute('data-page') !== 'programs') return;
  var h = A.h;
  var root = A.$('timetable-root');
  if (!root) return;

  var tz, data, member = null, selected = new URLSearchParams(window.location.search).get('program') || 'all';
  var status = h('p', { 'class': 'form-note', role: 'status', hidden: true });

  function load() {
    return A.api('GET', '/api/classes/sessions' + (selected !== 'all' ? '?program=' + encodeURIComponent(selected) : '')).then(function (d) {
      data = d;
      tz = d.timezone;
    });
  }

  function book(s, btn) {
    if (!member) {
      return A.go('/login?next=' + encodeURIComponent('/programs?program=' + s.programSlug));
    }
    btn.disabled = true;
    A.api('POST', '/api/classes/book', { sessionId: s.id }).then(function () {
      A.show(status, 'You are booked into ' + s.programName + ' on ' + A.dateTime(s.startsAt, tz) + '. A confirmation email is on its way.');
      return load().then(render);
    }).catch(function (err) {
      A.show(status, err.message, 'error');
      btn.disabled = false;
      if (err.status === 401) A.toLogin();
    });
  }

  function cancel(s, btn) {
    btn.disabled = true;
    A.api('GET', '/api/classes/mine').then(function (r) {
      var mine = r.bookings.filter(function (b) { return b.status === 'confirmed' && new Date(b.startsAt).getTime() === new Date(s.startsAt).getTime() && b.programName === s.programName; })[0];
      if (!mine) throw new Error('Booking not found.');
      return A.api('POST', '/api/classes/cancel', { id: mine.id });
    }).then(function () {
      A.show(status, 'Your booking has been cancelled.');
      return load().then(render);
    }).catch(function (err) { A.show(status, err.message, 'error'); btn.disabled = false; });
  }

  function row(s) {
    var full = s.seatsLeft <= 0;
    var action;
    if (s.bookedByMe) {
      action = h('button', { 'class': 'btn btn--sm btn--ghost', type: 'button', text: 'Cancel booking' });
      action.addEventListener('click', function () { cancel(s, action); });
    } else if (full) {
      action = h('span', { 'class': 'pill pill--cancelled', text: 'Full' });
    } else {
      action = h('button', { 'class': 'btn btn--sm', type: 'button', 'data-magnetic': true, text: member ? 'Book' : 'Sign in to book' });
      action.addEventListener('click', function () { book(s, action); });
    }
    var seats = s.bookedByMe ? 'You are booked' : full ? 'No seats left' : s.seatsLeft + (s.seatsLeft === 1 ? ' seat left' : ' seats left');
    return h('li', { 'class': 'slot' + (s.bookedByMe ? ' is-mine' : '') }, [
      h('div', { 'class': 'slot-time' }, [h('b', { text: A.timeOnly(s.startsAt, tz) }), h('span', { text: s.duration })]),
      h('div', { 'class': 'slot-info' }, [
        h('b', { text: s.programName }),
        h('span', { text: [s.coach ? 'Coach ' + s.coach : '', seats, s.notes].filter(Boolean).join(' · ') })
      ]),
      h('div', { 'class': 'slot-act' }, [action])
    ]);
  }

  function render() {
    A.clear(root);
    var programs = {};
    data.sessions.forEach(function (s) { programs[s.programSlug] = s.programName; });
    var filter = h('select', { 'class': 'mini-select', 'aria-label': 'Choose a program' }, [h('option', { value: 'all', text: 'All programs' })]);
    root.appendChild(h('div', { 'class': 'tt-bar' }, [filter]));
    root.appendChild(status);

    if (data.requireMembership && (!member || member.membershipStatus !== 'active')) {
      root.appendChild(h('p', { 'class': 'form-note' }, [
        'Booking is for active members. ',
        h('a', { href: '/membership', text: 'Choose a plan' }), ' to start booking.'
      ]));
    }
    if (!data.sessions.length) {
      root.appendChild(h('p', { 'class': 'muted', text: 'No classes are scheduled yet. Please check back soon.' }));
    }
    var byDay = {}, order = [];
    data.sessions.forEach(function (s) {
      var k = A.dayKey(s.startsAt, tz);
      if (!byDay[k]) { byDay[k] = []; order.push(k); }
      byDay[k].push(s);
    });
    order.forEach(function (k) {
      root.appendChild(h('div', { 'class': 'tt-day reveal' }, [
        h('h3', { text: A.dayLabel(byDay[k][0].startsAt, tz) }),
        h('ul', { 'class': 'slots' }, byDay[k].map(row))
      ]));
    });
    A.refresh(root);

    // Program list for the filter comes from the public programs list so every program is offered.
    A.api('GET', '/api/programs').then(function (p) {
      p.programs.forEach(function (x) { filter.appendChild(h('option', { value: x.slug, text: x.name, selected: x.slug === selected })); });
      filter.value = selected;
    }).catch(function () {});
    filter.addEventListener('change', function () {
      selected = filter.value;
      load().then(render).catch(function (err) { A.show(status, err.message, 'error'); });
    });
  }

  A.me().then(function (m) { member = m; })
    .then(load).then(render)
    .then(function () { if (selected !== 'all' && window.location.hash === '#timetable') root.scrollIntoView({ behavior: 'smooth', block: 'start' }); })
    .catch(function () { A.clear(root).appendChild(h('p', { 'class': 'form-note is-error', text: 'The timetable could not be loaded. Please refresh.' })); });
})();
