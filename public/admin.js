(function () {
  'use strict';
  // Owner admin panel. Everything the club shows or does can be managed from here.
  var A = window.AURUM;
  if (!A || document.body.getAttribute('data-page') !== 'admin') return;
  var h = A.h, api = A.api, clear = A.clear, cell = A.cell;
  var root = A.$('admin-root');
  var tz = 'Asia/Kolkata';
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  var panel = h('div', { 'class': 'adm-panel stack' });
  var flash = h('p', { 'class': 'form-note', role: 'status', hidden: true });
  var current = null;

  function say(text, kind) { A.show(flash, text, kind); if (kind !== 'error') window.setTimeout(function () { flash.hidden = true; }, 5000); }
  function fail(err) { if (err.status === 401) return A.toLogin(); say(err.message, 'error'); }
  function btn(text, cls, fn) { var b = h('button', { type: 'button', 'class': 'btn btn--sm ' + (cls || ''), text: text }); b.addEventListener('click', fn); return b; }
  function small(text, fn, danger) { var b = h('button', { type: 'button', 'class': 'mini-btn' + (danger ? ' is-danger' : ''), text: text }); b.addEventListener('click', fn); return b; }
  function head(title, actions, sub) {
    return h('div', { 'class': 'adm-head' }, [h('div', null, [h('h3', { text: title }), sub ? h('p', { 'class': 'muted', text: sub }) : null]), h('div', { 'class': 'btn-row' }, actions || [])]);
  }
  function download(what) { return h('a', { 'class': 'btn btn--sm btn--ghost', href: '/api/admin/' + 'export?what=' + what, text: 'Download CSV' }); }
  function empty(text) { return h('p', { 'class': 'muted', text: text }); }
  function tick(v) { return v ? 'Yes' : 'No'; }

  /* ---------- generic form dialog ---------- */
  function openForm(opts) {
    var dlg = h('dialog', { 'class': 'adm-dialog' });
    var note = h('p', { 'class': 'form-note', hidden: true, role: 'alert' });
    var inputs = {};
    var body = h('div', { 'class': 'adm-fields' });
    opts.fields.forEach(function (f) {
      var val = opts.values && opts.values[f.key] !== undefined && opts.values[f.key] !== null ? opts.values[f.key] : (f.def !== undefined ? f.def : '');
      var id = 'f-' + f.key, input, wrap;
      if (f.type === 'textarea' || f.type === 'lines') {
        if (Array.isArray(val)) val = val.join('\n');
        input = h('textarea', { id: id, rows: f.rows || 3 }); input.value = val;
      } else if (f.type === 'select') {
        input = h('select', { id: id }, f.options.map(function (o) { return h('option', { value: o[0], text: o[1] }); })); input.value = val;
      } else if (f.type === 'checkbox') {
        input = h('input', { id: id, type: 'checkbox' }); input.checked = !!val;
      } else if (f.type === 'days') {
        var set = String(val).split(',').filter(Boolean);
        input = h('div', { 'class': 'adm-days', id: id }, DAYS.map(function (d, i) {
          var c = h('input', { type: 'checkbox', value: String(i) }); c.checked = set.indexOf(String(i)) !== -1;
          return h('label', null, [c, ' ' + d]);
        }));
      } else if (f.type === 'image') {
        var holder = h('div', { 'class': 'adm-image' });
        var hidden = h('input', { type: 'hidden', id: id, value: val });
        var preview = h('img', { alt: '', hidden: !val, src: val || '' });
        var file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif' });
        var clearBtn = small('Remove', function () { hidden.value = ''; preview.hidden = true; });
        file.addEventListener('change', function () {
          var fl = file.files[0];
          if (!fl) return;
          if (fl.size > 2 * 1024 * 1024) { A.show(note, 'Images must be 2 MB or smaller.', 'error'); return; }
          api('POST', '/api/admin/media', undefined, { body: fl, type: fl.type }).then(function (r) {
            hidden.value = r.url; preview.src = r.url; preview.hidden = false; note.hidden = true;
          }).catch(function (err) { A.show(note, err.message, 'error'); });
        });
        holder.appendChild(preview); holder.appendChild(file); holder.appendChild(clearBtn); holder.appendChild(hidden);
        input = hidden; wrap = holder;
      } else {
        input = h('input', { id: id, type: f.type || 'text', min: f.min, max: f.max, step: f.step, placeholder: f.placeholder, autocomplete: 'off', list: f.list });
        input.value = val;
      }
      inputs[f.key] = { el: input, f: f };
      body.appendChild(h('div', { 'class': 'field' + (f.type === 'textarea' || f.type === 'lines' || f.type === 'days' || f.type === 'image' ? ' full' : '') + (f.type === 'checkbox' ? ' is-check' : '') }, [
        h('label', { 'for': id, text: f.label }), wrap || input, f.hint ? h('span', { 'class': 'hint', text: f.hint }) : null
      ]));
    });
    function collect() {
      var out = {};
      Object.keys(inputs).forEach(function (k) {
        var f = inputs[k].f, el = inputs[k].el;
        if (f.type === 'checkbox') out[k] = el.checked;
        else if (f.type === 'days') out[k] = Array.prototype.filter.call(el.querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }).join(',');
        else if (f.type === 'number') out[k] = el.value === '' ? '' : Number(el.value);
        else out[k] = el.value;
      });
      return out;
    }
    var form = h('form', { method: 'dialog', novalidate: true }, [
      h('h3', { text: opts.title }), body, note,
      h('div', { 'class': 'btn-row' }, [
        h('button', { 'class': 'btn btn--sm', type: 'submit', text: opts.submit || 'Save' }),
        btn('Cancel', 'btn--ghost', function () { dlg.close(); })
      ])
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var b = form.querySelector('button[type="submit"]');
      b.disabled = true;
      Promise.resolve(opts.onSave(collect())).then(function () { dlg.close(); }).catch(function (err) {
        A.show(note, err.message, 'error'); b.disabled = false;
        if (err.status === 401) A.toLogin();
      });
    });
    dlg.appendChild(form);
    dlg.addEventListener('close', function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }

  function confirmDo(text, fn) { if (window.confirm(text)) fn(); }
  function reloadAfter(p) { return p.then(function () { return views[current](); }).catch(fail); }

  var views = {};

  /* ---------- overview ---------- */
  views.overview = function () {
    return api('GET', '/api/admin/overview').then(function (r) {
      var o = r.overview, i = r.integrations;
      function stat(n, label) { return h('div', { 'class': 'stat' }, [h('b', { text: String(n) }), h('span', { text: label })]); }
      clear(panel);
      panel.appendChild(head('Overview'));
      panel.appendChild(h('div', { 'class': 'stats' }, [
        stat(o.newBookings, 'New tour requests'), stat(o.activeMembers, 'Active members'), stat(o.members, 'Registered accounts'),
        stat(o.upcomingClasses, 'Upcoming classes'), stat(o.upcomingSeatsBooked, 'Seats booked'), stat(o.subscribers, 'Newsletter subscribers'),
        stat(o.pendingPayments, 'Pending payments'), stat(A.money(o.monthRevenueMinor), 'Revenue this month'), stat(A.money(o.revenueMinor), 'Revenue all time')
      ]));
      var notes = [];
      if (!i.email) notes.push('Email sending is not set up. Messages are saved under Emails but not delivered. Add SMTP_URL in your hosting settings.');
      if (i.paymentProvider === 'test') notes.push('Payments are in test mode: no real money is collected. Set PAYMENT_PROVIDER to razorpay or offline in your hosting settings.');
      if (i.paymentProvider === 'razorpay' && !i.razorpay) notes.push('Razorpay is selected but RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are missing.');
      panel.appendChild(h('div', { 'class': 'stack' }, [h('h4', { text: 'Setup status' })].concat(notes.length ? notes.map(function (n) { return h('p', { 'class': 'form-note is-error', text: n }); }) : [h('p', { 'class': 'form-note', text: 'Email and payments are configured (' + i.paymentProvider + ').' })])));
      panel.appendChild(h('p', { 'class': 'muted' }, ['To change any wording, open the page and press "Edit this page" in the menu. Programs, trainers, plans, the timetable, colours and contact settings are in the tabs above.']));
    });
  };

  /* ---------- tour requests ---------- */
  views.requests = function () {
    return api('GET', '/api/admin/bookings').then(function (r) {
      clear(panel);
      panel.appendChild(head('Tour requests', [download('tours')]));
      if (!r.bookings.length) return panel.appendChild(empty('No tour requests yet.'));
      var STATUSES = ['new', 'contacted', 'toured', 'closed'];
      panel.appendChild(A.table(['Received', 'Name', 'Contact', 'Interest', 'Time', 'Plan', 'Goals', 'Status', ''], r.bookings.map(function (b) {
        var sel = h('select', { 'class': 'mini-select', 'aria-label': 'Status for ' + b.fullName }, STATUSES.map(function (s) { return h('option', { value: s, selected: s === b.status, text: s }); }));
        sel.addEventListener('change', function () {
          api('PATCH', '/api/admin/bookings', { id: b.id, status: sel.value }).then(function () { say('Status updated.'); }).catch(fail);
        });
        var notes = h('button', { 'class': 'mini-btn', type: 'button', text: b.notes ? 'Notes *' : 'Notes' });
        notes.addEventListener('click', function () {
          openForm({ title: 'Notes for ' + b.fullName, fields: [{ key: 'notes', label: 'Private notes', type: 'textarea', rows: 5 }], values: { notes: b.notes },
            onSave: function (v) { return api('PATCH', '/api/admin/bookings', { id: b.id, notes: v.notes }).then(function () { b.notes = v.notes; return views.requests(); }); } });
        });
        return h('tr', null, [cell(A.dateTime(b.createdAt)), cell(b.fullName), cell(b.email + (b.phone ? ' / ' + b.phone : '')), cell(b.interest), cell(b.slot), cell(b.plan || '-'), cell(b.message || '-', 'wrap-cell'), cell(sel),
          cell(h('span', { 'class': 'row-actions' }, [notes, small('Delete', function () { confirmDo('Delete this request?', function () { reloadAfter(api('DELETE', '/api/admin/bookings?id=' + b.id)); }); }, true)]))]);
      })));
    });
  };

  /* ---------- members ---------- */
  views.members = function () {
    return Promise.all([api('GET', '/api/admin/members'), api('GET', '/api/admin/plans')]).then(function (res) {
      var members = res[0].members, plans = res[1].plans;
      var planOpts = [['', 'No plan']].concat(plans.map(function (p) { return [p.slug, p.name]; }));
      var fields = [
        { key: 'fullName', label: 'Full name' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'phone', label: 'Phone', type: 'tel' },
        { key: 'role', label: 'Role', type: 'select', options: [['member', 'Member'], ['admin', 'Admin (full access)']] },
        { key: 'active', label: 'Account active', type: 'checkbox', def: true, hint: 'Untick to block sign-in.' },
        { key: 'plan', label: 'Plan', type: 'select', options: planOpts },
        { key: 'billing', label: 'Billing', type: 'select', options: [['', '-'], ['monthly', 'Monthly'], ['annual', 'Yearly']] },
        { key: 'membershipStatus', label: 'Membership status', type: 'select', options: [['none', 'None'], ['active', 'Active'], ['expired', 'Expired']] },
        { key: 'membershipUntil', label: 'Valid until', type: 'date' },
        { key: 'password', label: 'New password', type: 'password', hint: 'Leave blank to keep the current one. Changing it signs the member out everywhere.' }
      ];
      clear(panel);
      panel.appendChild(head('Members', [btn('Add member', '', function () {
        openForm({ title: 'Add member', fields: [fields[0], fields[1], fields[2], fields[3], { key: 'password', label: 'Password (at least 10 characters)', type: 'password' }], values: {}, submit: 'Create',
          onSave: function (v) { return api('POST', '/api/admin/members', v).then(function () { say('Member added.'); return views.members(); }); } });
      }), download('members')]));
      var search = h('input', { type: 'search', 'class': 'adm-search', placeholder: 'Search name or email', 'aria-label': 'Search members' });
      panel.appendChild(search);
      var holder = h('div');
      panel.appendChild(holder);
      function draw() {
        var t = search.value.trim().toLowerCase();
        clear(holder);
        var rows = members.filter(function (m) { return !t || (m.fullName + ' ' + m.email).toLowerCase().indexOf(t) !== -1; });
        holder.appendChild(A.table(['Joined', 'Name', 'Email', 'Role', 'Plan', 'Status', 'Until', ''], rows.map(function (m) {
          return h('tr', null, [cell(A.date(m.createdAt)), cell(m.fullName + (m.active ? '' : ' (blocked)')), cell(m.email), cell(m.role), cell(m.plan ? m.plan + ' (' + m.billing + ')' : '-'), cell(A.pill(m.membershipStatus)), cell(A.date(m.membershipUntil)),
            cell(small('Edit', function () {
              openForm({ title: 'Edit ' + m.fullName, fields: fields, values: { fullName: m.fullName, email: m.email, phone: m.phone, role: m.role, active: m.active, plan: m.plan || '', billing: m.billing || '', membershipStatus: m.membershipStatus, membershipUntil: m.membershipUntil ? String(m.membershipUntil).slice(0, 10) : '' },
                onSave: function (v) { if (!v.password) delete v.password; v.id = m.id; return api('PATCH', '/api/admin/members', v).then(function () { say('Member saved.'); return views.members(); }); } });
            }))]);
        })));
      }
      search.addEventListener('input', draw);
      draw();
    });
  };

  /* ---------- payments ---------- */
  views.payments = function () {
    return api('GET', '/api/admin/payments').then(function (r) {
      clear(panel);
      panel.appendChild(head('Payments', [download('payments')], 'For pay-at-the-desk orders, mark the payment paid once you have collected it. That starts the membership.'));
      if (!r.payments.length) return panel.appendChild(empty('No payments yet.'));
      panel.appendChild(A.table(['Date', 'Member', 'Plan', 'Billing', 'Amount', 'Status', 'Provider', 'Reference', ''], r.payments.map(function (p) {
        var acts = [];
        if (p.status === 'pending') {
          acts.push(small('Mark paid', function () { confirmDo('Mark ' + p.ref + ' as paid and start the membership?', function () { reloadAfter(api('PATCH', '/api/admin/payments', { id: p.id, status: 'paid' })); }); }));
          acts.push(small('Cancel', function () { confirmDo('Cancel this pending payment?', function () { reloadAfter(api('PATCH', '/api/admin/payments', { id: p.id, status: 'cancelled' })); }); }, true));
        }
        return h('tr', null, [cell(A.dateTime(p.createdAt)), cell(p.memberName + ' / ' + p.memberEmail), cell(p.planName), cell(p.billing), cell(A.money(p.amountMinor, p.currency), 'num'), cell(A.pill(p.status)), cell(p.provider), cell(p.ref), cell(h('span', { 'class': 'row-actions' }, acts))]);
      })));
    });
  };

  /* ---------- generic list + dialog for programs, trainers, plans ---------- */
  function crud(cfg) {
    return api('GET', '/api/admin/' + cfg.endpoint).then(function (r) {
      var rows = r[cfg.listKey];
      clear(panel);
      function edit(row) {
        openForm({ title: row ? 'Edit ' + row.name : 'Add ' + cfg.noun, fields: cfg.fields(rows), values: row ? cfg.toForm(row) : cfg.defaults || {},
          onSave: function (v) {
            var req = row ? api('PUT', '/api/admin/' + cfg.endpoint, Object.assign({ slug: row.slug }, v)) : api('POST', '/api/admin/' + cfg.endpoint, v);
            return req.then(function () { say('Saved. It is live on the site within a minute.'); return views[cfg.view](); });
          } });
      }
      panel.appendChild(head(cfg.title, [btn('Add ' + cfg.noun, '', function () { edit(null); })], cfg.sub));
      if (!rows.length) return panel.appendChild(empty('Nothing here yet.'));
      panel.appendChild(A.table(cfg.columns.map(function (c) { return c[0]; }).concat(['']), rows.map(function (row) {
        return h('tr', null, cfg.columns.map(function (c) { return cell(c[1](row)); }).concat([cell(h('span', { 'class': 'row-actions' }, [
          small('Edit', function () { edit(row); }),
          small('Delete', function () { confirmDo('Delete ' + row.name + '? This cannot be undone.', function () { reloadAfter(api('DELETE', '/api/admin/' + cfg.endpoint + '?slug=' + encodeURIComponent(row.slug))); }); }, true)
        ]))]));
      })));
    });
  }

  views.programs = function () {
    return crud({
      view: 'programs', endpoint: 'programs', listKey: 'programs', noun: 'program', title: 'Programs',
      sub: 'Set the weekly days, start time and seats and the timetable fills itself in. Clearing the days makes it a "by booking" program.',
      columns: [['Name', function (p) { return p.name; }], ['Category', function (p) { return p.categoryLabel; }], ['Schedule', function (p) { return p.schedule; }], ['Seats', function (p) { return String(p.capacity); }], ['Featured', function (p) { return tick(p.featured); }], ['Shown', function (p) { return tick(p.active); }]],
      defaults: { icon: 'bar', level: 3, duration: '60 min', capacity: 8, active: true },
      toForm: function (p) { return p; },
      fields: function (rows) {
        var cats = {}; rows.forEach(function (p) { cats[p.categoryLabel] = 1; });
        var dl = document.getElementById('cat-list') || h('datalist', { id: 'cat-list' });
        clear(dl); Object.keys(cats).forEach(function (c) { dl.appendChild(h('option', { value: c })); }); document.body.appendChild(dl);
        return [
          { key: 'name', label: 'Name' }, { key: 'categoryLabel', label: 'Category', list: 'cat-list', hint: 'Becomes a filter button on the Programs page.' },
          { key: 'icon', label: 'Icon', type: 'select', options: ['bar', 'pulse', 'snow', 'leaf', 'bolt', 'arc', 'moon', 'glove'].map(function (i) { return [i, i]; }) },
          { key: 'description', label: 'Description', type: 'textarea' },
          { key: 'duration', label: 'Duration', hint: 'For example 60 min.' }, { key: 'level', label: 'Intensity (1 to 5)', type: 'number', min: 1, max: 5 },
          { key: 'coach', label: 'Coach' }, { key: 'capacity', label: 'Seats per class', type: 'number', min: 0, max: 500 },
          { key: 'days', label: 'Weekly days', type: 'days' }, { key: 'startTime', label: 'Start time', type: 'time' },
          { key: 'schedule', label: 'Schedule text (optional)', hint: 'Leave blank to build it from the days and time.' },
          { key: 'featured', label: 'Show on home page', type: 'checkbox' }, { key: 'active', label: 'Shown on the site', type: 'checkbox' },
          { key: 'sort', label: 'Order (lowest first)', type: 'number', min: 0 }
        ];
      }
    });
  };

  views.trainers = function () {
    return crud({
      view: 'trainers', endpoint: 'trainers', listKey: 'trainers', noun: 'trainer', title: 'Trainers',
      columns: [['Name', function (t) { return t.name; }], ['Role', function (t) { return t.role; }], ['Certification', function (t) { return t.cert || '-'; }], ['Shown', function (t) { return tick(t.active); }]],
      defaults: { color: '#3a3018', active: true },
      toForm: function (t) { return t; },
      fields: function () {
        return [
          { key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }, { key: 'bio', label: 'Bio', type: 'textarea' }, { key: 'cert', label: 'Certification' },
          { key: 'photo', label: 'Photo', type: 'image', hint: 'PNG, JPEG, WebP or GIF up to 2 MB. Portrait works best. Without a photo the initials are shown.' },
          { key: 'initials', label: 'Initials (optional)' }, { key: 'color', label: 'Portrait colour', type: 'color' },
          { key: 'active', label: 'Shown on the site', type: 'checkbox' }, { key: 'sort', label: 'Order (lowest first)', type: 'number', min: 0 }
        ];
      }
    });
  };

  views.plans = function () {
    return crud({
      view: 'plans', endpoint: 'plans', listKey: 'plans', noun: 'plan', title: 'Membership plans',
      sub: 'Prices are in rupees per month. The yearly price is the per-month rate when billed for 12 months at once.',
      columns: [['Name', function (p) { return p.name; }], ['Monthly', function (p) { return A.rupees(p.monthlyPrice); }], ['Yearly (per month)', function (p) { return A.rupees(p.annualPrice); }], ['Highlighted', function (p) { return tick(p.featured); }], ['Shown', function (p) { return tick(p.active); }]],
      defaults: { active: true },
      toForm: function (p) { return p; },
      fields: function () {
        return [
          { key: 'name', label: 'Name' }, { key: 'tag', label: 'Short tag', hint: 'For example Train or Perform.' },
          { key: 'monthlyPrice', label: 'Monthly price (₹)', type: 'number', min: 1 }, { key: 'annualPrice', label: 'Yearly price per month (₹)', type: 'number', min: 1 },
          { key: 'features', label: 'Included (one per line)', type: 'lines', rows: 6 }, { key: 'excluded', label: 'Not included (one per line)', type: 'lines', rows: 3 },
          { key: 'featured', label: 'Highlight as most chosen', type: 'checkbox' }, { key: 'active', label: 'Shown on the site', type: 'checkbox' },
          { key: 'sort', label: 'Order (lowest first)', type: 'number', min: 0 }
        ];
      }
    });
  };

  /* ---------- timetable ---------- */
  views.timetable = function () {
    return Promise.all([api('GET', '/api/admin/sessions'), api('GET', '/api/admin/programs')]).then(function (res) {
      tz = res[0].timezone;
      var sessions = res[0].sessions, programs = res[1].programs;
      clear(panel);
      panel.appendChild(head('Timetable', [btn('Add one-off class', '', function () {
        openForm({ title: 'Add a one-off class', fields: [
          { key: 'programSlug', label: 'Program', type: 'select', options: programs.map(function (p) { return [p.slug, p.name]; }) },
          { key: 'startsAtLocal', label: 'Date and time (' + tz + ')', type: 'datetime-local' },
          { key: 'capacity', label: 'Seats', type: 'number', min: 0, max: 500 }, { key: 'notes', label: 'Note (shown to members)' }
        ], values: { capacity: 8 }, onSave: function (v) { return api('POST', '/api/admin/sessions', v).then(function () { say('Class added.'); return views.timetable(); }); } });
      })], 'Weekly classes are created from each program. Change seats or cancel a single class here. Times are in ' + tz + '.'));
      if (!sessions.length) return panel.appendChild(empty('No upcoming classes. Set weekly days and a start time on a program.'));
      panel.appendChild(A.table(['When', 'Class', 'Booked', 'Seats', 'Note', 'Status', ''], sessions.map(function (s) {
        return h('tr', null, [cell(A.dateTime(s.startsAt, tz)), cell(s.programName), cell(String(s.booked)), cell(String(s.capacity)), cell(s.notes || '-'), cell(s.cancelled ? A.pill('cancelled') : A.pill('active')),
          cell(small('Edit', function () {
            openForm({ title: s.programName + ', ' + A.dateTime(s.startsAt, tz), fields: [
              { key: 'capacity', label: 'Seats', type: 'number', min: 0, max: 500 }, { key: 'notes', label: 'Note (shown to members)' },
              { key: 'cancelled', label: 'Cancel this class', type: 'checkbox', hint: 'Booked members are cancelled and emailed.' }
            ], values: s, onSave: function (v) { v.id = s.id; return api('PATCH', '/api/admin/sessions', v).then(function () { say('Class updated.'); return views.timetable(); }); } });
          }))]);
      })));
    });
  };

  views.classbookings = function () {
    return api('GET', '/api/admin/classbookings').then(function (r) {
      tz = r.timezone;
      clear(panel);
      panel.appendChild(head('Class bookings', [], 'Upcoming and recent bookings.'));
      if (!r.bookings.length) return panel.appendChild(empty('No class bookings yet.'));
      panel.appendChild(A.table(['Class time', 'Class', 'Member', 'Email', 'Status', ''], r.bookings.map(function (b) {
        return h('tr', null, [cell(A.dateTime(b.startsAt, tz)), cell(b.programName), cell(b.memberName), cell(b.memberEmail), cell(A.pill(b.classCancelled ? 'cancelled' : b.status)),
          cell(b.status === 'confirmed' ? small('Cancel', function () { confirmDo('Cancel this booking and email the member?', function () { reloadAfter(api('POST', '/api/admin/classbookings', { id: b.id })); }); }, true) : '')]);
      })));
    });
  };

  /* ---------- newsletter and emails ---------- */
  views.newsletter = function () {
    return api('GET', '/api/admin/subscribers').then(function (r) {
      clear(panel);
      var active = r.subscribers.filter(function (s) { return s.active; });
      panel.appendChild(head('Newsletter', [btn('Write a message', '', function () {
        openForm({ title: 'Send to ' + active.length + ' subscribers', fields: [{ key: 'subject', label: 'Subject' }, { key: 'body', label: 'Message', type: 'textarea', rows: 10, hint: 'Plain text. An unsubscribe link is added automatically.' }], submit: 'Send now',
          onSave: function (v) {
            if (!window.confirm('Send this to ' + active.length + ' subscribers now?')) return Promise.reject(new Error('Not sent.'));
            var sent = 0;
            function batch(offset) {
              return api('POST', '/api/admin/subscribers', { subject: v.subject, body: v.body, offset: offset }).then(function (b) {
                sent += b.sent; say('Sending... ' + sent + ' of ' + b.total);
                if (b.next !== null) return batch(b.next);
                say('Sent to ' + sent + ' subscribers.' + (b.emailConfigured ? '' : ' Email is not set up, so messages were only saved under Emails.'));
              });
            }
            return batch(0);
          } });
      }), download('subscribers')], active.length + ' active subscribers.'));
      if (!r.subscribers.length) return panel.appendChild(empty('No subscribers yet. The sign-up form is in the footer of every page.'));
      panel.appendChild(A.table(['Joined', 'Email', 'Status', ''], r.subscribers.map(function (s) {
        return h('tr', null, [cell(A.date(s.createdAt)), cell(s.email), cell(A.pill(s.active ? 'active' : 'cancelled')), cell(small('Delete', function () { confirmDo('Remove ' + s.email + '?', function () { reloadAfter(api('DELETE', '/api/admin/subscribers?id=' + s.id)); }); }, true))]);
      })));
    });
  };

  views.emails = function () {
    return api('GET', '/api/admin/outbox').then(function (r) {
      clear(panel);
      panel.appendChild(head('Emails', [], r.emailConfigured ? 'Messages the site has sent.' : 'Email is not set up yet, so these were saved but not delivered.'));
      if (!r.messages.length) return panel.appendChild(empty('No emails yet.'));
      panel.appendChild(A.table(['When', 'To', 'Subject', 'Type', 'Status', ''], r.messages.map(function (m) {
        return h('tr', null, [cell(A.dateTime(m.createdAt)), cell(m.to), cell(m.subject, 'wrap-cell'), cell(m.kind || '-'), cell(A.pill(m.status === 'sent' ? 'paid' : m.status === 'failed' ? 'failed' : 'pending'), ''),
          cell(small('View', function () { openForm({ title: m.subject, fields: [{ key: 'b', label: 'To ' + m.to + (m.error ? ' (error: ' + m.error + ')' : ''), type: 'textarea', rows: 12 }], values: { b: m.body }, submit: 'Close', onSave: function () { return Promise.resolve(); } }); }))]);
      })));
    });
  };

  /* ---------- site settings ---------- */
  var SETTING_GROUPS = [
    ['Club', [
      ['cfg.brand_name', 'Club name', 'text', 'Used in emails and the page footer.'],
      ['cfg.notify_email', 'Owner email for alerts', 'email', 'Tour requests and new orders are emailed here. Leave blank to use the OWNER_EMAIL hosting setting.'],
      ['social.instagram', 'Instagram link', 'url'], ['social.facebook', 'Facebook link', 'url'], ['social.youtube', 'YouTube link', 'url'], ['social.x', 'X link', 'url'], ['social.whatsapp', 'WhatsApp link', 'url']
    ]],
    ['Booking rules', [
      ['cfg.require_membership', 'Only active members can book classes', 'checkbox'],
      ['cfg.cancel_hours', 'Members can cancel until this many hours before class', 'number'],
      ['cfg.window_days', 'How many days ahead classes can be booked', 'number', 'Between 1 and 90.'],
      ['cfg.timezone', 'Club time zone', 'text', 'For example Asia/Kolkata.'],
      ['cfg.interests', 'Tour form: interests (one per line)', 'textarea'], ['cfg.slots', 'Tour form: preferred times (one per line)', 'textarea']
    ]],
    ['Colours', [
      ['theme.gold', 'Accent', 'color'], ['theme.gold_hi', 'Accent highlight', 'color'], ['theme.gold_lo', 'Accent shadow', 'color'],
      ['theme.ink', 'Page background', 'color'], ['theme.coal', 'Panel background', 'color'], ['theme.bone', 'Text', 'color']
    ]],
    ['Search engines', ['index', 'about', 'programs', 'trainers', 'membership', 'contact'].reduce(function (acc, p) {
      return acc.concat([['seo.' + p + '.title', p.charAt(0).toUpperCase() + p.slice(1) + ' page title', 'text'], ['seo.' + p + '.description', p.charAt(0).toUpperCase() + p.slice(1) + ' page description', 'textarea']]);
    }, [])]
  ];

  views.settings = function () {
    return api('GET', '/api/admin/settings').then(function (r) {
      clear(panel);
      panel.appendChild(head('Site settings', [], 'Colours and settings apply to the whole site within a minute.'));
      var s = r.settings, inputs = {};
      var form = h('form', { 'class': 'adm-settings', novalidate: true });
      SETTING_GROUPS.forEach(function (g) {
        var fs = h('fieldset', null, [h('legend', { text: g[0] })]);
        g[1].forEach(function (f) {
          var id = 's-' + f[0], el;
          var val = s[f[0]] === undefined ? '' : s[f[0]];
          if (f[2] === 'textarea') { el = h('textarea', { id: id, rows: 4 }); el.value = val; }
          else if (f[2] === 'checkbox') { el = h('input', { id: id, type: 'checkbox' }); el.checked = val === 'true'; }
          else { el = h('input', { id: id, type: f[2], autocomplete: 'off' }); el.value = val; }
          inputs[f[0]] = { el: el, type: f[2], orig: val };
          fs.appendChild(h('div', { 'class': 'field full' + (f[2] === 'checkbox' ? ' is-check' : '') }, [h('label', { 'for': id, text: f[1] }), el, f[3] ? h('span', { 'class': 'hint', text: f[3] }) : null]));
        });
        form.appendChild(fs);
      });
      form.appendChild(h('div', { 'class': 'btn-row' }, [h('button', { 'class': 'btn', type: 'submit', text: 'Save settings' })]));
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var values = {};
        Object.keys(inputs).forEach(function (k) {
          var i = inputs[k], v = i.type === 'checkbox' ? String(i.el.checked) : i.el.value;
          if (v !== i.orig) values[k] = v;
        });
        if (!Object.keys(values).length) return say('Nothing to save.');
        api('PUT', '/api/admin/settings', { values: values }).then(function () { say('Settings saved.'); return views.settings(); }).catch(fail);
      });
      panel.appendChild(form);
    });
  };

  /* ---------- page text ---------- */
  views.content = function () {
    return api('GET', '/api/admin/content').then(function (r) {
      clear(panel);
      var keys = Object.keys(r.edits).sort();
      panel.appendChild(head('Page text', [], 'To change wording, open a page while signed in and press "Edit this page" in the menu, then click any text. Texts you have changed are listed here, and you can restore the original.'));
      panel.appendChild(h('div', { 'class': 'btn-row' }, ['/', '/about', '/programs', '/trainers', '/membership', '/contact'].map(function (p) {
        return h('a', { 'class': 'btn btn--sm btn--ghost', href: p, text: 'Edit ' + (p === '/' ? 'home' : p.slice(1)) });
      })));
      if (!keys.length) return panel.appendChild(empty('You have not changed any text yet.'));
      panel.appendChild(A.table(['Where', 'Current text', ''], keys.map(function (k) {
        return h('tr', null, [cell(k), cell(r.edits[k], 'wrap-cell'), cell(small('Restore original', function () { reloadAfter(api('PUT', '/api/admin/content', { reset: [k] })); }))]);
      })));
    });
  };

  var TABS = [
    ['overview', 'Overview'], ['requests', 'Tour requests'], ['members', 'Members'], ['payments', 'Payments'],
    ['programs', 'Programs'], ['timetable', 'Timetable'], ['classbookings', 'Class bookings'], ['trainers', 'Trainers'], ['plans', 'Plans'],
    ['newsletter', 'Newsletter'], ['emails', 'Emails'], ['content', 'Page text'], ['settings', 'Settings']
  ];

  function open(name) {
    if (!views[name]) name = 'overview';
    current = name;
    if (window.location.hash !== '#' + name) window.history.replaceState(null, '', '#' + name);
    Array.prototype.forEach.call(document.querySelectorAll('[data-admin-tab]'), function (t) {
      t.setAttribute('aria-pressed', t.getAttribute('data-admin-tab') === name ? 'true' : 'false');
    });
    clear(panel);
    panel.appendChild(h('p', { 'class': 'muted', text: 'Loading...' }));
    views[name]().catch(fail);
  }

  A.me().then(function (m) {
    clear(root);
    if (!m) return A.toLogin();
    if (m.role !== 'admin') {
      root.appendChild(h('p', { 'class': 'form-note is-error', text: 'This area is for club staff only.' }));
      root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/account', text: 'Back to my account' })]));
      return;
    }
    root.appendChild(h('div', { 'class': 'filters adm-tabs', role: 'group', 'aria-label': 'Admin sections' }, TABS.map(function (t) {
      return h('button', { 'class': 'chip', type: 'button', 'data-admin-tab': t[0], 'aria-pressed': 'false', text: t[1], onclick: function () { open(t[0]); } });
    })));
    root.appendChild(flash);
    root.appendChild(panel);
    open((window.location.hash || '').slice(1) || 'overview');
  });
})();
