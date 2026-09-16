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

- Top nav: Home · Pricing · Blogs · **Support** (Documentation, Customer Service) ·
  About · [Contact us]. The old **Products**, **Resources**, **Apps** and **Solutions**
  menus were all removed — tests B1 and F2 fail if any of them comes back.
- Blogs menu = 8 topic anchors into `/blog/` + **All Blogs**. Blog posts keep their
  date-based URLs (`/YYYY/MM/DD/slug/`) — an intentional, redirect-backed exception to the
  build-standard's nav-mirrored folders, to preserve SEO. Do not move them.
- Removed pages (Products pages, referral partner, Resources tutorials, `/articles/`,
  legacy flat posts/author archives) are 301-redirected in `SITE-REDIRECTS.txt`.

### Landing pages

The search-targeted landing pages used to hang off a **Solutions** dropdown, then off a
footer column. Both are gone — these pages now have **no site-wide chrome link at all**.
What keeps them reachable is the **in-body mesh**: blog posts, the homepage, and the
pillar/cluster links between them (minimum 8 inbound in-body links each; test **B4**
fails under 4). Don't strip those links, and don't assume a footer link is backing them
up. Two pillars, each linking down to its cluster:

- `/manufacturing-erp/` → `/mrp-software/`, `/production-planning-software/`,
  `/job-costing-software/`, `/inventory-management-software/`
- `/printing-signage-packaging/` → `/print-estimating-software/`, `/signage-software/`,
  `/packaging-erp/`

Plus `/erp-software-south-africa/`, `/erp-for-small-business/` and
`/estimating-and-quoting-features-benefits/`. House rules for these pages: **no images**,
no fabricated proof (no invented logos, testimonials or statistics), every claim traceable
to a real BOS module or a published price, one primary CTA, and the "Related" sections
left intact — they are the internal-link mesh. Structure follows
`web-builder-skills:website-sales-tool`: hero → problem cards → matching solution cards →
how it works → what's included → honest objections → CTA.

`/landing/` is an **unlisted internal index** of them all (target query, intent, when to
use each), for the marketing team. Same treatment as `/stylesheet/` — see below.

### The blog → product link mesh

Blog posts carry contextual in-body links to these pages. With no chrome link anywhere,
this mesh is the *only* thing linking them — and it is the better kind anyway, because
the **anchor text sits in a sentence**. Rules the sweep enforces, and any hand-edit
should too: the anchor is a phrase **already in the prose** (never a sentence written to
carry a link), it sits in a `<p>` or `<li>` and never a heading, one link per target per
post, first relevant occurrence, and a per-post cap scaled to length (~3–10 contextual
links per 1,000 words is the usual guidance; the blog currently sits at 1.87). Don't
strip these when editing post copy.

### Post → post links

Every post ends with a **Related reading** band (`section--paper`, so it alternates off
the white content band) holding three related posts, with the "Back to all Blogs" link
moved into it. Relatedness is TF-IDF cosine similarity over post bodies plus a bonus for
sharing a `/blog/` topic category, so the mesh can never disagree with the listing.
Anchor text is the destination post's own title. Inbound links are spread by a cap
(min 1, max 6, mean 3) — **no post has zero inbound**, which is the state that gets a
page dropped from the crawl. Thai posts mirror the English mesh through their `/th/`
twins, reusing each post's already-translated title, so no new Thai prose was generated.

Blog contextual-link density is now **4.0 per 1,000 words**, inside the 3–10 guidance.

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
  it. `/th/manufacturing-erp/` and `/th/printing-signage-packaging/` were rebuilt
  alongside their English pillars and are a **fresh machine draft not yet reviewed**;
  the four newer English landing pages have no Thai version yet. Thai marketing/blog copy is a machine-drafted
  first pass — **flag for
  native-speaker review** before launch. Thai contact (Thailand distribution partner): Vibe Crafted Software,
  Pattraporn (Nim) Thiamjai, info@vibecraftedsoftware.com, +66 (0) 92 849 4555.

## Unlisted pages (`/stylesheet/`, `/landing/`)

Both are live, deliberately unlisted, and must stay that way: nothing links to them,
they are `noindex,nofollow` (so `gen-sitemap.mjs` skips them), and neither carries
`data-pagefind-body`, so site search never returns them (test N3 would fail if it did).
They *do* keep their Organization + BreadcrumbList JSON-LD, because test I5 wants a graph
on every page. Reach them by typing the URL. Don't add either to the nav, the footer, or
any sweep that adds links.

- `/landing/` — the internal index of every landing page, with what each one targets and
  when to send a prospect to it. Update it whenever a landing page is added or retired.
- `/stylesheet/` is a living style guide for `main.css` — every token, type
  style and component rendered live, so both palettes can be checked by flipping
  the header theme toggle. Keep it current when adding a component.
- Its swatch-grid CSS lives in a page-local `<style>` block rather than in
  `main.css` — no visitor-facing page needs those rules.

## Site search (Pagefind)

- Search opens on its own page — `/search/` (EN) and `/th/search/` (TH) — never as
  an overlay. Both are `noindex,follow` (Google advises against indexing internal
  search results) and are therefore skipped by `seo/gen-sitemap.mjs`, which now
  filters any page carrying a `noindex` robots meta.
- The header carries a `.site-search` **icon link** on every page — a magnifier
  pointing at `/search/` (or `/th/search/` on Thai pages), boxed exactly like the
  `.theme-toggle` beside it. It replaced the in-bar field: the bar had no room for
  an input anyone could type into. It is a plain `<a>`, so search still works with
  JS off — you land on the search page, which has a real `GET` form. `main.js` adds
  the `/` hotkey, which focuses the field when already on a search page and follows
  the link otherwise. Icon-only, so it carries an `aria-label` (test N2 checks both
  the target and the label).
- `assets/js/search-page.js` runs on the search pages only. It dynamically imports
  `/pagefind/pagefind.js` and renders the results itself — the Pagefind **JS API**,
  not PagefindUI, so the markup uses our own tokens. UI strings live in a
  `<script type="application/json" id="search-strings">` block per page, which is
  how the Thai page is translated; only `sectionOrder` is read by the script, the
  rest of the results-page UI is static markup.
- **The URL is the state.** `?q=`, any number of `&section=`, and `&sort=` are read
  on load, written back as the visitor types or filters, and re-read on `popstate`.
  Typing `replaceState`s (so one search does not leave thirty history entries);
  submitting, filtering and sorting `pushState`. Results update ~180 ms after the
  last keystroke, with a run counter so a slow early query cannot overwrite a
  later one.
- **Section facets** come from Pagefind's own filter data, so the list can never
  drift from what was indexed. Counts shown per facet are what the *current query*
  returns, not the size of the section; a facet returning nothing gets `.is-empty`
  rather than vanishing.
- **`data-pagefind-body` on `<main>` is the opt-in marker** and does two jobs:
  it keeps nav/header/footer chrome out of every excerpt, and it excludes the
  pages that must never be indexed — `404.html`, the two search pages,
  `/stylesheet/` and `/landing/`, which deliberately never carry it. Any new page
  needs it, or it will be unsearchable. The same `<main>` also carries
  **`data-pagefind-filter="section:…"`** — `Solutions` · `Pricing` · `Blog` ·
  `Support` · `Company`, localised on Thai pages (`โซลูชัน` · `ราคา` · `บล็อก` ·
  `ฝ่ายสนับสนุน` · `บริษัท`). Both are added by the same Node sweep that maintains
  nav/footer; test N3 fails on an indexed page missing either.
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
- Tests N1–N5 cover the wiring (page markup including the facet list, sort control
  and noscript note; the header form per language; the `data-pagefind-body` +
  `data-pagefind-filter` invariant; the script/CSS pieces including live typing,
  faceting and URL state; and that deploy builds a pinned index). They deliberately
  do **not** assert on `/pagefind/` output, which is absent on a fresh checkout.

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
