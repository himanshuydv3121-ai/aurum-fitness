(function () {
  'use strict';
  // Visitor and member pages: tour request, sign in, account, checkout, unsubscribe.
  var A = window.AURUM;
  if (!A) return;
  var h = A.h, $ = A.$, api = A.api, clear = A.clear, show = A.show, money = A.money, go = A.go;
  var page = document.body.getAttribute('data-page');
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

  /* ---------- login, sign-up, forgot and reset ---------- */
  pages.login = function () {
    var params = new URLSearchParams(window.location.search);
    var next = A.safeNext(params.get('next'), '/account');
    var resetToken = params.get('reset');
    var forms = { login: $('login-form'), signup: $('signup-form'), forgot: $('forgot-form'), reset: $('reset-form') };
    var note = $('auth-note');
    var tabs = document.querySelectorAll('[data-auth-tab]');
    var tabsBox = tabs[0] && tabs[0].parentNode;

    function pick(name) {
      Array.prototype.forEach.call(tabs, function (t) {
        t.setAttribute('aria-pressed', t.getAttribute('data-auth-tab') === name ? 'true' : 'false');
      });
      Object.keys(forms).forEach(function (k) { forms[k].hidden = k !== name; });
      if (tabsBox) tabsBox.hidden = name === 'forgot' || name === 'reset';
      note.hidden = true;
    }
    Array.prototype.forEach.call(tabs, function (t) {
      t.addEventListener('click', function () { pick(t.getAttribute('data-auth-tab')); });
    });
    document.querySelector('[data-show-forgot]').addEventListener('click', function () { pick('forgot'); });
    document.querySelector('[data-auth-tab-link]').addEventListener('click', function () { pick('login'); });
    pick(resetToken ? 'reset' : window.location.hash === '#signup' ? 'signup' : 'login');

    if (!resetToken) A.me().then(function (m) { if (m) go(next); });

    function submit(form, work) {
      var btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      work().catch(function (err) { show(note, err.message, 'error'); }).then(function () { btn.disabled = false; });
    }
    forms.login.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(forms.login, function () {
        return api('POST', '/api/auth/login', { email: $('login-email').value, password: $('login-password').value }).then(function () { go(next); });
      });
    });
    forms.signup.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(forms.signup, function () {
        return api('POST', '/api/auth/signup', {
          fullName: $('su-name').value, email: $('su-email').value, phone: $('su-phone').value, password: $('su-password').value
        }).then(function () { go(next); });
      });
    });
    forms.forgot.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(forms.forgot, function () {
        return api('POST', '/api/auth/forgot', { email: $('forgot-email').value }).then(function (r) { show(note, r.message); });
      });
    });
    forms.reset.addEventListener('submit', function (e) {
      e.preventDefault();
      submit(forms.reset, function () {
        return api('POST', '/api/auth/reset', { token: resetToken, password: $('reset-password').value }).then(function () {
          show(note, 'Your password has been changed. You can sign in now.');
          window.history.replaceState(null, '', '/login');
          pick('login');
          show(note, 'Your password has been changed. You can sign in now.');
        });
      });
    });
  };

  /* ---------- member account ---------- */
  pages.account = function () {
    var root = $('account-root');

    function field(id, label, attrs) {
      return h('div', { 'class': 'field full' }, [h('label', { 'for': id, text: label }), h('input', Object.assign({ id: id }, attrs))]);
    }

    function profileForm(m) {
      var note = h('p', { 'class': 'form-note', hidden: true, role: 'status' });
      var form = h('form', { 'class': 'form one-col', novalidate: true }, [
        field('pf-name', 'Full name', { name: 'fullName', type: 'text', value: m.fullName, autocomplete: 'name', required: true }),
        field('pf-phone', 'Phone', { name: 'phone', type: 'tel', value: m.phone || '', autocomplete: 'tel' }),
        h('div', { 'class': 'field full' }, [h('button', { 'class': 'btn btn--sm', type: 'submit', text: 'Save details' })]),
        note
      ]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        api('PATCH', '/api/auth/profile', { fullName: $('pf-name').value, phone: $('pf-phone').value })
          .then(function () { show(note, 'Saved.'); })
          .catch(function (err) { show(note, err.message, 'error'); });
      });
      return form;
    }

    function passwordForm() {
      var note = h('p', { 'class': 'form-note', hidden: true, role: 'status' });
      var form = h('form', { 'class': 'form one-col', novalidate: true }, [
        field('pw-cur', 'Current password', { type: 'password', autocomplete: 'current-password', required: true }),
        field('pw-new', 'New password (at least 10 characters)', { type: 'password', autocomplete: 'new-password', minlength: 10, required: true }),
        h('div', { 'class': 'field full' }, [h('button', { 'class': 'btn btn--sm btn--ghost', type: 'submit', text: 'Change password' })]),
        note
      ]);
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        api('POST', '/api/auth/password', { current: $('pw-cur').value, password: $('pw-new').value })
          .then(function () { form.reset(); show(note, 'Password changed. Other devices have been signed out.'); })
          .catch(function (err) { show(note, err.message, 'error'); });
      });
      return form;
    }

    function bookingsSection(d) {
      var sec = h('div', { 'class': 'stack reveal' }, [h('h3', { text: 'Your classes' })]);
      var list = d.bookings.filter(function (b) { return b.status === 'confirmed'; });
      var upcoming = list.filter(function (b) { return b.upcoming; });
      var note = h('p', { 'class': 'form-note', hidden: true, role: 'status' });
      if (!upcoming.length) {
        sec.appendChild(h('p', { 'class': 'muted' }, ['You have no upcoming classes. ', h('a', { href: '/programs#timetable', text: 'Book a class' }), '.']));
      } else {
        sec.appendChild(A.table(['When', 'Class', 'Coach', ''], upcoming.map(function (b) {
          var cell = b.canCancel ? h('button', { 'class': 'btn btn--sm btn--ghost', type: 'button', text: 'Cancel' }) : h('span', { 'class': 'muted', text: 'Cancellation closed' });
          if (b.canCancel) cell.addEventListener('click', function () {
            cell.disabled = true;
            api('POST', '/api/classes/cancel', { id: b.id }).then(function () { window.location.reload(); })
              .catch(function (err) { show(note, err.message, 'error'); cell.disabled = false; });
          });
          return h('tr', null, [A.cell(A.dateTime(b.startsAt, d.timezone)), A.cell(b.programName), A.cell(b.coach || '-'), A.cell(cell)]);
        })));
        sec.appendChild(note);
      }
      return sec;
    }

    Promise.all([api('GET', '/api/auth/me'), api('GET', '/api/plans'), api('GET', '/api/classes/mine'), api('GET', '/api/payments/status')]).then(function (res) {
      var m = res[0].member, names = {};
      res[1].plans.forEach(function (p) { names[p.slug] = p.name; });
      var first = m.fullName.split(/\s+/)[0];
      clear(root);
      var active = m.membershipStatus === 'active';
      var planLine = m.plan ? (names[m.plan] || m.plan) + ' (' + m.billing + ')' : 'No plan yet';

      var actions = [
        h('a', { 'class': 'btn', 'data-magnetic': true, href: '/membership', text: active ? 'Change or renew plan' : 'Choose a plan' }),
        h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/programs#timetable', text: 'Book a class' }),
        h('button', {
          'class': 'btn btn--ghost', type: 'button', 'data-magnetic': true, text: 'Sign out',
          onclick: function () { api('POST', '/api/auth/logout', {}).then(function () { go('/'); }); }
        })
      ];
      if (m.role === 'admin') actions.unshift(h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/admin', text: 'Admin dashboard' }));

      root.appendChild(h('div', { 'class': 'stack reveal' }, [
        h('span', { 'class': 'eyebrow', text: 'Member area' }),
        h('h2', { text: 'Welcome back, ' + first + '.' }),
        h('p', { 'class': 'lead', text: m.email })
      ]));
      root.appendChild(h('ul', { 'class': 'spec reveal' }, [
        h('li', null, [h('span', { text: 'Membership' }), h('b', null, [A.pill(m.membershipStatus)])]),
        h('li', null, [h('span', { text: 'Plan' }), h('b', { text: planLine })]),
        h('li', null, [h('span', { text: active ? 'Renews on' : 'Last active until' }), h('b', { text: A.date(m.membershipUntil) })]),
        h('li', null, [h('span', { text: 'Member since' }), h('b', { text: A.date(m.createdAt) })])
      ]));
      root.appendChild(h('div', { 'class': 'btn-row reveal' }, actions));
      root.appendChild(bookingsSection(res[2]));

      var pays = res[3].payments;
      var sec = h('div', { 'class': 'stack reveal' }, [h('h3', { text: 'Payment history' })]);
      if (!pays.length) sec.appendChild(h('p', { 'class': 'muted', text: 'No payments yet. Pick a plan to get started.' }));
      else sec.appendChild(A.table(['Date', 'Plan', 'Billing', 'Amount', 'Status', 'Reference'], pays.map(function (p) {
        var ref = p.status === 'pending' ? h('a', { href: '/checkout?ref=' + encodeURIComponent(p.ref), text: p.ref }) : p.ref;
        return h('tr', null, [A.cell(A.date(p.createdAt)), A.cell(p.planName), A.cell(p.billing), A.cell(money(p.amountMinor, p.currency), 'num'), A.cell(A.pill(p.status)), A.cell(ref)]);
      })));
      root.appendChild(sec);

      root.appendChild(h('div', { 'class': 'stack reveal' }, [h('h3', { text: 'Your details' }), profileForm(m)]));
      root.appendChild(h('div', { 'class': 'stack reveal' }, [h('h3', { text: 'Password' }), passwordForm()]));
      A.refresh(root);
    }).catch(function (err) {
      if (err.status === 401) return A.toLogin();
      clear(root);
      root.appendChild(h('p', { 'class': 'form-note is-error', text: err.message }));
    });
  };

  /* ---------- checkout ---------- */
  pages.checkout = function () {
    var root = $('checkout-root');
    var q = new URLSearchParams(window.location.search);

    function summary(rows) {
      return h('ul', { 'class': 'spec' }, rows.map(function (r) {
        return h('li', null, [h('span', { text: r[0] }), h('b', { text: r[1] })]);
      }));
    }

    function renderPayment(p, client) {
      clear(root);
      var rows = [['Plan', p.planName], ['Billing', p.billing === 'annual' ? 'Yearly' : 'Monthly'],
        ['Total', money(p.amountMinor, p.currency)], ['Reference', p.ref]];
      root.appendChild(h('span', { 'class': 'eyebrow', text: 'Payment' }));
      root.appendChild(h('h2', { text: p.status === 'pending' ? (p.provider === 'offline' ? 'Your plan is reserved.' : 'Confirm your payment.') : p.status === 'paid' ? 'Payment received.' : 'Payment ' + p.status + '.' }));
      root.appendChild(summary(rows));
      var out = h('p', { 'class': 'form-note', hidden: true, role: 'status' });

      if (p.status === 'pending' && p.provider === 'offline') {
        root.appendChild(h('p', { 'class': 'lead', text: 'Pay at the front desk and quote reference ' + p.ref + '. Your membership starts as soon as the club confirms the payment. We have emailed you these details.' }));
        root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn', 'data-magnetic': true, href: '/account', text: 'Go to my account' })]));
      } else if (p.status === 'pending' && p.provider === 'razorpay') {
        var payBtn = h('button', { 'class': 'btn', type: 'button', 'data-magnetic': true, text: client ? 'Pay ' + money(p.amountMinor, p.currency) : 'Checking payment...' });
        if (!client) {
          payBtn.disabled = true;
          // The member may have paid and closed the window. The provider notifies us, so look again.
          window.setTimeout(function () {
            api('GET', '/api/payments/status?ref=' + encodeURIComponent(p.ref)).then(function (r) {
              if (r.payment.status !== 'pending') renderPayment(r.payment);
              else { payBtn.textContent = 'Payment not completed'; root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/membership', text: 'Start again' })])); }
            }).catch(function () {});
          }, 3000);
        } else {
          payBtn.addEventListener('click', function () { openRazorpay(p, client, payBtn, out); });
        }
        root.appendChild(h('div', { 'class': 'btn-row' }, [payBtn]));
      } else if (p.status === 'pending') {
        root.appendChild(h('p', { 'class': 'form-note', text: 'Test mode: no card is charged and no money moves. These buttons stand in for the payment provider.' }));
        var pay = h('button', { 'class': 'btn', type: 'button', 'data-magnetic': true, text: 'Pay ' + money(p.amountMinor, p.currency) + ' (test)' });
        var fail = h('button', { 'class': 'btn btn--ghost', type: 'button', 'data-magnetic': true, text: 'Simulate failed payment' });
        var settle = function (outcome) {
          pay.disabled = true; fail.disabled = true;
          api('POST', '/api/payments/confirm', { ref: p.ref, outcome: outcome }).then(function (r) {
            p.status = r.status;
            renderPayment(p);
          }).catch(function (err) { show(out, err.message, 'error'); pay.disabled = false; fail.disabled = false; });
        };
        pay.addEventListener('click', function () { settle('success'); });
        fail.addEventListener('click', function () { settle('failure'); });
        root.appendChild(h('div', { 'class': 'btn-row' }, [pay, fail]));
      } else if (p.status === 'paid') {
        root.appendChild(h('p', { 'class': 'lead', text: 'Your membership is active. A receipt is on its way to your inbox.' }));
        root.appendChild(h('div', { 'class': 'btn-row' }, [
          h('a', { 'class': 'btn', 'data-magnetic': true, href: '/programs#timetable', text: 'Book your first class' }),
          h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/account', text: 'Go to my account' })
        ]));
      } else {
        root.appendChild(h('div', { 'class': 'btn-row' }, [h('a', { 'class': 'btn', 'data-magnetic': true, href: '/membership', text: 'Try again' })]));
      }
      root.appendChild(out);
      A.refresh(root);
    }

    function openRazorpay(p, client, btn, out) {
      function launch() {
        var rz = new window.Razorpay({
          key: client.keyId, order_id: client.orderId, amount: client.amount, currency: client.currency,
          name: document.title, description: p.planName + ' membership',
          handler: function (resp) {
            btn.disabled = true; btn.textContent = 'Confirming...';
            api('POST', '/api/payments/verify', {
              ref: p.ref, razorpayPaymentId: resp.razorpay_payment_id, razorpaySignature: resp.razorpay_signature
            }).then(function (r) {
              return api('GET', '/api/payments/status?ref=' + encodeURIComponent(p.ref)).then(function (s) { renderPayment(s.payment); return r; });
            }).catch(function (err) { show(out, err.message, 'error'); btn.disabled = false; btn.textContent = 'Pay ' + money(p.amountMinor, p.currency); });
          },
          modal: { ondismiss: function () { btn.disabled = false; } },
          theme: { color: '#d6b25e' }
        });
        rz.open();
      }
      btn.disabled = true;
      if (window.Razorpay) return launch();
      var s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.onload = launch;
      s.onerror = function () { show(out, 'The payment window could not be loaded. Please check your connection and try again.', 'error'); btn.disabled = false; };
      document.head.appendChild(s);
    }

    function start(plan, billing) {
      clear(root);
      var b = billing === 'annual' ? 'annual' : 'monthly';
      var total = b === 'annual' ? plan.annualPrice * 12 : plan.monthlyPrice;
      root.appendChild(h('span', { 'class': 'eyebrow', text: 'Checkout' }));
      root.appendChild(h('h2', { text: 'Join ' + plan.name + '.' }));
      root.appendChild(summary([
        ['Plan', plan.name + (plan.tag ? ' (' + plan.tag + ')' : '')],
        ['Billing', b === 'annual' ? 'Yearly, 12 months upfront' : 'Monthly'],
        ['Total today', money(total * 100)]
      ]));
      var out = h('p', { 'class': 'form-note', hidden: true, role: 'alert' });
      var go1 = h('button', { 'class': 'btn', type: 'button', 'data-magnetic': true, text: 'Continue to payment' });
      go1.addEventListener('click', function () {
        go1.disabled = true;
        api('POST', '/api/payments/checkout', { plan: plan.slug, billing: b }).then(function (r) {
          window.history.replaceState(null, '', '/checkout?ref=' + encodeURIComponent(r.payment.ref));
          renderPayment(r.payment, r.client);
        }).catch(function (err) { show(out, err.message, 'error'); go1.disabled = false; });
      });
      root.appendChild(h('div', { 'class': 'btn-row' }, [go1, h('a', { 'class': 'btn btn--ghost', 'data-magnetic': true, href: '/membership', text: 'Back to plans' })]));
      root.appendChild(out);
      A.refresh(root);
    }

    api('GET', '/api/auth/me').then(function () {
      var ref = q.get('ref');
      if (ref) return api('GET', '/api/payments/status?ref=' + encodeURIComponent(ref)).then(function (r) { renderPayment(r.payment); });
      var slug = q.get('plan');
      if (!slug) return go('/membership');
      return api('GET', '/api/plans').then(function (r) {
        var plan = r.plans.filter(function (p) { return p.slug === slug; })[0];
        if (!plan) return go('/membership');
        start(plan, q.get('billing'));
      });
    }).catch(function (err) {
      if (err.status === 401) return A.toLogin();
      clear(root);
      root.appendChild(h('p', { 'class': 'form-note is-error', text: err.message }));
    });
  };

  /* ---------- unsubscribe ---------- */
  pages.unsubscribe = function () {
    var root = $('unsub-root');
    var token = new URLSearchParams(window.location.search).get('token');
    clear(root);
    if (!token) return root.appendChild(h('p', { 'class': 'form-note is-error', text: 'This unsubscribe link is not valid.' }));
    api('POST', '/api/newsletter/unsubscribe', { token: token }).then(function () {
      root.appendChild(h('p', { 'class': 'lead', text: 'You have been unsubscribed. You will not receive any more newsletters.' }));
    }).catch(function (err) { root.appendChild(h('p', { 'class': 'form-note is-error', text: err.message })); });
  };

  if (pages[page]) pages[page]();
})();
