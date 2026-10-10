(function () {
  'use strict';
  // In-page text editor for the owner. Every element with a data-c key becomes editable. Only the
  // texts that were changed are saved, and visitors see them after the page cache refreshes (under a minute).
  var A = window.AURUM;
  if (!A) return;
  var h = A.h;

  var active = false, originals = new Map(), bar, countEl, noteEl, saveBtn;

  function els() {
    return Array.prototype.slice.call(document.querySelectorAll('[data-c]')).filter(function (e) { return !e.closest('.edit-bar'); });
  }
  // textContent, not innerText: innerText returns the CSS-transformed text (for example all capitals),
  // which would be saved as the owner's wording.
  function value(el) {
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('br'), function (b) { b.replaceWith('\n'); });
    return c.textContent.replace(/\u00a0/g, ' ').trim();
  }

  function changed() {
    return els().filter(function (el) { return originals.has(el) && value(el) !== originals.get(el); });
  }
  function refresh() {
    var n = changed().length;
    countEl.textContent = n ? n + (n === 1 ? ' change' : ' changes') : 'No changes yet';
    saveBtn.disabled = !n;
  }

  function onKey(e) {
    var el = e.target.closest && e.target.closest('[data-c]');
    if (!el) return;
    if (e.key === 'Enter' && !/^(P|BLOCKQUOTE)$/.test(el.tagName)) e.preventDefault();
    if (e.key === ' ' && el.tagName === 'BUTTON') { e.preventDefault(); document.execCommand('insertText', false, ' '); }
  }
  function onPaste(e) {
    var el = e.target.closest && e.target.closest('[data-c]');
    if (!el) return;
    e.preventDefault();
    var t = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, /^(P|BLOCKQUOTE)$/.test(el.tagName) ? '\n' : ' ');
    document.execCommand('insertText', false, t);
  }
  // Links and buttons must not navigate or run while editing their text.
  function onClick(e) {
    if (e.target.closest && e.target.closest('.edit-bar')) return;
    var el = e.target.closest && e.target.closest('a, button, [data-filter]');
    if (el && !el.closest('.edit-bar')) { e.preventDefault(); e.stopPropagation(); }
  }

  function buildBar() {
    countEl = h('b', { 'class': 'edit-count', text: 'No changes yet' });
    noteEl = h('span', { 'class': 'edit-note', role: 'status' });
    saveBtn = h('button', { type: 'button', 'class': 'btn btn--sm', text: 'Save changes', disabled: true });
    saveBtn.addEventListener('click', save);
    var cancel = h('button', { type: 'button', 'class': 'btn btn--sm btn--ghost', text: 'Close' });
    cancel.addEventListener('click', function () { stop(true); });
    bar = h('div', { 'class': 'edit-bar', role: 'region', 'aria-label': 'Page editor' }, [
      h('span', { text: 'Editing this page. Click any text to change it.' }), countEl, noteEl,
      h('a', { href: '/admin#content', 'class': 'edit-link', text: 'Colours, images and settings' }),
      saveBtn, cancel
    ]);
    document.body.appendChild(bar);
  }

  function save() {
    var list = changed();
    if (!list.length) return;
    var set = {};
    list.forEach(function (el) { set[el.getAttribute('data-c')] = value(el); });
    saveBtn.disabled = true;
    noteEl.textContent = 'Saving...';
    A.api('PUT', '/api/admin/content', { set: set }).then(function () {
      list.forEach(function (el) { originals.set(el, value(el)); });
      noteEl.textContent = 'Saved. Visitors will see it within a minute.';
      refresh();
    }).catch(function (err) {
      noteEl.textContent = err.message;
      refresh();
    });
  }

  function start() {
    active = true;
    document.documentElement.classList.add('is-editing');
    if (!bar) buildBar();
    bar.hidden = false;
    els().forEach(function (el) {
      originals.set(el, value(el));
      el.setAttribute('contenteditable', 'plaintext-only');
      if (el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
    });
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('paste', onPaste, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('input', refresh, true);
    refresh();
  }

  function stop(revert) {
    if (changed().length && revert && !window.confirm('Discard your unsaved changes?')) return;
    active = false;
    document.documentElement.classList.remove('is-editing');
    els().forEach(function (el) {
      if (revert && originals.has(el) && value(el) !== originals.get(el)) el.textContent = originals.get(el);
      el.removeAttribute('contenteditable');
      el.removeAttribute('spellcheck');
    });
    originals.clear();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('paste', onPaste, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', refresh, true);
    if (bar) bar.hidden = true;
  }

  window.AURUM_EDITOR = { toggle: function () { if (active) stop(true); else start(); } };
  window.addEventListener('beforeunload', function (e) { if (active && changed().length) { e.preventDefault(); e.returnValue = ''; } });
})();
