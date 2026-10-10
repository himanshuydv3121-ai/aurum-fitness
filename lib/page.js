'use strict';
// Server-side page rendering. Pages live in /templates. Text the owner has edited is stored in the
// database under data-c keys and applied here, so visitors and search engines get the final text.

const fs = require('fs');
const path = require('path');
const settings = require('./settings');

const DIR = path.join(__dirname, '..', 'templates');

const TITLES = {
  index: 'AURUM Fitness', about: 'About AURUM', programs: 'AURUM Programs', trainers: 'AURUM Trainers',
  membership: 'AURUM Membership', contact: 'Visit AURUM', login: 'Member Sign In', account: 'My AURUM Account',
  checkout: 'AURUM Checkout', admin: 'AURUM Admin', unsubscribe: 'Unsubscribe',
};
const DESCRIPTIONS = {
  index: 'A members-only training house with calibrated lifting platforms, a recovery wing and small-group coaching.',
  about: 'The story, standards and facilities behind the club.',
  programs: 'Strength, conditioning, mind and body, and recovery programs coached in small groups.',
  trainers: 'Meet the coaches.',
  membership: 'Compare membership plans and join online.',
  contact: 'Book a private tour of the club.',
};
// Pages that must never be cached or indexed (they hold or edit private data).
const PRIVATE = new Set(['login', 'account', 'checkout', 'admin', 'unsubscribe']);
// Scripts each page loads after the shared ones.
const SCRIPTS = {
  index: ['content'], programs: ['content', 'classes'], trainers: ['content'], membership: ['content'],
  contact: ['content', 'pages'], login: ['pages'], account: ['pages'], checkout: ['pages'],
  unsubscribe: ['pages'], admin: ['admin'],
};
const PAGES = Object.keys(TITLES);

const files = {};
function read(name) {
  if (!files[name]) files[name] = fs.readFileSync(path.join(DIR, name + '.html'), 'utf8');
  return files[name];
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rgb(hex) {
  const h = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!h) return null;
  const n = parseInt(h[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(', ');
}

function applyEdits(html, edits) {
  const keys = Object.keys(edits);
  if (!keys.length) return html;
  return html.replace(/<([a-z0-9]+)((?:\s[^>]*?)?)\sdata-c="([^"]+)"([^>]*)>([^<]*)<\/\1>/g, (m, tag, a, key, b, inner) => {
    if (!Object.prototype.hasOwnProperty.call(edits, key)) return m;
    let attrs = a + ' data-c="' + key + '"' + b;
    if (/\sdata-count="/.test(attrs)) {
      // The counter animation reads its target from attributes, so derive them from the typed text.
      const m2 = /^([^0-9]*)([0-9][0-9,.]*)(.*)$/.exec(edits[key].trim());
      if (m2) {
        attrs = attrs.replace(/\sdata-(count|prefix|suffix)="[^"]*"/g, '');
        attrs += ' data-count="' + esc(m2[2].replace(/,/g, '')) + '"' +
          (m2[1] ? ' data-prefix="' + esc(m2[1]) + '"' : '') + (m2[3] ? ' data-suffix="' + esc(m2[3]) + '"' : '');
      }
    }
    return '<' + tag + attrs + '>' + esc(edits[key]).replace(/\r?\n/g, '<br>') + '</' + tag + '>';
  });
}

function socialLinks(s) {
  const names = { instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', x: 'X', whatsapp: 'WhatsApp' };
  const out = Object.keys(names).filter((k) => s['social.' + k]).map((k) =>
    '<a href="' + esc(s['social.' + k]) + '" rel="noopener noreferrer" target="_blank">' + names[k] + '</a>');
  return out.length ? '<p class="social">' + out.join('') + '</p>' : '';
}

function options(list, selected) {
  return list.map((o) => '<option' + (o === selected ? ' selected' : '') + '>' + esc(o) + '</option>').join('');
}

async function render(name, pathname) {
  if (!Object.prototype.hasOwnProperty.call(TITLES, name)) return null;
  const [s, edits] = await Promise.all([settings.settings(), settings.textEdits()]);
  let html = read(name);

  const brand = s['cfg.brand_name'] || 'AURUM Fitness';
  const title = s['seo.' + name + '.title'] || (name === 'index' && brand !== 'AURUM Fitness' ? brand : TITLES[name]);
  const description = s['seo.' + name + '.description'] || DESCRIPTIONS[name] || '';
  const seo = '<title>' + esc(title) + '</title>' +
    (description ? '<meta name="description" content="' + esc(description) + '">' : '') +
    '<meta property="og:title" content="' + esc(title) + '">' +
    (description ? '<meta property="og:description" content="' + esc(description) + '">' : '') +
    '<meta property="og:type" content="website">' +
    (PRIVATE.has(name) ? '<meta name="robots" content="noindex">' : '');

  const vars = [];
  [['gold', 'gold'], ['gold_hi', 'gold-hi'], ['gold_lo', 'gold-lo'], ['ink', 'ink'], ['coal', 'coal'], ['bone', 'bone']].forEach(([k, css]) => {
    const hex = s['theme.' + k];
    if (hex !== settings.DEFAULTS['theme.' + k] && rgb(hex)) vars.push('--' + css + ':' + hex + ';--' + css + '-rgb:' + rgb(hex));
  });
  const theme = vars.length ? '<style>:root{' + vars.join(';') + '}</style>' : '';

  let header = read('_header');
  // Mark the current page in the navigation.
  header = header.replace(/<a href="([^"]*)"/g, (m, href) => (href === pathname ? m + ' aria-current="page"' : m));

  html = html
    .replace('{{header}}', () => header)
    .replace('{{footer}}', () => read('_footer'))
    .replace('{{seo}}', () => seo)
    .replace('{{theme}}', () => theme)
    .replace('{{scripts}}', () => ['app', 'site'].concat(SCRIPTS[name] || []).map((n) => '<script src="/' + n + '.js"></script>').join('\n'))
    .replace('{{interest_options}}', () => options(settings.lines(s['cfg.interests'])))
    .replace('{{slot_options}}', () => options(settings.lines(s['cfg.slots'])))
    .replace(/\{\{social\}\}/g, () => socialLinks(s))
    .replace(/\{\{year\}\}/g, String(new Date().getFullYear()))
    .replace(/\{\{brand\}\}/g, () => esc(brand));

  if (name !== 'admin') html = applyEdits(html, edits);
  return { html, private: PRIVATE.has(name) };
}

module.exports = { render, PAGES, TITLES, applyEdits };
