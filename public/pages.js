(function () {
  'use strict';
  var A = window.AURUM;
  if (!A) return;
  var h = A.h;
  var page = document.body.getAttribute('data-page');

  /* ---------- helpers ---------- */
  function api(method, url, body) {
    return fetch(url, {
      method: method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json', Accept: 'application/json' } : { Accept: 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Something went wrong. Please try again.');
          e.status = r.status;
          throw e;
        }
        return j;
      });
    });
  }

  function $(id) { return document.getElementById(id); }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function money(minor, cur) {
    var sym = !cur || cur === 'INR' ? '₹' : cur + ' ';
    return sym + (Number(minor) / 100).toLocaleString('en-IN');
  }
  function date(v) {
    if (!v) return '-';
    var d = new Date(v);
    return isNaN(d) ? '-' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function dateTime(v) {
    var d = new Date(v);
    return isNaN(d) ? '-' : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function pill(status) { return h('span', { 'class': 'pill pill--' + status, text: status }); }
  function show(el, text, kind) {
    el.textContent = text;
    el.className = 'form-note' + (kind === 'error' ? ' is-error' : '');
    el.hidden = false;
  }
  function safeNext(value, fallback) {
    return /^[a-z]+\.html(\?[A-Za-z0-9=&_%\-]*)?$/.test(value || '') ? value : fallback;
  }
  function go(url) {
    document.documentElement.classList.add('leaving');
    window.setTimeout(function () { window.location.href = url; }, 250);
  }
  function toLogin() {
    var here = window.location.pathname.split('/').pop() + window.location.search;
    go('login.html?next=' + encodeURIComponent(here));
  }
  function table(headers, rows) {
    var head = h('tr', null, headers.map(function (t) { return h('th', { text: t }); }));
    return h('div', { 'class': 'scroll' }, [h('table', null, [h('thead', null, [head]), h('tbody', null, rows)])]);
  }
  function cell(content, cls) {
    return h('td', cls ? { 'class': cls } : null, [content]);
  }

  var pages = {};

  /* ---------- contact: tour request ---------- */
  pages.contact = function () {
    var form = $('visit-form'), note = $('form-note');
    if (!form) return;
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var f = form.elements;
      var btn = form.querySelector('button[type="submit"]');
      if (!f.fullname.value.trim() || !f.email.value.trim()) {
        show(note, 'Please enter your name and email.', 'error');
        return;
      }
      btn.disabled = true;
      api('POST', '/api/bookings', {
        fullname: f.fullname.value, email: f.email.value, phone: f.phone.value,
        interest: f.interest.value, slot: f.slot.value, plan: f.plan.value,
        msg: f.msg.value, website: f.website ? f.website.value : ''
      }).then(function () {
        var first = f.fullname.value.trim().split(/\s+/)[0];
        form.reset();
        show(note, 'Thank you, ' + first + '. Your tour request is in and a coach will contact you within one working day.');
      }).catch(function (err) {
        show(note, err.message, 'error');
      }).then(function () { btn.disabled = false; });
    });
  };

  /* ---------- login and sign-up ---------- */
  pages.login = function () {
    var next = safeNext(new URLSearchParams(window.location.search).get('next'), 'account.html');
    var loginForm = $('login-form'), signupForm = $('signup-form'), note = $('auth-note');
    var tabs = document.querySelectorAll('[data-auth-tab]');

    function pick(name) {
      Array.prototype.forEach.call(tabs, function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-auth-tab') === name ? 'true' : 'false');
      });
      loginForm.hidden = name !== 'login';
      signupForm.hidden = name !== 'signup';
      note.hidden = true;
    }
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () { pick(t.getAttribute('data-auth-tab')); });
    });
    pick(window.location.hash === '#signup' ? 'signup' : 'login');

    // Already signed in? Skip the form.
    api('GET', '/api/auth/me').then(function () { go(next); }).catch(function () {});

    function submit(form, url, payload) {
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      api('POST', url, payload()).then(function () { go(next); })
        .catch(function (err) { show(note, err.message, 'error'); btn.disabled = false; });
    }
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(loginForm, '/api/auth/login', function () {
        return { email: $('login-email').value, password: $('login-password').value };
      });
    });
    signupForm.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(signupForm, '/api/auth/signup', function () {
        return { fullName: $('su-name').value, email: $('su-email').value, password: $('su-password').value };
      });
    });
  };

  /* ---------- member account ---------- */
  pages.account = function () {
    var root = $('account-root');
    Promise.all([api('GET', '/api/auth/me'), api('GET', '/api/plans')]).then(function (res) {
      var m = res[0].member;
      var names = {};
      res[1].plans.forEach(function (p) { names[p.slug] = p.name; });
      return api('GET', '/api/payments/status').then(function (pay) { return { m: m, names: names, payments: pay.payments }; });
    }).then(function (d) {
      var m = d.m;
      var first = m.fullName.split(/\s+/)[0];
      clear(root);
      var active = m.membershipStatus === 'active';
      var planLine = m.plan ? (d.names[m.plan] || m.plan) + ' (' + m.billing + ')' : 'No plan yet';

      var actions = [
        h('a', { 'class': 'btn', 'data-magnetic': true, href: 'membership.html', text: active ? 'Change or renew plan' : 'Choose a plan' }),
        h('button', {
          'class': 'btn btn--ghost', type: 'button', 'data-magnetic': true, text: 'Sign out',
          onclick: function () { api('POST', '/api/auth/logout', {}).then(function () { go('index.html'); }); }
        })
      ];
      if (m.role === 'admin') actions.unshift(h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: 'admin.html', text: 'Admin dashboard' }));

      root.appendChild(h('div', { 'class': 'stack reveal' }, [
        h('span', { 'class': 'eyebrow', text: 'Member area' }),
        h('h2', { text: 'Welcome back, ' + first + '.' }),
        h('p', { 'class': 'lead', text: m.email })
      ]));
      root.appendChild(h('ul', { 'class': 'spec reveal' }, [
        h('li', null, [h('span', { text: 'Membership' }), h('b', null, [pill(m.membershipStatus)])]),
        h('li', null, [h('span', { text: 'Plan' }), h('b', { text: planLine })]),
        h('li', null, [h('span', { text: active ? 'Renews on' : 'Last active until' }), h('b', { text: date(m.membershipUntil) })]),
        h('li', null, [h('span', { text: 'Member since' }), h('b', { text: date(m.createdAt) })])
      ]));
      root.appendChild(h('div', { 'class': 'btn-row reveal' }, actions));

      var sec = h('div', { 'class': 'stack reveal' }, [h('h3', { text: 'Payment history' })]);
      if (!d.payments.length) {
        sec.appendChild(h('p', { 'class': 'muted', text: 'No payments yet. Pick a plan to get started.' }));
      } else {
        sec.appendChild(table(['Date', 'Plan', 'Billing', 'Amount', 'Status', 'Reference'], d.payments.map(function (p) {
          return h('tr', null, [
            cell(date(p.createdAt)), cell(p.planName), cell(p.billing),
            cell(money(p.amountMinor, p.currency), 'num'), cell(pill(p.status)), cell(p.ref)
          ]);
        })));
      }
      root.appendChild(sec);
      A.refresh(root);
    }).catch(function (err) {
      if (err.status === 401) return toLogin();
      clear(root);
      root.appendChild(h('p', { 'class': 'form-note is-error', text: err.message }));
    });
  };

  /* ---------- checkout (test mode) ---------- */
  pages.checkout = function () {
    var root = $('checkout-root');
    var q = new URLSearchParams(window.location.search);

    function summary(rows) {
      return h('ul', { 'class': 'spec' }, rows.map(function (r) {
        return h('li', null, [h('span', { text: r[0] }), h('b', { text: r[1] })]);
      }));
    }

    function renderPayment(p) {
      clear(root);
      var rows = [['Plan', p.planName], ['Billing', p.billing === 'annual' ? 'Yearly' : 'Monthly'],
        ['Total', money(p.amountMinor, p.currency)], ['Reference', p.ref]];
      root.appendChild(h('span', { 'class': 'eyebrow', text: 'Payment' }));
      root.appendChild(h('h2', { text: p.status === 'pending' ? 'Confirm your payment.' : p.status === 'paid' ? 'Payment received.' : 'Payment ' + p.status + '.' }));
      root.appendChild(summary(rows));
      var out = h('p', { 'class': 'form-note', hidden: true, role: 'status' });

      if (p.status === 'pending') {
        root.appendChild(h('p', { 'class': 'form-note', text: 'Test mode: no card is charged and no money moves. These buttons simulate the payment provider.' }));
        var pay = h('button', { 'class': 'btn', type: 'button', 'data-magnetic': true, text: 'Pay ' + money(p.amountMinor, p.currency) + ' (test)' });
        var fail = h('button', { 'class': 'btn btn--ghost', type: 'button', 'data-magnetic': true, text: 'Simulate failed payment' });
        function settle(outcome) {
          pay.disabled = true; fail.disabled = true;
          api('POST', '/api/payments/confirm', { ref: p.ref, outcome: outcome }).then(function (r) {
            p.status = r.status;
            renderPayment(p);
          }).catch(function (err) { show(out, err.message, 'error'); pay.disabled = false; fail.disabled = false; });
        }
        pay.addEventListener('click', function () { settle('success'); });
        fail.addEventListener('click', function () { settle('failure'); });
        root.appendChild(h('div', { 'class': 'btn-row' }, [pay, fail]));
      } else if (p.status === 'paid') {
        root.appendChild(h('p', { 'class': 'lead', text: 'Your membership is active. Welcome to AURUM.' }));
        root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn', 'data-magnetic': true, href: 'account.html', text: 'Go to my account' })]));
      } else {
        root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn', 'data-magnetic': true, href: 'membership.html', text: 'Try again' })]));
      }
      root.appendChild(out);
      A.refresh(root);
    }

    function start(plan, billing) {
      clear(root);
      var b = billing === 'annual' ? 'annual' : 'monthly';
      var total = b === 'annual' ? plan.annualPrice * 12 : plan.monthlyPrice;
      root.appendChild(h('span', { 'class': 'eyebrow', text: 'Checkout' }));
      root.appendChild(h('h2', { text: 'Join ' + plan.name + '.' }));
      root.appendChild(summary([
        ['Plan', plan.name + ' (' + plan.tag + ')'],
        ['Billing', b === 'annual' ? 'Yearly, 12 months upfront' : 'Monthly'],
        ['Total today', money(total * 100)]
      ]));
      var out = h('p', { 'class': 'form-note', hidden: true, role: 'alert' });
      var go1 = h('button', { 'class': 'btn', type: 'button', 'data-magnetic': true, text: 'Continue to payment' });
      go1.addEventListener('click', function () {
        go1.disabled = true;
        api('POST', '/api/payments/checkout', { plan: plan.slug, billing: b }).then(function (r) {
          window.history.replaceState(null, '', 'checkout.html?ref=' + encodeURIComponent(r.payment.ref));
          return api('GET', '/api/payments/status?ref=' + encodeURIComponent(r.payment.ref));
        }).then(function (r) { renderPayment(r.payment); })
          .catch(function (err) { show(out, err.message, 'error'); go1.disabled = false; });
      });
      root.appendChild(h('div', { 'class': 'btn-row' }, [go1, h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: 'membership.html', text: 'Back to plans' })]));
      root.appendChild(out);
      A.refresh(root);
    }

    api('GET', '/api/auth/me').then(function () {
      var ref = q.get('ref');
      if (ref) return api('GET', '/api/payments/status?ref=' + encodeURIComponent(ref)).then(function (r) { renderPayment(r.payment); });
      var slug = q.get('plan');
      if (!slug) return go('membership.html');
      return api('GET', '/api/plans').then(function (r) {
        var plan = r.plans.filter(function (p) { return p.slug === slug; })[0];
        if (!plan) return go('membership.html');
        start(plan, q.get('billing'));
      });
    }).catch(function (err) {
      if (err.status === 401) return toLogin();
      clear(root);
      root.appendChild(h('p', { 'class': 'form-note is-error', text: err.message }));
    });
  };

  /* ---------- admin dashboard ---------- */
  pages.admin = function () {
    var root = $('admin-root');
    var STATUSES = ['new', 'contacted', 'toured', 'closed'];
    var views = {};
    var panel = h('div', { 'class': 'stack' });
    var current = 'overview';

    function loadError(err) {
      clear(panel);
      panel.appendChild(h('p', { 'class': 'form-note is-error', text: err.message }));
    }

    views.overview = function () {
      return api('GET', '/api/admin/overview').then(function (r) {
        var o = r.overview;
        function stat(n, label) { return h('div', { 'class': 'stat' }, [h('b', { text: String(n) }), h('span', { text: label })]); }
        clear(panel);
        panel.appendChild(h('div', { 'class': 'stats' }, [
          stat(o.newBookings, 'New tour requests'),
          stat(o.bookings, 'Total tour requests'),
          stat(o.activeMembers, 'Active members'),
          stat(o.members, 'Registered accounts'),
          stat(o.paidPayments, 'Paid payments'),
          stat(money(o.revenueMinor), 'Test revenue')
        ]));
      });
    };

    views.bookings = function () {
      return api('GET', '/api/admin/bookings').then(function (r) {
        clear(panel);
        if (!r.bookings.length) return panel.appendChild(h('p', { 'class': 'muted', text: 'No tour requests yet.' }));
        panel.appendChild(table(['Received', 'Name', 'Contact', 'Interest', 'Time', 'Plan', 'Goals', 'Status'], r.bookings.map(function (b) {
          var sel = h('select', { 'class': 'mini-select', 'aria-label': 'Status for ' + b.fullName }, STATUSES.map(function (s) {
            return h('option', { value: s, selected: s === b.status, text: s });
          }));
          sel.addEventListener('change', function () {
            sel.disabled = true;
            api('PATCH', '/api/admin/bookings', { id: b.id, status: sel.value })
              .then(function () { sel.disabled = false; })
              .catch(function (err) { sel.disabled = false; sel.value = b.status; loadError(err); });
          });
          return h('tr', null, [
            cell(dateTime(b.createdAt)), cell(b.fullName),
            cell(b.email + (b.phone ? ' / ' + b.phone : '')), cell(b.interest), cell(b.slot),
            cell(b.plan || '-'), cell(b.message || '-', 'wrap-cell'), cell(sel)
          ]);
        })));
      });
    };

    views.members = function () {
      return api('GET', '/api/admin/members').then(function (r) {
        clear(panel);
        panel.appendChild(table(['Joined', 'Name', 'Email', 'Role', 'Plan', 'Status', 'Until'], r.members.map(function (m) {
          return h('tr', null, [
            cell(date(m.createdAt)), cell(m.fullName), cell(m.email), cell(m.role),
            cell(m.plan ? m.plan + ' (' + m.billing + ')' : '-'), cell(pill(m.membershipStatus)), cell(date(m.membershipUntil))
          ]);
        })));
      });
    };

    views.payments = function () {
      return api('GET', '/api/admin/payments').then(function (r) {
        clear(panel);
        if (!r.payments.length) return panel.appendChild(h('p', { 'class': 'muted', text: 'No payments yet.' }));
        panel.appendChild(table(['Date', 'Member', 'Plan', 'Billing', 'Amount', 'Status', 'Provider', 'Reference'], r.payments.map(function (p) {
          return h('tr', null, [
            cell(dateTime(p.createdAt)), cell(p.memberName + ' / ' + p.memberEmail), cell(p.planName), cell(p.billing),
            cell(money(p.amountMinor, p.currency), 'num'), cell(pill(p.status)), cell(p.provider), cell(p.ref)
          ]);
        })));
      });
    };

    function open(name) {
      current = name;
      Array.prototype.forEach.call(document.querySelectorAll('[data-admin-tab]'), function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-admin-tab') === name ? 'true' : 'false');
      });
      views[name]().catch(loadError);
    }

    api('GET', '/api/auth/me').then(function (r) {
      if (r.member.role !== 'admin') {
        clear(root);
        root.appendChild(h('p', { 'class': 'form-note is-error', text: 'This area is for AURUM staff only.' }));
        root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: 'account.html', text: 'Back to my account' })]));
        return;
      }
      clear(root);
      var tabs = h('div', { 'class': 'filters', role: 'group', 'aria-label': 'Admin sections' }, ['overview', 'bookings', 'members', 'payments'].map(function (n) {
        return h('button', { 'class': 'chip', type: 'button', 'data-admin-tab': n, 'aria-pressed': 'false', text: n, onclick: function () { open(n); } });
      }));
      root.appendChild(tabs);
      root.appendChild(panel);
      open(current);
    }).catch(function (err) {
      if (err.status === 401) return toLogin();
      loadError(err);
    });
  };

  if (pages[page]) pages[page]();
})();
