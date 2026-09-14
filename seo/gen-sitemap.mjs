// Regenerate /sitemap.xml from the live static pages.
// Folder path = live URL. Lists every canonical, indexable page (one per
// index.html). Excludes non-page dirs and anything in the *-REDIRECTS.txt logs.
// Run:  node seo/gen-sitemap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://quickeasysoftware.com';
const SKIP = new Set(['node_modules', '.git', 'assets', 'test', 'seo', 'pagefind']);

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.name === 'index.html') out.push(full);
  }
  return out;
}
function urlOf(file) {
  let rel = path.relative(ROOT, file).split(path.sep).join('/').replace(/index\.html$/, '');
  return '/' + rel; // '' -> '/', 'blog/' -> '/blog/'
}

// Redirect sources must never appear in the sitemap.
const redirectSources = new Set();
for (const f of fs.readdirSync(ROOT).filter((f) => /-REDIRECTS\.txt$/.test(f))) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*(\/[^\s]*)\s*->/);
    if (m) redirectSources.add(m[1]);
  }
}

// noindex pages (the /search/ results pages) are live but must not be listed.
const isNoindex = (file) =>
  /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(fs.readFileSync(file, 'utf8'));

let urls = walk(ROOT).filter((f) => !isNoindex(f)).map(urlOf);
urls = urls.filter(u => !redirectSources.has(u));
// Sort: home first, then alphabetical.
urls.sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));

const body = urls.map(u => `  <url>\n    <loc>${SITE}${u}</loc>\n  </url>`).join('\n');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
console.log(`Wrote sitemap.xml with ${urls.length} URLs`);
