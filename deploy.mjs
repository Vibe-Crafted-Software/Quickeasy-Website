#!/usr/bin/env node
/* =========================================================================
   QuickEasy Software — one-command deploy.
   Dependency-free. Run with:  npm run deploy   (or: npm run deploy:dry)

   Reads deploy.config.json and does, aborting on the first failure:
     1. npm test                       — never deploy a red suite
     2. regenerate the SEO artifacts   — and refuse if they were stale
     3. build the Pagefind search index — rebuilt so it matches what ships
     4. sync assets, by cache-control group
     5. sync pages and root files, honouring the exclude list
     6. invalidate CloudFront          — skipped until a distribution exists
     7. verify a few URLs actually return 200

   --dry-run  dry-runs every AWS call and changes nothing.
   ========================================================================= */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
const DRY = process.argv.includes('--dry-run');
// `aws s3 sync` compares size and mtime, never metadata, so editing cacheControl in
// deploy.config.json changes nothing for files whose bytes did not also change — and
// anything uploaded before headers were used keeps no header at all. --refresh-headers
// re-uploads each asset group unconditionally to reapply them. Run it after changing a
// cache-control value; normal deploys stay incremental.
const REFRESH = process.argv.includes('--refresh-headers');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'deploy.config.json'), 'utf8'));
const { bucket, region, cloudfrontDistributionId: distId, url: siteUrl } = cfg.aws;
// Pagefind is a build tool, not a site dependency, so it stays out of package.json
// and runs through npx. Pinned: an unpinned index bundle can drift out of step with
// the pagefind.js the search page imports. Override in deploy.config.json.
const PAGEFIND_CMD = cfg.search?.command ?? 'npx -y pagefind@1.5.2 --site .';

let step = 0;
const say = (msg) => console.log(`\n[${++step}] ${msg}`);
const ok = (msg) => console.log(`    \u2713 ${msg}`);
const die = (msg) => { console.error(`\n    \u2717 ${msg}\n`); process.exit(1); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// A single command string rather than an argv array: with shell:true Node only
// concatenates argv without escaping (DEP0190), so quoting is done here, explicitly,
// in one place. Everything interpolated comes from deploy.config.json or this file.
const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;

function run(cmdline, { capture = false } = {}) {
  const r = spawnSync(cmdline, {
    cwd: ROOT,
    shell: true, // npm is a .cmd shim on Windows
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024, // a full-site sync prints a line per object
  });
  if (r.error) die(`could not run: ${cmdline}\n      ${r.error.message}`);
  if (r.status !== 0) {
    if (capture) console.error((r.stdout || '') + (r.stderr || ''));
    die(`exited ${r.status}: ${cmdline}`);
  }
  return (r.stdout || '').trim();
}

const aws = (cmdline, opts) => run(`aws ${cmdline} --region ${region}`, opts);
// aws s3 prefixes each line with "(dryrun) " when --dryrun is in play.
const counted = (out) => (out.match(/^(?:\(dryrun\) )?(?:upload|delete):/gm) || []).length;
const dryFlag = DRY ? ' --dryrun' : '';

/* ---------- 1. tests ---------- */
say('Running the test suite');
run('npm test');

/* ---------- 2. SEO artifacts must already be current ---------- */
say('Checking the SEO artifacts are current');
const generated = ['sitemap.xml', 'seo/redirect-map.csv', 'seo/redirects.json'];
const before = Object.fromEntries(generated.map((f) => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]));
for (const g of ['seo/gen-redirect-map.mjs', 'seo/gen-kvs-redirects.mjs', 'seo/gen-sitemap.mjs']) {
  run(`node ${q(g)}`, { capture: true });
}
const stale = generated.filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8') !== before[f]);
if (stale.length) {
  die(
    `these were out of date and have now been regenerated:\n      ${stale.join('\n      ')}\n` +
      `    Review and commit them, then deploy again — a deploy should not be the thing\n` +
      `    that first writes them.`
  );
}
ok('sitemap, redirect map and KVS map were already up to date');

/* ---------- 3. search index ----------
   Pagefind reads the finished HTML and writes ./pagefind/. It runs on every
   deploy so the index always matches what is about to be uploaded; the output
   is build product, so it is gitignored rather than committed. Only pages
   carrying data-pagefind-body are indexed, which is what keeps 404.html, the
   /search/ pages themselves and all the nav/footer chrome out of the results. */
say('Building the Pagefind search index');
if (DRY) {
  console.log(`    – would run: ${PAGEFIND_CMD}`);
} else {
  fs.rmSync(path.join(ROOT, 'pagefind'), { recursive: true, force: true });
  const out = run(PAGEFIND_CMD, { capture: true });
  const pages = (out.match(/Indexed (\d+) pages/) || [])[1];
  const words = (out.match(/Indexed (\d+) words/) || [])[1];
  if (!fs.existsSync(path.join(ROOT, 'pagefind', 'pagefind.js'))) {
    die('pagefind ran but produced no pagefind/pagefind.js — the search page would 404 on its index.');
  }
  ok(`indexed ${pages || '?'} pages${words ? `, ${words} words` : ''}`);
}

/* ---------- 4. assets ---------- */
say('Syncing assets');
for (const [name, group] of Object.entries(cfg.cacheControl)) {
  if (name === '_comment' || !group.paths) continue;
  for (const p of group.paths) {
    if (!fs.existsSync(path.join(ROOT, p))) { ok(`${p} — not present, skipped`); continue; }
    if (REFRESH) {
      // cp --recursive always re-uploads, so every object gets the header. Uploading
      // from local (rather than an S3-to-S3 copy) keeps Content-Type correct — a
      // same-bucket copy with --metadata-directive REPLACE resets it to
      // binary/octet-stream unless every type is restated.
      const forced = aws(
        `s3 cp ${q('./' + p)} ${q(`s3://${bucket}/${p}`)} --recursive --cache-control ${q(group.value)}${dryFlag}`,
        { capture: true }
      );
      ok(`${p} → ${group.value}  (${plural(counted(forced), 'file')}, headers reapplied)`);
      continue;
    }
    const out = aws(
      `s3 sync ${q('./' + p)} ${q(`s3://${bucket}/${p}`)} --delete --cache-control ${q(group.value)}${dryFlag}`,
      { capture: true }
    );
    ok(`${p} \u2192 ${group.value}  (${plural(counted(out), 'change')})`);
  }
}

/* ---------- 5. pages ---------- */
say('Syncing pages and root files');
const excludes = ['assets/*', ...cfg.exclude].map((e) => `--exclude ${q(e)}`).join(' ');
const pagesOut = aws(
  `s3 sync . ${q(`s3://${bucket}`)} --delete ${excludes} --cache-control ${q(cfg.cacheControl.pages.value)}${dryFlag}`,
  { capture: true }
);
ok(`${plural(counted(pagesOut), 'change')} \u2192 ${cfg.cacheControl.pages.value}`);

/* ---------- 6. invalidate ---------- */
say('Invalidating CloudFront');
if (!distId) {
  console.log(
    '    \u2013 no cloudfrontDistributionId set, so there is nothing to invalidate.\n' +
      '      That is exactly why assets/css and assets/js carry a short revalidating\n' +
      '      cache rather than an immutable one. Set the ID after the cutover and they\n' +
      '      can go back to immutable.'
  );
} else if (DRY) {
  console.log(`    \u2013 would invalidate /* on ${distId}`);
} else {
  const res = aws(`cloudfront create-invalidation --distribution-id ${distId} --paths ${q('/*')} --output json`,
    { capture: true });
  const id = JSON.parse(res).Invalidation.Id;
  ok(`invalidation ${id} created`);
  aws(`cloudfront wait invalidation-completed --distribution-id ${distId} --id ${id}`);
  ok('invalidation completed');
}

/* ---------- 7. verify ---------- */
say('Verifying live URLs');
if (DRY) {
  console.log('    \u2013 dry run, skipping');
} else {
  const base = (siteUrl || '').replace(/\/$/, '');
  const devnull = process.platform === 'win32' ? 'NUL' : '/dev/null';
  const bad = [];
  for (const p of cfg.verifyPaths || ['/']) {
    const code = run(`curl -s -o ${devnull} -w ${q('%{http_code}')} -m 20 ${q(base + p)}`, { capture: true });
    if (code === '200') ok(`${p} \u2192 200`);
    else bad.push(`${p} \u2192 ${code}`);
  }
  if (bad.length) die(`these did not return 200:\n      ${bad.join('\n      ')}`);
}

console.log(`\n${DRY ? 'Dry run complete — nothing changed.' : 'Deployed.'}  ${siteUrl}\n`);
