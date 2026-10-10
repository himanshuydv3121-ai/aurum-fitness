'use strict';
// One-time codemod: turns public/*.html into templates/*.html.
// Every plain-text element gets a data-c key so the owner can edit it. Header and footer become partials.
const fs = require('fs');
const path = require('path');

const PAGES = ['index', 'about', 'programs', 'trainers', 'membership', 'contact', 'login', 'account', 'checkout', 'admin'];
const VOID = new Set(['meta', 'link', 'input', 'br', 'hr', 'img', 'path', 'circle', 'line', 'rect', 'source']);
const SKIP = new Set(['svg', 'script', 'style', 'head', 'title', 'option', 'select', 'textarea', 'noscript']);

function tokenize(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>/g;
  let last = 0, m;
  while ((m = re.exec(html))) {
    if (m.index > last) out.push({ t: 'text', s: html.slice(last, m.index) });
    const s = m[0];
    if (s.startsWith('<!--')) out.push({ t: 'comment', s });
    else if (s.startsWith('</')) out.push({ t: 'close', s, name: s.slice(2, -1).trim().toLowerCase() });
    else {
      const name = /^<([a-zA-Z0-9]+)/.exec(s)[1].toLowerCase();
      out.push({ t: 'open', s, name, self: s.endsWith('/>') || VOID.has(name) });
    }
    last = re.lastIndex;
  }
  if (last < html.length) out.push({ t: 'text', s: html.slice(last) });
  return out;
}

function build(tokens) {
  const root = { name: '#root', kids: [], open: null };
  const stack = [root];
  for (const tok of tokens) {
    const top = stack[stack.length - 1];
    if (tok.t === 'open') {
      const node = { name: tok.name, kids: [], open: tok, self: tok.self };
      top.kids.push(node);
      if (!tok.self) stack.push(node);
    } else if (tok.t === 'close') {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === tok.name) { stack[i].close = tok; stack.length = i; break; }
      }
    } else top.kids.push(tok);
  }
  return root;
}

const hasAttr = (node, a) => new RegExp('\\s' + a + '(=|\\s|>|/)').test(node.open.s);
const trimmed = (s) => s.replace(/\s+/g, ' ').trim();

function emit(node, ctx, skipping) {
  if (node.t) return node.s;
  const kids = node.kids;
  const idm = node.open && /\sid="([^"]*)"/.exec(node.open.s);
  const inSkip = skipping || SKIP.has(node.name) || !!(idm && /(root|grid|note|count)$/.test(idm[1]));
  const ownSkip = inSkip || !!(node.open && (idm || hasAttr(node, 'data-count')));
  const hasElems = kids.some((k) => !k.t);
  const texts = kids.filter((k) => k.t === 'text' && trimmed(k.s));
  let openStr = node.open ? node.open.s : '';
  let inner;
  if (!ownSkip && node.open && !node.self && !hasElems && texts.length === 1 && !hasAttr(node, 'data-c')) {
    // plain-text leaf: key the element itself
    const key = ctx.prefix + '.' + (++ctx.n);
    openStr = openStr.replace(/>$/, ' data-c="' + key + '">');
    ctx.keys[key] = trimmed(texts[0].s);
    inner = kids.map((k) => emit(k, ctx, inSkip)).join('');
  } else {
    inner = kids.map((k) => {
      if (k.t === 'text' && !inSkip && node.open && hasElems && trimmed(k.s) && !/^(ul|ol|dl|table|tr|nav|select|dl|div)$/.test('') ) {
        const key = ctx.prefix + '.' + (++ctx.n);
        ctx.keys[key] = trimmed(k.s);
        const lead = /^\s/.test(k.s) ? ' ' : '';
        const trail = /\s$/.test(k.s) ? ' ' : '';
        return lead + '<span data-c="' + key + '">' + trimmed(k.s) + '</span>' + trail;
      }
      return emit(k, ctx, inSkip);
    }).join('');
  }
  if (node.name === '#root') return inner;
  return openStr + inner + (node.close ? node.close.s : '');
}

function transform(html, prefix, ctx0) {
  const ctx = ctx0 || { prefix, n: 0, keys: {} };
  return { html: emit(build(tokenize(html)), ctx, false), ctx };
}

const SITE = { prefix: 'site', n: 0, keys: {} };
const allKeys = {};
let header = null, footer = null;

for (const page of PAGES) {
  let src = fs.readFileSync(path.join('public', page + '.html'), 'utf8');
  const h = /<header class="site-header">[\s\S]*?<\/header>/.exec(src)[0];
  const f = /<footer class="site-footer">[\s\S]*?<\/footer>/.exec(src)[0];
  if (!header) { header = h; footer = f; }
  let body = src.replace(h, '{{header}}').replace(f, '{{footer}}');
  const title = /<title>([^<]*)<\/title>/.exec(body)[1];
  const bodyOpen = /<body[^>]*>/.exec(body)[0];
  const main = /<main>[\s\S]*<\/main>/.exec(body)[0];
  let mainOut = main;
  // dynamic grids are filled by script from the API
  mainOut = mainOut.replace(/(<div class="grid cols-\d" id="(?:programs|trainers|plans)-grid">)[\s\S]*?(<\/div>)(?=\s*(?:<\/div>|<\/section|<p class="note|$))/, '$1<p class="muted">Loading...</p>$2');
  const t = transform(mainOut, page);
  Object.assign(allKeys, t.ctx.keys);
  const robots = page === 'admin' ? '<meta name="robots" content="noindex">' : '';
  const scripts = [...src.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  const tpl = [
    '<!doctype html>', '<html lang="en">', '<head>', '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    robots, '{{seo}}', '<link rel="stylesheet" href="/styles.css">', '{{theme}}', '</head>',
    bodyOpen, '<script>document.documentElement.classList.add("js")</script>', '{{header}}', t.html, '{{footer}}',
    scripts.map((s) => '<script src="/' + s + '"></script>').join('\n'), '</body>', '</html>', '',
  ].filter((x) => x !== '').join('\n');
  fs.writeFileSync(path.join('templates', page + '.html'), tpl.replace(/(href|data-copy)="(index|about|programs|trainers|membership|contact|login|account|checkout|admin)\.html/g, (m, a, p) => a + '="/' + (p === 'index' ? '' : p)));
  fs.writeFileSync(path.join('templates', '_title-' + page + '.txt'), title);
}

const hs = transform(header, 'site', SITE);
const fs2 = transform(footer, 'site', SITE);
Object.assign(allKeys, SITE.keys);
const fix = (s) => s.replace(/href="(index|about|programs|trainers|membership|contact|login|account|checkout|admin)\.html/g, (m, p) => 'href="/' + (p === 'index' ? '' : p)).replace(/ aria-current="page"/g, '');
fs.writeFileSync('templates/_header.html', fix(hs.html) + '\n');
fs.writeFileSync('templates/_footer.html', fix(fs2.html) + '\n');
fs.writeFileSync('templates/_defaults.json', JSON.stringify(allKeys, null, 1) + '\n');
console.log(Object.keys(allKeys).length + ' editable texts');
