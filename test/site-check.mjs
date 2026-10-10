/* =========================================================================
   QuickEasy Software — static site test suite
   Dependency-free. Run with:  node test/site-check.mjs   (or: npm test)
   Exits non-zero if any check fails, so it can gate a deploy/CI.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ---------- tiny test harness ---------- */
const results = [];
function test(name, fn) {
  let errors = [];
  try {
    const r = fn();
    if (Array.isArray(r)) errors = r.filter(Boolean);
  } catch (e) {
    errors = ['threw: ' + (e && e.message ? e.message : String(e))];
  }
  results.push({ name, errors });
}

/* ---------- helpers ---------- */
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const count = (s, re) => (s.match(re) || []).length;

// Does a root-relative URL resolve to a real file or folder/index.html?
function resolves(urlPath) {
  let p = urlPath.split('#')[0].split('?')[0];
  if (p === '' || p === '/') return fs.existsSync(path.join(ROOT, 'index.html'));
  const fsPath = path.join(ROOT, p.replace(/^\//, ''));
  if (fs.existsSync(fsPath) && fs.statSync(fsPath).isFile()) return true;
  if (fs.existsSync(path.join(fsPath, 'index.html'))) return true;
  if (fs.existsSync(fsPath.replace(/\/$/, '') + '.html')) return true;
  return false;
}

// Every *-REDIRECTS.txt at the repo root, discovered rather than listed, so a new log
// is covered by the sitemap and redirect gates without editing this file.
const redirectLogs = () => fs.readdirSync(ROOT).filter((f) => /-REDIRECTS\.txt$/.test(f)).sort();

const files = walk(ROOT);
const pages = files.map((f) => ({ f, rel: rel(f), html: read(f) }));
const navPages = pages.filter((p) => p.html.includes('id="site-nav"'));
const blogPosts = pages.filter((p) => /^20\d\d\/\d\d\/\d\d\//.test(p.rel));
const get = (r) => pages.find((p) => p.rel === r);

/* =========================================================================
   A. Global hygiene
   ========================================================================= */
test('A1 no WordPress/CMS fingerprints', () =>
  pages.filter((p) => /wp-content|wp-includes|wp-json|wp-emoji|elementor-|name="generator"/.test(p.html))
       .map((p) => 'fingerprint in ' + p.rel));

test('A2 no legacy site.css / site.js references', () =>
  pages.filter((p) => /\/assets\/(css\/site\.css|js\/site\.js)/.test(p.html))
       .map((p) => 'old asset ref in ' + p.rel));

test('A3 stylesheet pages use main.css', () =>
  pages.filter((p) => p.html.includes('rel="stylesheet"') && !p.html.includes('/assets/css/main.css'))
       .map((p) => 'no main.css in ' + p.rel));

test('A4 every page has lang, <title> and viewport', () =>
  pages.flatMap((p) => {
    const errs = [];
    if (!/<html[^>]*\blang=/.test(p.html)) errs.push('missing lang: ' + p.rel);
    if (!/<title>[^<]+<\/title>/.test(p.html)) errs.push('missing title: ' + p.rel);
    if (!/name="viewport"/.test(p.html)) errs.push('missing viewport: ' + p.rel);
    return errs;
  }));

/* =========================================================================
   B. Navigation & footer consistency (pages that carry the nav)
   ========================================================================= */
test('B0 nav pages exist', () => (navPages.length > 0 ? [] : ['no pages contain id="site-nav"']));

// Solutions joined Products/Resources here: the dropdown was removed from the top
// nav, the same way F2 guards Apps. Its pages went to a footer column and then
// lost that too — B4 now guards what actually keeps them reachable.
// Match the nav item itself, not a bare ">Solutions<" that copy could contain.
test('B1 no removed menus (Products / Resources / Solutions)', () =>
  navPages.filter((p) => />Products<|>Resources<|>All articles<|aria-haspopup="true">(?:Solutions|โซลูชัน)</.test(p.html))
          .map((p) => 'stale menu item in ' + p.rel));

const enNavPages = navPages.filter((p) => !p.rel.startsWith('th/'));

test('B2 nav has Support submenu + All Blogs', () =>
  enNavPages.filter((p) => !(p.html.includes('>Documentation<') && p.html.includes('>Customer Service<') && p.html.includes('>All Blogs<')))
          .map((p) => 'incomplete new nav in ' + p.rel));

test('B3 footer present, Explore has Support and not Blog', () =>
  enNavPages.flatMap((p) => {
    const errs = [];
    if (!p.html.includes('site-footer')) errs.push('no footer: ' + p.rel);
    if (!p.html.includes('<li><a href="/support/">Support</a></li>')) errs.push('no footer Support: ' + p.rel);
    if (p.html.includes('<li><a href="/blog/">Blog</a></li>')) errs.push('footer still has Blog: ' + p.rel);
    return errs;
  }));

// The landing pages have no site-wide link any more: Solutions came out of the
// nav (B1) and then out of the footer. What keeps them reachable is the in-body
// mesh — blog posts, the homepage, and the pillar/cluster links between them.
// That mesh is the thing worth guarding, not any particular chrome element:
// a page with no inbound internal link gets no PageRank and is barely crawled.
const SOLUTION_PAGES = [
  '/erp-software-south-africa/', '/erp-for-small-business/', '/manufacturing-erp/',
  '/mrp-software/', '/inventory-management-software/', '/production-planning-software/',
  '/job-costing-software/', '/estimating-and-quoting-features-benefits/',
  '/printing-signage-packaging/', '/print-estimating-software/', '/signage-software/',
  '/packaging-erp/',
];
// Floor set well under the current minimum (8) so this catches a real regression
// — a sweep stripping links, a batch of posts rewritten — not normal variation.
const MIN_INBOUND = 4;

test('B4 every landing page keeps real in-body inbound links', () => {
  const count = Object.fromEntries(SOLUTION_PAGES.map((u) => [u, 0]));
  for (const p of pages) {
    const main = p.html.slice(p.html.indexOf('<main'), p.html.indexOf('</main>'));
    for (const u of SOLUTION_PAGES) if (main.includes(`href="${u}"`)) count[u]++;
  }
  return SOLUTION_PAGES
    .filter((u) => count[u] < MIN_INBOUND)
    .map((u) => `${u} has only ${count[u]} in-body inbound link(s), expected at least ${MIN_INBOUND}`);
});

/* =========================================================================
   C. Link integrity
   ========================================================================= */
test('C1 all internal links resolve', () => {
  const bad = [];
  for (const p of pages) {
    const re = /href="(\/[^"]*)"/g; let m;
    while ((m = re.exec(p.html))) {
      const href = m[1];
      if (href.startsWith('//') || href.startsWith('/assets/')) continue;
      if (!resolves(href)) bad.push(`${href} <- ${p.rel}`);
    }
  }
  return bad;
});

test('C2 referenced /assets files exist', () => {
  const bad = new Set();
  for (const p of pages) {
    const re = /(?:src|href)="(\/assets\/[^"]+)"/g; let m;
    while ((m = re.exec(p.html))) {
      const a = m[1].split('#')[0].split('?')[0];
      if (!fs.existsSync(path.join(ROOT, a.replace(/^\//, '')))) bad.add(a);
    }
  }
  return [...bad];
});

/* =========================================================================
   D. Redirects (SITE-REDIRECTS.txt)
   ========================================================================= */
test('D SITE-REDIRECTS: old paths gone, new targets resolve', () => {
  const file = path.join(ROOT, 'SITE-REDIRECTS.txt');
  if (!fs.existsSync(file)) return ['SITE-REDIRECTS.txt missing'];
  const errs = [];
  for (const line of read(file).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const m = t.match(/^(\/\S+)\s*->\s*(\/\S+)/);
    if (!m) continue;
    const [, oldp, newp] = m;
    if (resolves(oldp)) errs.push('removed page still present: ' + oldp);
    if (!resolves(newp)) errs.push('redirect target missing: ' + newp + ' (from ' + oldp + ')');
  }
  return errs;
});

/* =========================================================================
   E. Blog
   ========================================================================= */
test('E1 all blog posts link "Back to all Blogs"', () =>
  blogPosts.flatMap((p) => {
    const errs = [];
    if (p.html.includes('Back to all articles')) errs.push('stale back-link: ' + p.rel);
    if (!p.html.includes('Back to all Blogs')) errs.push('missing back-link: ' + p.rel);
    return errs;
  }));

test('E2 blog listing uses redesigned post-list', () => {
  const b = get('blog/index.html');
  if (!b) return ['blog/index.html missing'];
  const errs = [];
  if (!b.html.includes('class="post-list"')) errs.push('no .post-list');
  const n = count(b.html, /post-list__title/g);
  if (n < 100) errs.push('too few post rows: ' + n);
  return errs;
});

/* =========================================================================
   F. Page-specific content
   ========================================================================= */
test('F1 homepage', () => {
  const h = get('index.html');
  if (!h) return ['index.html missing'];
  const errs = [];
  if (!h.html.includes('class="hero-mock"')) errs.push('no hero mock');
  if (count(h.html, /class="vertical"/g) !== 6) errs.push('expected 6 verticals');
  if (count(h.html, /class="card mod-card"/g) !== 10) errs.push('expected 10 module cards');
  if (!/>Global</.test(h.html)) errs.push('missing "Global" tile');
  if (h.html.includes('SARS')) errs.push('SARS still present');
  if (h.html.includes('South African software company')) errs.push('"South African software company" still present');
  return errs;
});

// The Apps page was removed — the nav item now links out to the apps site.
test('F2 no Apps page and no Apps nav item', () => {
  const errs = [];
  if (fs.existsSync(path.join(ROOT, 'apps'))) errs.push('apps/ should be gone (301 -> /)');
  if (fs.existsSync(path.join(ROOT, 'th/apps'))) errs.push('th/apps/ should be gone (301 -> /th/)');
  for (const p of pages) {
    if (p.html.includes('href="/apps/') || p.html.includes('href="/th/apps/')) errs.push(p.rel + ' still links to a local apps page');
    // Apps was dropped from the top nav and the footer; the homepage keeps a
    // single outbound CTA to the apps site in its "Extend BOS with apps" section.
    if (/>(Apps|\u0e41\u0e2d\u0e1b)<\/a><\/li>/.test(p.html)) errs.push(p.rel + ' still has an Apps menu item');
  }
  const home = get('index.html');
  if (home && !home.html.includes('https://www.vibecraftedsoftware.com')) {
    errs.push('homepage lost its link to the apps site');
  }
  return errs;
});

test('F3 pricing redesign', () => {
  const p = get('pricing/index.html');
  if (!p) return ['pricing/index.html missing'];
  const errs = [];
  if (!p.html.includes('class="currency-toggle"')) errs.push('no currency toggle');
  if (count(p.html, /data-cur="(ZAR|USD)"/g) !== 2) errs.push('expected 2 currency buttons (ZAR, USD)');
  if (count(p.html, /class="price-card/g) < 4) errs.push('expected >=4 price cards');
  if (!/data-zar="1230"/.test(p.html)) errs.push('Solo base price missing');
  if (!/data-zar="820"/.test(p.html)) errs.push('Team per-user price missing');
  if (!p.html.includes('Cloud Services \u2014 BOS Enterprise')) errs.push('cloud services heading not renamed');
  // Retired currency, retired plan, and the old exchange-rate table.
  for (const gone of ['THB', 'Starter Pack', 'ZAR17.83', 'pricing cycle', 'Average Rate of Exchange', 'class="clients"']) {
    if (p.html.includes(gone)) errs.push('stale content: ' + gone);
  }
  return errs;
});

test('F4 documentation page', () => {
  const d = get('documentation/index.html');
  if (!d) return ['documentation/index.html missing'];
  const errs = [];
  if (count(d.html, /class="doc-(mark|media)"/g) !== 3) errs.push('expected 3 edition cards (doc-mark/doc-media)');
  if (!d.html.includes('/implementation-methodology/')) errs.push('no Implementation Methodology link');
  for (const img of ['/assets/img/bos-pro.png', '/assets/img/bos-enterprise.png'])
    if (!d.html.includes(img)) errs.push('missing edition image: ' + img);
  return errs;
});

test('F5 customer service page', () => {
  const s = get('support/index.html');
  if (!s) return ['support/index.html missing'];
  const errs = [];
  if (!/<title>Customer Service/.test(s.html)) errs.push('title not "Customer Service"');
  if (!s.html.includes('class="contact-form"')) errs.push('no support form');
  return errs;
});

/* =========================================================================
   G. Design system assets
   ========================================================================= */
// The side gutter must scale with the viewport. A flat value looks generous on a
// wide screen and vanishes the moment the container stops being centred — which
// is what it did at half-screen widths before this was a clamp().
test('G0 container gutter is responsive, not a flat value', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  const m = /\.container\{[^}]*padding:0 ([^;}]+)/.exec(css);
  if (!m) return ['no .container padding rule'];
  const errs = [];
  if (!/clamp\(|min\(|max\(|vw/.test(m[1]))
    errs.push('.container gutter is a flat ' + m[1] + ' — it collapses at mid widths');

  // A class that shares an element with .container must never use the `padding`
  // shorthand: it comes later in the file at equal specificity, so `padding:64px 0`
  // silently resets the gutter to zero and that section runs to the screen edge.
  // This is exactly how the hero lost its margins. Vertical padding goes through
  // padding-block (or padding-top/-bottom), never the shorthand.
  const shared = [...css.matchAll(/class="container ([a-z-]+)"/g)].map((x) => x[1]);
  for (const cls of ['hero-grid', 'search-layout', 'site-header__bar', 'prose', 'center', ...shared]) {
    const re = new RegExp('\\.' + cls + '\\{([^}]*)\\}', 'g');
    let r;
    while ((r = re.exec(css)))
      if (/(?:^|;)padding:/.test(r[1]))
        errs.push(`.${cls} uses the padding shorthand; it shares an element with .container and would zero the side gutter`);
  }
  return errs;
});

test('G1 main.css has the new components', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  return ['.verticals', '.mod-card', '.price-card', '.currency-toggle', '.post-list', '.doc-mark', '.hero-mock']
    .filter((sel) => !css.includes(sel)).map((sel) => 'missing CSS: ' + sel);
});

test('G2 main.js has nav, contact form and currency toggle', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  return ['nav-toggle', 'contact-form', 'renderPrices', 'currency-toggle__btn']
    .filter((k) => !js.includes(k)).map((k) => 'missing JS: ' + k);
});

/* =========================================================================
   H. Pricing currency math (mirrors main.js: USD=zar*0.056, THB=zar*1.90,
   except a plan carrying a published data-usd override, which shows that
   fixed price instead of the computed conversion)
   ========================================================================= */
test('H published prices', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  const errs = [];
  if (js.includes('THB')) errs.push('THB still in the main.js currency table');
  const usdRate = parseFloat((js.match(/USD:\s*\{\s*rate:\s*([\d.]+)/) || [])[1]);
  if (usdRate !== 0.056) errs.push('USD fallback rate changed: ' + usdRate);

  // EN page: ZAR is the invoiced price (identical to the pre-migration site),
  // USD the published equivalent. Every price carries both.
  const published = [
    [1230, 76], [820, 50],                                      // Solo, Team
    [499, 31], [927, 57], [1480, 91], [2746, 170], [5153, 318], // cloud server
    [89, 5], [185, 10],                                         // Winflector, RDP
  ];
  const en = get('pricing/index.html');
  if (!en) errs.push('pricing/index.html missing');
  else {
    for (const [zar, usd] of published) {
      if (!en.html.includes('data-zar="' + zar + '" data-usd="' + usd + '"')) {
        errs.push('pricing/index.html: R' + zar + ' / $' + usd + ' not published');
      }
    }
    const zars = count(en.html, /data-zar="/g);
    const usds = count(en.html, /data-usd="/g);
    if (zars !== usds) errs.push('pricing/index.html: ' + zars + ' ZAR prices but ' + usds + ' USD overrides');
    if (zars !== published.length) errs.push('pricing/index.html: expected ' + published.length + ' prices, found ' + zars);
  }

  // TH page: one THB price only — no tiers, no cloud servers, no toggle.
  const th = get('th/pricing/index.html');
  if (!th) errs.push('th/pricing/index.html missing');
  else {
    if (!th.html.includes('\u0e3f1,495')) errs.push('th/pricing: THB1,495 not shown');
    if (!th.html.includes('"price": "1495"') || !th.html.includes('"priceCurrency": "THB"')) {
      errs.push('th/pricing: THB offer missing from JSON-LD');
    }
    if (count(th.html, /class="price"/g) !== 1) errs.push('th/pricing: expected exactly one price');
    if (th.html.includes('currency-toggle')) errs.push('th/pricing: currency toggle should be gone');
    if (th.html.includes('data-zar=')) errs.push('th/pricing: ZAR prices should be gone');
  }
  return errs;
});

/* =========================================================================
   I. SEO migration (robots, sitemap, canonicals, JSON-LD, redirect map)
   ========================================================================= */
const indexPages = pages.filter((p) => p.rel.endsWith('index.html'));
const isNoindex = (html) => /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html);
// Live but deliberately unlisted: the /search/ results pages are noindex.
const sitemapPages = indexPages.filter((p) => !isNoindex(p.html));
const pageUrl = (r) => '/' + r.replace(/index\.html$/, ''); // 'blog/index.html' -> '/blog/'
const canonPath = (html) => {
  const m = html.match(/<link rel="canonical" href="https:\/\/quickeasysoftware\.com([^"]*)"/);
  return m ? m[1] : null;
};

test('I1 robots.txt: present, points to sitemap, no Disallow', () => {
  const f = path.join(ROOT, 'robots.txt');
  if (!fs.existsSync(f)) return ['robots.txt missing'];
  const t = read(f); const errs = [];
  if (!/Sitemap:\s*https:\/\/quickeasysoftware\.com\/sitemap\.xml/.test(t)) errs.push('no sitemap directive');
  if (/Disallow:\s*\//.test(t)) errs.push('robots.txt contains a Disallow rule (must be open in production)');
  return errs;
});

test('I2 sitemap.xml: valid, complete, no redirect sources', () => {
  const f = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(f)) return ['sitemap.xml missing'];
  const xml = read(f); const errs = [];
  const locs = [...xml.matchAll(/<loc>https:\/\/quickeasysoftware\.com([^<]*)<\/loc>/g)].map((m) => m[1]);
  // redirect sources from every *-REDIRECTS.txt log must never appear
  const sources = new Set();
  for (const rf of redirectLogs()) {
    const p = path.join(ROOT, rf); if (!fs.existsSync(p)) continue;
    for (const line of read(p).split(/\r?\n/)) {
      const m = line.replace(/#.*/, '').match(/^\s*(\/\S+)\s*->/); if (m) sources.add(m[1]);
    }
  }
  for (const l of locs) { if (!resolves(l)) errs.push('sitemap loc does not resolve: ' + l);
    if (sources.has(l)) errs.push('sitemap lists a redirect source: ' + l); }
  const want = new Set(sitemapPages.map((p) => pageUrl(p.rel)));
  if (locs.length !== want.size) errs.push(`sitemap has ${locs.length} locs, ${want.size} indexable pages`);
  for (const u of want) if (!locs.includes(u)) errs.push('live page missing from sitemap: ' + u);
  for (const p of indexPages) {
    if (isNoindex(p.html) && locs.includes(pageUrl(p.rel))) errs.push('sitemap lists a noindex page: ' + pageUrl(p.rel));
  }
  return errs;
});

test('I3 every page canonical present + self-referencing', () =>
  indexPages.flatMap((p) => {
    const c = canonPath(p.html);
    if (c === null) return ['no quickeasysoftware.com canonical: ' + p.rel];
    return c === pageUrl(p.rel) ? [] : [`canonical ${c} != ${pageUrl(p.rel)} (${p.rel})`];
  }));

test('I4 formerly-syndicated posts now canonical to local', () => {
  const posts = [
    '2023/05/29/is-quickeasy-bos-the-most-comprehensive-erp-solution/index.html',
    '2024/09/17/the-astonishing-benefits-of-cloud-based-erp/index.html',
    '2025/01/06/business-owners-take-the-break-you-deserve/index.html',
    '2025/02/21/how-to-master-multi-level-boms/index.html',
  ];
  return posts.flatMap((r) => {
    const p = get(r); if (!p) return ['missing: ' + r];
    if (/rel="canonical"[^>]*(bizcommunity|itweb)/.test(p.html)) return ['off-site canonical still set: ' + r];
    return canonPath(p.html) === pageUrl(r) ? [] : ['canonical not self-referencing: ' + r];
  });
});

test('I5 JSON-LD valid; Organization/BlogPosting/BreadcrumbList where expected', () =>
  indexPages.flatMap((p) => {
    const m = p.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    if (!m) return ['no JSON-LD: ' + p.rel];
    let graph;
    try { graph = JSON.parse(m[1])['@graph']; } catch (e) { return ['invalid JSON-LD: ' + p.rel + ' (' + e.message + ')']; }
    if (!Array.isArray(graph)) return ['JSON-LD @graph not array: ' + p.rel];
    const types = graph.map((n) => n['@type']);
    const url = pageUrl(p.rel); const errs = [];
    if (!types.includes('Organization')) errs.push('no Organization: ' + p.rel);
    if (url === '/' && !types.includes('WebSite')) errs.push('home missing WebSite');
    if (url !== '/' && !types.includes('BreadcrumbList')) errs.push('no BreadcrumbList: ' + p.rel);
    if (/^\/20\d\d\/\d\d\/\d\d\/[^/]+\/$/.test(url) && !types.includes('BlogPosting')) errs.push('post missing BlogPosting: ' + p.rel);
    return errs;
  }));

test('I6 consolidated redirect map: no chains, no dup sources', () => {
  const f = path.join(ROOT, 'seo/redirect-map.csv');
  if (!fs.existsSync(f)) return ['seo/redirect-map.csv missing'];
  const rows = read(f).trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
  const errs = []; const sources = new Set(); const seen = new Set();
  for (const [o] of rows) { if (seen.has(o)) errs.push('duplicate source: ' + o); seen.add(o); sources.add(o); }
  for (const [o, n] of rows) if (sources.has(n)) errs.push(`chained redirect: ${o} -> ${n} (target is itself a source)`);
  return errs;
});

/* =========================================================================
   J. Light / dark theme
   ========================================================================= */
test('J1 every nav page has a theme toggle', () =>
  navPages.filter((p) => !p.html.includes('class="theme-toggle"'))
          .map((p) => 'no theme toggle: ' + p.rel));

// The hamburger carries a visible "Menu" caption. It is hidden below 420px to
// save bar width, which is why the button keeps its own aria-label rather than
// taking its accessible name from the caption — check both survive.
test('J1b every nav page has the labelled menu button', () =>
  navPages.flatMap((p) => {
    const errs = [];
    const m = /<button class="nav-toggle"([^>]*)>/.exec(p.html);
    if (!m) return ['no menu button: ' + p.rel];
    if (!/aria-label="[^"]+"/.test(m[1])) errs.push('menu button has no aria-label: ' + p.rel);
    if (!/class="nav-toggle__label"[^>]*>[^<]+</.test(p.html)) errs.push('menu button has no visible caption: ' + p.rel);
    return errs;
  }));

test('J2 every page has the theme-init script before main.css', () =>
  indexPages.flatMap((p) => {
    const s = p.html.indexOf("localStorage.getItem('theme')");
    const c = p.html.indexOf('/assets/css/main.css');
    if (s === -1) return ['no theme-init script: ' + p.rel];
    if (c === -1 || s > c) return ['init script not before main.css: ' + p.rel];
    return [];
  }));

test('J3 main.css defines dark tokens, media fallback and .theme-toggle', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  return ['[data-theme="dark"]', '@media (prefers-color-scheme:dark)', '.theme-toggle', '--bg:']
    .filter((s) => !css.includes(s)).map((s) => 'missing in main.css: ' + s);
});

test('J4 main.js has the theme toggle handler', () => {
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  return ['theme-toggle', 'data-theme', "localStorage.setItem(\"theme\""]
    .filter((k) => !js.includes(k)).map((k) => 'missing in main.js: ' + k);
});

/* =========================================================================
   K. Thai (i18n) pages
   ========================================================================= */
const thPages = indexPages.filter((p) => p.rel === 'th/index.html' || p.rel.startsWith('th/'));

test('K1 Thai pages declare lang="th" and a Thai title', () =>
  thPages.flatMap((p) => {
    const errs = [];
    if (!/<html[^>]*\blang="th"/.test(p.html)) errs.push('lang!=th: ' + p.rel);
    if (!/[฀-๿]/.test(p.html)) errs.push('no Thai text: ' + p.rel);
    return errs;
  }));

test('K2 Thai pages link back to English (lang-toggle)', () =>
  thPages.filter((p) => {
    const m = p.html.replace(/\n/g, ' ').match(/class="lang-toggle"[^>]*href="([^"]*)"[^>]*hreflang="en"/);
    return !m || m[1].startsWith('/th/'); // must point at a non-Thai (English) URL
  }).map((p) => 'no EN lang-toggle: ' + p.rel));

test('K3 Thai + paired EN pages carry hreflang alternates', () => {
  const errs = [];
  for (const p of [...thPages, get('index.html')]) {
    if (!p) continue;
    if (!p.html.includes('hreflang="en"') || !p.html.includes('hreflang="th"'))
      errs.push('missing hreflang pair: ' + p.rel);
  }
  return errs;
});

test('K4 EN home has a Thai language switcher', () => {
  const h = get('index.html');
  return h && /class="lang-toggle"[^>]*href="\/th\/"/.test(h.html) ? [] : ['EN home missing ไทย switcher'];
});

/* =========================================================================
   L. Alternating section bands
   Bands run down each page white / paper / white…  The hero's gradient ends on
   paper, so it counts as a grey band and the first section under it must be
   white. Two same-tone bands touching read as one oversized slab — that is the
   bug this catches. Tone comes from `--paper` alone; `--ink` only adds the
   rules top and bottom, so a grey emphasis band is `section--paper section--ink`.
   ========================================================================= */
// Direct <section> children of <main>, with their class attribute.
function bandsOf(html) {
  const open = /<main[^>]*>/i.exec(html);
  if (!open) return [];
  const from = open.index + open[0].length;
  const to = html.toLowerCase().indexOf('</main>', from);
  if (to < 0) return [];
  const inner = html.slice(from, to);
  const out = [];
  let depth = 0, m;
  const re = /<(\/?)section\b([^>]*)>/gi;
  while ((m = re.exec(inner))) {
    if (m[1] === '/') { depth--; continue; }
    if (depth === 0) out.push((/class="([^"]*)"/.exec(m[2]) || [, ''])[1].replace(/\s+/g, ' ').trim());
    depth++;
  }
  return out;
}
const toneOf = (cls) =>
  /\bhero\b/.test(cls) ? 'grey' : /\bsection--paper\b/.test(cls) ? 'grey' : /\bsection\b/.test(cls) ? 'white' : null;
// Legal pages use .lg-sec rules, not bands.
const bandPages = pages.filter((p) => !p.html.includes('qe-legal'));

test('L1 section bands alternate (no two same-tone bands touching)', () =>
  bandPages.flatMap((p) => {
    const b = bandsOf(p.html);
    const errs = [];
    for (let i = 1; i < b.length; i++) {
      const a = toneOf(b[i - 1]), c = toneOf(b[i]);
      if (a && c && a === c)
        errs.push(`${p.rel}: band ${i - 1} "${b[i - 1]}" and band ${i} "${b[i]}" are both ${c}`);
    }
    return errs;
  }));

test('L2 every band is a .section (or the hero)', () =>
  bandPages.flatMap((p) =>
    bandsOf(p.html)
      .filter((c) => toneOf(c) === null)
      .map((c) => `${p.rel}: <section class="${c}"> is not a band component`)));

test('L3 band tone comes only from --paper (no hardcoded --ink background)', () => {
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  const errs = [];
  const light = css.split(':root[data-theme="dark"]')[0];
  if (/(^|\n|})\s*\.section--ink\s*{[^}]*background/.test(light))
    errs.push('.section--ink hardcodes a background in light mode — it must inherit its tone from --paper');
  if (/\.section--\w+\s*\+\s*\.section--/.test(css))
    errs.push('adjacent-sibling band override is back in main.css — fix the page markup instead');
  if (!/\.section--paper{background:var\(--paper\)}/.test(css))
    errs.push('.section--paper no longer sets the paper background');
  return errs;
});

/* =========================================================================
   M. Go-live gates (cutover to the real domain)
   The migration keeps rankings only if every indexed old URL lands somewhere
   real on the first request. These fail the deploy if that stops being true.
   ========================================================================= */
const redirectRows = () => {
  const f = path.join(ROOT, 'seo/redirect-map.csv');
  if (!fs.existsSync(f)) return null;
  return read(f).trim().split(/\r?\n/).slice(1).map((l) => l.split(','));
};

test('M1 every redirect target resolves to a real page', () => {
  const rows = redirectRows();
  if (!rows) return ['seo/redirect-map.csv missing'];
  // resolves() already strips #fragment and ?query, so /blog/#topic checks /blog/.
  return rows.filter(([, to]) => !resolves(to)).map(([from, to]) => `${from} -> ${to} (target does not exist)`);
});

test('M2 no redirect source still exists as a live page', () => {
  const rows = redirectRows();
  if (!rows) return ['seo/redirect-map.csv missing'];
  // A source that is also a real page means the file wins and the 301 never fires.
  return rows
    .filter(([from]) => fs.existsSync(path.join(ROOT, from.replace(/^\//, ''), 'index.html')))
    .map(([from]) => `${from} is both a redirect source and a live page — the redirect is dead`);
});

test('M3 404 page exists, is noindex, and is not in the sitemap', () => {
  const f = path.join(ROOT, '404.html');
  if (!fs.existsSync(f)) return ['404.html missing — CloudFront maps 403/404 to it'];
  const html = read(f); const errs = [];
  if (!/<meta\s+name="robots"\s+content="[^"]*noindex/i.test(html))
    errs.push('404.html is not noindex');
  if (/rel="canonical"/.test(html))
    errs.push('404.html has a canonical — it is served under every missing URL, so it cannot self-canonicalise');
  const sm = path.join(ROOT, 'sitemap.xml');
  if (fs.existsSync(sm) && read(sm).includes('/404')) errs.push('404 page listed in sitemap.xml');
  return errs;
});

test('M4 hreflang pairs are reciprocal and resolve', () => {
  const errs = [];
  const hrefOf = (html, lang) =>
    (html.match(new RegExp(`<link rel="alternate" hreflang="${lang}" href="https://quickeasysoftware\\.com([^"]*)"`)) || [])[1];
  for (const p of thPages) {
    const en = hrefOf(p.html, 'en');
    if (!en) { errs.push('no hreflang="en" href: ' + p.rel); continue; }
    if (!resolves(en)) { errs.push(`${p.rel} points hreflang="en" at ${en}, which does not exist`); continue; }
    const enPage = get(en.replace(/^\//, '') + 'index.html');
    if (!enPage) continue; // resolves() accepted it; not an index.html page we track
    const back = hrefOf(enPage.html, 'th');
    if (back !== pageUrl(p.rel))
      errs.push(`${en} points hreflang="th" at ${back || '(none)'}, expected ${pageUrl(p.rel)}`);
  }
  return errs;
});

test('M5 seo/redirects.json is in sync with redirect-map.csv', () => {
  const f = path.join(ROOT, 'seo/redirects.json');
  if (!fs.existsSync(f)) return ['seo/redirects.json missing — run node seo/gen-kvs-redirects.mjs'];
  const rows = redirectRows();
  if (!rows) return [];
  let parsed;
  try { parsed = JSON.parse(read(f)); } catch (e) { return ['seo/redirects.json is not valid JSON: ' + e.message]; }
  // CloudFront KVS import shape: {"data":[{"key":…,"value":…}]}
  if (!parsed || !Array.isArray(parsed.data))
    return ['seo/redirects.json is not in KVS import shape ({"data":[{key,value}]})'];
  const kvs = Object.fromEntries(parsed.data.map((e) => [e.key, e.value]));
  const errs = [];
  for (const [from, to] of rows) {
    if (kvs[from] === undefined) errs.push(`${from} missing from redirects.json — regenerate it`);
    else if (kvs[from] !== to) errs.push(`${from} -> ${kvs[from]} in redirects.json, ${to} in the csv`);
  }
  return errs;
});

/* =========================================================================
   N. Site search (Pagefind)

   The index itself is build product — deploy.mjs rebuilds ./pagefind/ on every
   deploy — so these check the wiring that has to be right in the repo, not the
   generated bundle, which is absent on a fresh checkout.
   ========================================================================= */
const SEARCH_PAGES = ['search/index.html', 'th/search/index.html'];

test('N1 both search pages exist, are noindex, and carry the results markup', () =>
  SEARCH_PAGES.flatMap((r) => {
    const p = get(r);
    if (!p) return ['missing: ' + r];
    const errs = [];
    if (!isNoindex(p.html)) errs.push('not noindex: ' + r);
    if (!/id="search-form"/.test(p.html)) errs.push('no search form: ' + r);
    if (!/id="search-results"/.test(p.html)) errs.push('no results container: ' + r);
    if (!/id="search-strings"/.test(p.html)) errs.push('no strings block: ' + r);
    if (!/src="\/assets\/js\/search-page\.js(\?v=\d+)?"/.test(p.html)) errs.push('search-page.js not loaded: ' + r);
    // Facets, sort and the no-JS note. The script tolerates any of these being
    // absent, so only a test keeps them from quietly disappearing from a page.
    if (!/id="search-filters-list"/.test(p.html)) errs.push('no section facet list: ' + r);
    if (!/id="search-filters-clear"/.test(p.html)) errs.push('no clear-filters button: ' + r);
    if (!/id="search-sort"/.test(p.html)) errs.push('no sort control: ' + r);
    if (!/<noscript>/.test(p.html)) errs.push('no noscript fallback: ' + r);
    // The idle / no-results panel. It lives in the markup rather than being
    // built by JS so it is there before the index loads, and it is what stops
    // the page being a heading above white space.
    if (!/id="search-empty-title"/.test(p.html) || !/id="search-empty-text"/.test(p.html))
      errs.push('no idle/no-results panel: ' + r);
    if (!/class="hero hero--sub"[\s\S]{0,200}hero-grid/.test(p.html))
      errs.push('hero has no .hero-grid, so it renders with no vertical padding: ' + r);
    try {
      const strings = JSON.parse(/id="search-strings">([\s\S]*?)<\/script>/.exec(p.html)[1]);
      // sectionOrder is the one string the script reads rather than the markup;
      // without it the facets fall back to alphabetical, which reads as random.
      if (!Array.isArray(strings.sectionOrder) || !strings.sectionOrder.length)
        errs.push('no sectionOrder in the strings block: ' + r);
    } catch (e) { errs.push('search strings are not valid JSON: ' + r); }
    return errs;
  }));

// The header carries an icon linking to the search page rather than a field —
// the bar has no room for one. It stays a plain <a>, so search still works with
// JavaScript off: you land on /search/, which has a real GET form.
test('N2 every page has the header search link, pointing at its own language', () =>
  navPages.flatMap((p) => {
    const m = /<a class="site-search" href="([^"]*)"/.exec(p.html);
    if (!m) return ['no header search link: ' + p.rel];
    const errs = [];
    const want = p.rel.startsWith('th/') ? '/th/search/' : '/search/';
    if (m[1] !== want) errs.push(`search link points at ${m[1]}, expected ${want} (${p.rel})`);
    // An icon-only control needs its own accessible name.
    if (!/<a class="site-search"[^>]*aria-label="[^"]+"/.test(p.html))
      errs.push('header search link has no aria-label: ' + p.rel);
    return errs;
  }));

test('N3 data-pagefind-body marks the indexable pages only', () => {
  const errs = [];
  for (const p of pages) {
    const marked = /<main[^>]*data-pagefind-body/.test(p.html);
    // Pagefind indexes only pages carrying the marker, so noindex pages must not.
    const shouldMark = !isNoindex(p.html);
    if (shouldMark && !marked) errs.push('not indexable by Pagefind: ' + p.rel);
    if (!shouldMark && marked) errs.push('noindex page would be indexed by Pagefind: ' + p.rel);
    // Every indexed page also declares the section it belongs to, which is what
    // the /search/ facets are built from. An untagged page still turns up in an
    // unfiltered search but vanishes the moment anyone ticks a box.
    if (marked && !/<main[^>]*data-pagefind-filter="section:[^"]+"/.test(p.html))
      errs.push('indexed but has no section facet: ' + p.rel);
  }
  return errs;
});

test('N4 search-page.js queries Pagefind; main.css and main.js carry the pieces', () => {
  const errs = [];
  const js = path.join(ROOT, 'assets/js/search-page.js');
  if (!fs.existsSync(js)) return ['assets/js/search-page.js missing'];
  const src = read(js);
  if (!src.includes("import('/pagefind/pagefind.js')")) errs.push('search-page.js does not import the Pagefind index');
  // Facets, live typing and the back button: the behaviours that make the
  // results page more than a list, each easy to lose in a refactor.
  if (!src.includes('pagefind.filters()')) errs.push('search-page.js does not read the section facets');
  if (!/filters: \{ section:/.test(src)) errs.push('search-page.js does not filter by section');
  if (!/addEventListener\('input'/.test(src)) errs.push('search-page.js does not search as you type');
  if (!/history\[replace \? 'replaceState' : 'pushState'\]/.test(src)) errs.push('search-page.js does not keep the query in the URL');
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  for (const c of ['.site-search', '.search-form', '.search-results', '.search-result', '.visually-hidden',
                   '.search-layout', '.search-filters', '.search-toolbar', '.search-sort',
                   '.search-form__field', '.search-form__icon', '.search-empty'])
    if (!css.includes(c)) errs.push('main.css missing ' + c);
  if (!read(path.join(ROOT, 'assets/js/main.js')).includes('a.site-search'))
    errs.push('main.js has no "/" search shortcut');
  return errs;
});

test('N5 deploy rebuilds the index and the bundle is not excluded from the sync', () => {
  const errs = [];
  const dep = read(path.join(ROOT, 'deploy.mjs'));
  if (!/PAGEFIND_CMD/.test(dep)) errs.push('deploy.mjs does not build a Pagefind index');
  if (!/pagefind@\d+\.\d+\.\d+/.test(dep)) errs.push('the pagefind version is not pinned in deploy.mjs');
  const cfg = JSON.parse(read(path.join(ROOT, 'deploy.config.json')));
  for (const e of cfg.exclude || [])
    if (/^\/?pagefind/.test(e)) errs.push('deploy.config.json excludes the pagefind bundle: ' + e);
  const ignore = path.join(ROOT, '.gitignore');
  if (!fs.existsSync(ignore) || !/^\/?pagefind\/?$/m.test(read(ignore)))
    errs.push('.gitignore does not ignore the generated /pagefind/ bundle');
  return errs;
});

/* =========================================================================
   V. Click-to-call (the hub softphone's voice-widget.js)
   ========================================================================= */
const VOICE_HUB = 'https://portal.vibecraftedsoftware.com';
const VOICE_UNLISTED = new Set(['stylesheet/index.html', 'landing/index.html', 'landing-thai/index.html', 'search/index.html', 'th/search/index.html']);
const VOICE_SUPPORT = new Set(['support/index.html', 'documentation/index.html', 'th/support/index.html', 'th/documentation/index.html']);
const voicePages = pages.filter((p) => (p.rel.endsWith('index.html') || p.rel === '404.html') && !p.rel.startsWith('pagefind/'));
const voiceTags = (h) => h.match(/<script[^>]*voice-widget\.js[^>]*><\/script>/g) || [];
const isThai = (h) => /<html[^>]*lang="th"/.test(h);

test('V1 every visitor page loads the hub widget once, correctly wired; unlisted pages none', () =>
  voicePages.flatMap((p) => {
    const tags = voiceTags(p.html);
    if (VOICE_UNLISTED.has(p.rel)) return tags.length ? ['widget on unlisted page ' + p.rel] : [];
    if (tags.length !== 1) return [`${tags.length} widget tags in ${p.rel}`];
    const t = tags[0], errs = [];
    if (!t.includes(`src="${VOICE_HUB}/assets/voice-widget.js"`)) errs.push('widget not served from the hub: ' + p.rel);
    if (!t.includes(`data-voice-api="${VOICE_HUB}"`)) errs.push('no data-voice-api (button would never appear): ' + p.rel);
    if (!t.includes('data-voice-site="quickeasy"')) errs.push('wrong/missing site key: ' + p.rel);
    if (!/\bdefer\b/.test(t)) errs.push('widget not deferred: ' + p.rel);
    return errs;
  }));

test('V2 page default list: support on support/documentation, sales elsewhere', () =>
  voicePages.flatMap((p) => {
    const t = voiceTags(p.html)[0];
    if (!t) return [];
    const want = VOICE_SUPPORT.has(p.rel) ? 'support' : 'sales';
    return t.includes(`data-voice-team="${want}"`) ? [] : [`expected data-voice-team="${want}" in ${p.rel}`];
  }));

test('V3 Thai pages load the Thai strings before the widget; English pages do not', () =>
  voicePages.flatMap((p) => {
    const w = p.html.indexOf('voice-widget.js');
    if (w < 0) return [];
    const i = p.html.indexOf(`${VOICE_HUB}/assets/voice-i18n-th.js`);
    if (isThai(p.html)) return i >= 0 && i < w ? [] : ['Thai strings missing or after the widget: ' + p.rel];
    return p.html.includes('voice-i18n-th.js') ? ['Thai strings on an English page: ' + p.rel] : [];
  }));

test('V4 triggers are hidden buttons outside the search index; bubble off where they exist', () =>
  voicePages.flatMap((p) => {
    const errs = [];
    const triggers = p.html.match(/<[a-z]+[^>]*\bdata-voice-call\b[^>]*>/g) || [];
    for (const t of triggers) {
      if (!/^<button\b/.test(t) || !/type="button"/.test(t)) errs.push('trigger is not a <button type="button">: ' + p.rel);
      if (!/\shidden\b/.test(t)) errs.push('trigger not hidden in source: ' + p.rel);
    }
    const rows = p.html.match(/<div class="[^"]*call-row[^"]*"[^>]*>/g) || [];
    if (rows.some((r) => !r.includes('data-pagefind-ignore'))) errs.push('call-row not data-pagefind-ignore: ' + p.rel);
    // A trigger sits in a .call-row, or (in a hero/CTA btn-row) carries data-pagefind-ignore itself.
    const loose = triggers.filter((t) => !t.includes('data-pagefind-ignore'));
    if (loose.length && !rows.length) errs.push('trigger outside a .call-row and not data-pagefind-ignore: ' + p.rel);
    const t = voiceTags(p.html)[0] || '';
    const fabOff = t.includes('data-voice-fab="off"');
    if (triggers.length && !fabOff) errs.push('in-page button but bubble still on: ' + p.rel);
    if (!triggers.length && fabOff) errs.push('bubble off but no in-page button: ' + p.rel);
    return errs;
  }));

test('V5 contact-us rings sales only; support keeps its tel: fallback', () => {
  const errs = [];
  for (const r of ['contact-us/index.html', 'th/contact-us/index.html']) {
    const c = get(r);
    if (!c) { errs.push(r + ' missing'); continue; }
    if (count(c.html, /data-voice-call/g) !== 1) errs.push(r + ': expected exactly one call button');
    if (/data-voice-team="support"/.test(c.html)) errs.push(r + ': rings support (contact page is sales)');
  }
  for (const r of ['support/index.html', 'th/support/index.html']) {
    const s = get(r);
    if (!s) { errs.push(r + ' missing'); continue; }
    if (!s.html.includes('href="tel:')) errs.push(r + ': tel: fallback gone');
    if (!s.html.includes('data-voice-call')) errs.push(r + ': no call button');
  }
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  for (const tok of ['--accent:', '--accent-ink:', '--text:', '--text-muted:'])
    if (!css.includes(tok)) errs.push('main.css lacks widget alias token ' + tok);
  return errs;
});

test('V6 every call button has a hidden chat twin beside it, on the same list', () => {
  const errs = [];
  const tag = (kind) => new RegExp(`<[a-z]+[^>]*\\bdata-voice-${kind}\\b[^>]*>`, 'g');
  const team = (t) => (t.match(/data-voice-team="([^"]*)"/) || [])[1] || '';
  for (const p of voicePages) {
    const chats = p.html.match(tag('chat')) || [];
    for (const t of chats) {
      if (!/^<button\b/.test(t) || !/type="button"/.test(t)) errs.push('chat trigger is not a <button type="button">: ' + p.rel);
      if (!/\shidden\b/.test(t)) errs.push('chat trigger not hidden in source: ' + p.rel);
    }
    if (chats.length && !voiceTags(p.html).length) errs.push('chat trigger but no widget: ' + p.rel);
    // The twin follows its call button directly, so the pair stays in one row.
    const pairs = [...p.html.matchAll(/(<button[^>]*\bdata-voice-call\b[^>]*>)[\s\S]*?<\/button>\s*(<button[^>]*>)?/g)];
    for (const [, call, next] of pairs) {
      if (!next || !/\bdata-voice-chat\b/.test(next)) { errs.push('call button without a chat twin: ' + p.rel); continue; }
      if (team(call) !== team(next)) errs.push('chat twin on a different list: ' + p.rel);
      if (call.includes('data-pagefind-ignore') !== next.includes('data-pagefind-ignore'))
        errs.push('chat twin indexed differently from its call button: ' + p.rel);
    }
    if (chats.length !== pairs.length) errs.push(`${chats.length} chat triggers for ${pairs.length} call buttons: ${p.rel}`);
  }
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  if (!css.includes('[data-voice-call][hidden],[data-voice-chat][hidden]{display:none!important}'))
    errs.push('main.css lets .btn override hidden on the call/chat triggers');
  for (const r of ['popia-policy/index.html', 'website-policy/index.html']) {
    const l = get(r);
    if (!l || !/\bchat\b/i.test(l.html)) errs.push(r + ': does not say chats are saved');
  }
  return errs;
});

/* =========================================================================
   W. Multi-mailer sign-ups (the hub's mail-widget.js)
   ========================================================================= */
const MAIL_NO_POPUP = new Set(['404.html', 'contact-us/index.html', 'support/index.html', 'documentation/index.html',
  'pricing/index.html', 'website-policy/index.html', 'software-policy/index.html', 'popia-policy/index.html']);
const MAIL_NO_OPTIN = new Set(['support/index.html', 'th/support/index.html']);
const mailTags = (h) => h.match(/<script[^>]*mail-widget\.js[^>]*><\/script>/g) || [];
const bareRel = (r) => r.replace(/^th\//, '');

test('W1 the mail widget is wired to the hub, once, wherever it is needed; never on unlisted pages', () =>
  voicePages.flatMap((p) => {
    const tags = mailTags(p.html);
    if (VOICE_UNLISTED.has(p.rel)) return tags.length ? ['mail widget on unlisted page ' + p.rel] : [];
    const needs = p.html.includes('data-mail-optin') || !MAIL_NO_POPUP.has(bareRel(p.rel));
    if (!needs) return tags.length ? ['mail widget on a page with no pop-up or opt-in: ' + p.rel] : [];
    if (tags.length !== 1) return [`${tags.length} mail widget tags in ${p.rel}`];
    const t = tags[0], errs = [];
    if (!t.includes(`src="${VOICE_HUB}/assets/mail-widget.js"`)) errs.push('mail widget not served from the hub: ' + p.rel);
    if (!t.includes(`data-mail-api="${VOICE_HUB}"`)) errs.push('no data-mail-api: ' + p.rel);
    if (!t.includes('data-mail-site="quickeasy"')) errs.push('wrong/missing mail site key: ' + p.rel);
    return errs;
  }));

test('W2 pop-up: on marketing pages and posts, never on contact/support/docs/pricing/legal/404', () =>
  voicePages.flatMap((p) => {
    const t = mailTags(p.html)[0] || '';
    const want = !VOICE_UNLISTED.has(p.rel) && !MAIL_NO_POPUP.has(bareRel(p.rel));
    const has = /\sdata-mail-popup(\s|>)/.test(t);
    if (want && !has) return ['no pop-up on ' + p.rel];
    if (!want && has) return ['pop-up on ' + p.rel];
    if (has && !/data-mail-popup-title="[^"]+"/.test(t)) return ['pop-up without a title on ' + p.rel];
    return [];
  }));

test('W3 contact-form opt-in: on every sales form, never on support, never hard-coded in source', () =>
  voicePages.flatMap((p) => {
    const errs = [];
    const forms = p.html.match(/<form class="contact-form"[^>]*>/g) || [];
    for (const f of forms) {
      const has = /\sdata-mail-optin[\s>=]/.test(f);
      if (MAIL_NO_OPTIN.has(p.rel) && has) errs.push('marketing opt-in on the support form: ' + p.rel);
      if (!MAIL_NO_OPTIN.has(p.rel) && !has) errs.push('contact form without the opt-in: ' + p.rel);
    }
    // The widget adds the box itself (main.js then ticks it). Never hard-code it in the page.
    if (/name="vcm_optin"/.test(p.html)) errs.push('opt-in checkbox hard-coded in source: ' + p.rel);
    return errs;
  }));

test('W4 Thai pages load the Thai mail strings before the widget, with Thai pop-up copy', () =>
  voicePages.flatMap((p) => {
    const t = mailTags(p.html)[0];
    if (!t) return [];
    const w = p.html.indexOf('mail-widget.js'), i = p.html.indexOf(`${VOICE_HUB}/assets/mail-i18n-th.js`);
    if (!isThai(p.html)) return p.html.includes('mail-i18n-th.js') ? ['Thai mail strings on an English page: ' + p.rel] : [];
    const errs = [];
    if (!(i >= 0 && i < w)) errs.push('Thai mail strings missing or after the widget: ' + p.rel);
    const title = (t.match(/data-mail-popup-title="([^"]*)"/) || [])[1];
    if (title && !/[฀-๿]/.test(title)) errs.push('English pop-up title on a Thai page: ' + p.rel);
    return errs;
  }));

test('W5 a refused contact form cannot subscribe; the opt-in checkbox escapes the form input styling', () => {
  const errs = [];
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  if (!/stopImmediatePropagation/.test(js)) errs.push('main.js no longer stops other submit listeners on a refused form');
  if ((js.match(/return refuse\(e\)/g) || []).length < 3) errs.push('not every refusal path in the contact handler calls refuse(e)');
  const css = read(path.join(ROOT, 'assets/css/main.css'));
  if (!css.includes('.contact-form input:not([type=checkbox])')) errs.push('contact-form input styles would restyle the opt-in checkbox');
  for (const tok of ['--vcm-accent:', ':root .vcm-pop.vcm-pop']) if (!css.includes(tok)) errs.push('main.css lacks ' + tok);
  return errs;
});

/* =========================================================================
   Q. Enquiry copies (the hub's forms-widget.js) — a copy, not the delivery
   ========================================================================= */
const formsTags = (h) => h.match(/<script[^>]*forms-widget\.js[^>]*><\/script>/g) || [];

test('Q1 every contact form keeps an enquiry copy; the widget is on exactly those pages, never unlisted ones', () =>
  voicePages.flatMap((p) => {
    const tags = formsTags(p.html);
    const forms = p.html.match(/<form class="contact-form"[^>]*>/g) || [];
    if (VOICE_UNLISTED.has(p.rel)) return tags.length || p.html.includes('data-enquiry-form') ? ['enquiry widget on unlisted page ' + p.rel] : [];
    const errs = [];
    for (const f of forms) if (!/\sdata-enquiry-form[\s>]/.test(f)) errs.push('contact form without data-enquiry-form: ' + p.rel);
    if (!forms.length) return tags.length ? ['enquiry widget on a page with no contact form: ' + p.rel] : [];
    if (tags.length !== 1) return [...errs, `${tags.length} enquiry widget tags in ${p.rel}`];
    const t = tags[0];
    if (!t.includes(`src="${VOICE_HUB}/assets/forms-widget.js"`)) errs.push('enquiry widget not served from the hub: ' + p.rel);
    if (!t.includes(`data-forms-api="${VOICE_HUB}"`)) errs.push('no data-forms-api: ' + p.rel);
    if (!t.includes('data-forms-site="quickeasy"')) errs.push('wrong/missing forms site key: ' + p.rel);
    if (!/\sdefer[\s>]/.test(t)) errs.push('enquiry widget not deferred: ' + p.rel);
    // Must bind after main.js (a deferred head script) so a refused form records nothing.
    if (p.html.indexOf('forms-widget.js') < p.html.indexOf('/assets/js/main.js')) errs.push('enquiry widget before main.js: ' + p.rel);
    return errs;
  }));

test('Q2 the contact handler still delivers through the relay and cancels no one else', () => {
  const errs = [];
  if (fs.existsSync(path.join(ROOT, 'assets/forms-widget.js')) || fs.existsSync(path.join(ROOT, 'assets/js/forms-widget.js')))
    errs.push('forms-widget.js copied into the repo — serve it from the hub');
  const js = read(path.join(ROOT, 'assets/js/main.js'));
  if (!/RELAY_URL = "https:/.test(js)) errs.push('main.js lost the relay — the enquiry copy is not the delivery');
  return errs;
});

test('Q3 the privacy notice says a copy of each enquiry is kept in the portal', () => {
  const h = read(path.join(ROOT, 'popia-policy/index.html'));
  const errs = [];
  if (!/copy is kept in our client portal/.test(h)) errs.push('POPIA policy does not mention the enquiry copy');
  if (!/enquiry copies on our behalf/.test(h)) errs.push('POPIA policy does not name the operator for enquiry copies');
  return errs;
});

/* =========================================================================
   Report
   ========================================================================= */
let passed = 0, failed = 0;
for (const r of results) {
  if (r.errors.length === 0) { passed++; console.log('  ✓ ' + r.name); }
  else {
    failed++;
    console.log('  ✗ ' + r.name);
    for (const e of r.errors.slice(0, 12)) console.log('      - ' + e);
    if (r.errors.length > 12) console.log(`      … and ${r.errors.length - 12} more`);
  }
}
console.log(`\n${passed} passed, ${failed} failed  (${pages.length} pages, ${blogPosts.length} blog posts checked)`);
process.exit(failed ? 1 : 0);
