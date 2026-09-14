# QuickEasy Software — website

Marketing & sales website for **QuickEasy Software SA (Pty) Ltd** (QuickEasy BOS ERP).
Being converted from a WordPress static mirror into clean, standard **HTML / CSS / JS**
(no WordPress, no plugins, no build framework).

## ⭐ Always use the `web-builder-skills` plugin

Before doing website work, **invoke the matching skill and follow its guide and
reference files** — don't work from memory. These carry the vetted, South-Africa-first
approach and worked examples for this exact site:

| Task | Skill to invoke |
|------|-----------------|
| Build/convert a site, folder structure, CMS-stripping, stack | `web-builder-skills:website-build-standards` |
| Contact forms / relay/API wiring | `web-builder-skills:contact-form-integration` |
| Homepage / landing-page sales copy & structure | `web-builder-skills:website-sales-tool` |
| Technical or content SEO, sitemap, robots, structured data, IndexNow | `web-builder-skills:website-seo` |
| Website terms of use / privacy / cookies (ECTA, CPA, POPIA) | `web-builder-skills:terms-of-use-website` |
| Software / SaaS / custom-dev terms, IP, licensing, liability | `web-builder-skills:terms-of-use-software` |

Each skill points to a `references/*.md` file with the full template/checklist — read it.
Skills are **drafting aids, not legal advice**; flag attorney review for legal pages.

## House style (see also memory + README.md)

- **Follow the web-builder-skills style** — the clean, standard HTML/CSS/JS rebuild
  aesthetic these guides produce — **except** the QuickEasy **logo icon, which stays red/colour**.
  (This supersedes the old "match the WordPress/Beaver Builder look".)
- **Brand:** font `Open Sans`; accent red `#cb333b`; ink `#2d2926`; paper `#f4f3f1`.
- **Imagery:** grayscale (CSS `filter: grayscale(100%)`); the QuickEasy **logo stays red/colour**.
- **Blog posts:** the user does **not** want images in blog posts (not seen as SEO-valuable).
- **SEO first:** preserve existing rankings — keep URLs, titles, meta, headings; use 301
  redirects for anything moved/removed (logged in `*-REDIRECTS.txt`). Never rename a page
  folder without a redirect.

## Architecture (clean rebuild)

- `assets/css/main.css` — design system (tokens, header/nav, footer, sections, cards,
  pricing, forms). One central stylesheet per the build-standards skill.
  (`assets/css/legal.css` is the one allowed second sheet, for legal pages only.)
- **Section bands alternate** white / paper / white down every page. The hero's
  gradient ends on paper, so it counts as a grey band and the first section under it
  must be white. Tone comes from `section--paper` alone; `section--ink` only adds the
  rules top and bottom, so a grey emphasis band is `section section--paper section--ink`.
  Enforced by `test/site-check.mjs` (L1–L3) — never patch it with an adjacent-sibling
  CSS override; fix the page markup.
- `assets/js/main.js` — vanilla nav, contact-form handler, and pricing currency toggle.
- `assets/img/…` — brand/hero/client images (relocated off `wp-content`).
- Pages are plain HTML using these assets with **root-relative** paths (`/assets/…`, `/pricing/`).
- **Nav & footer are duplicated in every page** (no build system). Change them with a
  one-off Node sweep over all pages, not by hand file-by-file.
- Contact form: wired to the shared relay (`RELAY_URL` in `main.js`, per
  `web-builder-skills:contact-form-integration`). `recipientFor()` switches on
  hostname: live `quickeasysoftware.com` / `www.` → `info@quickeasysoftware.com`,
  everywhere else (staging, localhost, preview hosts) → the dev inbox
  `info@vibecraftedsoftware.com`. Keep that switch intact — pinning it to the dev
  inbox silently swallows every live enquiry.
- `404.html` at the root is the error page, served by CloudFront for both 404 and
  **403** (S3 behind OAC returns 403 for a missing key). It is `noindex` with no
  canonical and no JSON-LD, since it answers for every missing URL.

## Information architecture

- Top nav: Home · Pricing · Apps · Blogs · **Support** (Documentation, Customer Service) ·
  About · Contact · [Book a Demo]. The old **Products** and **Resources** menus were removed.
- Blogs menu = 8 topic anchors into `/blog/` + **All Blogs**. Blog posts keep their
  date-based URLs (`/YYYY/MM/DD/slug/`) — an intentional, redirect-backed exception to the
  build-standard's nav-mirrored folders, to preserve SEO. Do not move them.
- Removed pages (Products pages, referral partner, Resources tutorials, `/articles/`,
  legacy flat posts/author archives) are 301-redirected in `SITE-REDIRECTS.txt`.

## SEO / migration

This is a same-domain WordPress→static migration of an already-ranking site
(skill `web-builder-skills:website-seo` Part 7). Repo-side SEO artifacts:

- `robots.txt` + `sitemap.xml` at root. Regenerate the sitemap after adding/
  removing pages: `node seo/gen-sitemap.mjs` (walks live `index.html` files,
  excludes redirect sources; non-www, trailing-slash URLs).
- **Structured data (JSON-LD)** is injected before `</head>` on every page:
  Organization (site-wide, with `areaServed`/`knowsAbout`), WebSite (home),
  BreadcrumbList (inner pages), BlogPosting (posts), SoftwareApplication
  (`/bos-erp/`). Applied by the one-off sweep — carry it forward on any new page.
- **Redirects:** the human-readable logs are every `*-REDIRECTS.txt` at the root —
  `SITE-`, `BLOG-`, `LEGAL-` and `WP-LEGACY-` (the last covers URLs still indexed
  from the WordPress site that the rebuild didn't otherwise account for). The
  generators and tests discover them by glob, so a new log needs no registration.
  A `#` starts a comment only at line start or after whitespace, so a target can
  carry a `#fragment` (the category archives land on `/blog/#topic`).
  `node seo/gen-redirect-map.mjs` consolidates them into `seo/redirect-map.csv`
  (single-hop 301s, validated for cycles/dupes), then
  `node seo/gen-kvs-redirects.mjs` turns that into `seo/redirects.json` — the flat
  map a CloudFront KeyValueStore imports, with slash and percent-encoded variants
  of every key, because the edge matches the raw `request.uri`. **Serving these
  301s is the host's job** (`web-builder-skills:website-deployment`), not the repo.
- Before go-live, keep the gate empty: every URL in the live Yoast sitemaps
  (`/post-`, `/page-`, `/category-sitemap.xml`) must either exist in the rebuild
  or be a redirect source. Tests M1–M5 enforce the repo half of this.
- Every page has a self-referencing canonical (non-www). Don't add `Disallow: /`
  to `robots.txt` — a staging block leaking to production deindexes the site.

## Theming (light / dark)

- Token-based: `:root` in `main.css` holds the **light** palette; a dark palette
  redefines the same tokens under `:root[data-theme="dark"]` (plus a
  `@media (prefers-color-scheme:dark)` no-JS fallback). Neutral-grey dark theme.
- `data-theme` is set on `<html>` **pre-paint** by a tiny inline `<script>` in
  every page's `<head>` (before `main.css`) — it reads `localStorage.theme`, else
  falls back to the OS preference. A `.theme-toggle` button in the header (added
  site-wide by the sweep) flips light↔dark and persists the choice (`main.js`).
- **New components must use the tokens** (`--bg`, `--surface`, `--paper`, `--ink`,
  `--body`, `--line`, `--red`…) — never hardcode light colours, or they won't
  theme. The header/footer button + init script are duplicated per page, so change
  them with the Node sweep, not by hand.
- Dark logo: `assets/img/logo-dark.png` (swap wired in `main.css`); until supplied,
  a light chip sits behind the header logo in dark mode.

## Internationalisation (Thai)

- Thai lives under a parallel **`/th/`** URL tree (e.g. `/th/`, `/th/pricing/`),
  each page `<html lang="th">` with `<link rel="alternate" hreflang="en|th|x-default">`
  pairing it to its English counterpart. English pages carry the reciprocal
  hreflang. Both are in `sitemap.xml`.
- A header **ไทย / EN** `.lang-toggle` link (next to the theme toggle) switches
  between a page and its translated counterpart — a plain `<a>`, no JS.
- Thai pages load **Noto Sans Thai** (added to their Google Fonts link) and
  `html[lang="th"]` sets `--font` to it; Latin falls back to Open Sans.
- **Status:** homepage, most inner marketing/feature pages, all 112 blog posts, and the
  `/th/blog/` hub are translated under `/th/`. Nav/footer links on Thai pages point to
  English pages until each target is translated; translate a page, drop it at
  `/th/<path>/`, then repoint. **Legal pages are excluded** (need professional
  translation, not a first-pass machine draft). Blog posts keep their date-based
  `/th/YYYY/MM/DD/slug/` URLs, mirroring the English structure; `/th/blog/` mirrors
  `/blog/`'s 8 topic categories, reusing each post's already-translated title/date, and
  every Thai page's Blogs nav submenu + each post's "back to all blogs" link point at
  it. Thai marketing/blog copy is a machine-drafted first pass — **flag for
  native-speaker review** before launch. Thai contact (Thailand distribution partner): Vibe Crafted Software,
  Pattraporn (Nim) Thiamjai, info@vibecraftedsoftware.com, +66 (0) 92 849 4555.

## Style sheet (unlisted)

- `/style-sheet/` is a living style guide for `main.css` — every token, type
  style and component rendered live, so both palettes can be checked by flipping
  the header theme toggle. Keep it current when adding a component.
- **It is deliberately unlisted and must stay that way**: nothing links to it,
  it is `noindex,nofollow` (so `gen-sitemap.mjs` skips it), and it has no
  `data-pagefind-body`, so site search never returns it. Reach it by typing the
  URL. Don't add it to the nav, the footer, or any sweep that adds links.
- Its swatch-grid CSS lives in a page-local `<style>` block rather than in
  `main.css` — no visitor-facing page needs those rules.

## Site search (Pagefind)

- Search opens on its own page — `/search/` (EN) and `/th/search/` (TH) — never as
  an overlay. Both are `noindex,follow` (Google advises against indexing internal
  search results) and are therefore skipped by `seo/gen-sitemap.mjs`, which now
  filters any page carrying a `noindex` robots meta.
- The header carries a `.site-search` form on **every** page: a plain `GET` to
  `/search/` (or `/th/search/` on Thai pages), so search works with JS off.
  `main.js` only adds the `/` hotkey that focuses it.
- `assets/js/search-page.js` runs on the search pages only. It reads `?q=`,
  dynamically imports `/pagefind/pagefind.js` and renders the results itself —
  the Pagefind **JS API**, not PagefindUI, so the markup uses our own tokens.
  UI strings live in a `<script type="application/json" id="search-strings">`
  block per page, which is how the Thai page is translated.
- **`data-pagefind-body` on `<main>` is the opt-in marker** and does two jobs:
  it keeps nav/header/footer chrome out of every excerpt, and it excludes the
  pages that must never be indexed — `404.html` and the two search pages, which
  deliberately never carry it. Any new page needs it, or it will be unsearchable.
  Added by the same Node sweep that maintains nav/footer.
- Thai is free: Pagefind reads `<html lang>`, builds a separate index per
  language, and loads the one matching the page doing the searching. So
  `/th/search/` returns only Thai pages. (Pagefind has no Thai stemmer — matches
  are exact rather than across root words.)
- **The index is build product, not source.** `/pagefind/` is gitignored and
  rebuilt by `deploy.mjs` step 3 on every deploy (`npx -y pagefind@1.5.2 --site .`,
  pinned — override via `search.command` in `deploy.config.json`), so it always
  matches the HTML being uploaded. It is *not* in the deploy exclude list, and
  rides the short `pages` cache-control because `pagefind.js` and
  `pagefind-entry.json` have unhashed names. To preview search locally you must
  run the pagefind command yourself first; without it the page degrades to
  "Search is unavailable right now."
- Tests N1–N5 cover the wiring (pages, header form per language, the
  `data-pagefind-body` invariant, the script/CSS pieces, and that deploy builds
  a pinned index). They deliberately do **not** assert on `/pagefind/` output,
  which is absent on a fresh checkout.

## Conventions

- Folder path = live URL (static site served at domain root).
- Preview locally: `node <scratch>/serve.mjs "C:/Projects/Quickeasy Website"` → http://localhost:8099
- **Deploy: `npm run deploy`** (`npm run deploy:dry` to see it without changing
  anything). Driven by `deploy.config.json`: runs `npm test`, refuses if the
  generated SEO artifacts were stale, rebuilds the Pagefind search index, syncs by
  cache-control group, invalidates CloudFront once `cloudfrontDistributionId` is
  set, then checks a few URLs return 200. Don't hand-run `aws s3 sync` — the cache
  headers and exclude list live in that config for a reason.
- Legacy WordPress dirs (`wp-admin`, `wp-content/plugins`, `wp-includes`, `wp-json`,
  `xmlrpc.php`, feeds) are being removed — do not add new references to them.
- Commit messages end with the required `Co-Authored-By` trailer.
