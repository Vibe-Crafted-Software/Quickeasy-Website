/* ============================================
   Dedicated search results page (/search/ and /th/search/).

   Queries the Pagefind index that was built at deploy time (see deploy.mjs
   step 3) and renders the results itself, so the markup uses our own tokens
   rather than PagefindUI's. Pagefind picks the index matching the <html lang>
   of THIS page, so the Thai page searches the Thai pages and the English page
   the English ones.

   The URL is the state: ?q=, any number of &section=, and &sort= are read on
   load, written back as the visitor types or filters, and re-read on popstate.
   So the back button works, a result page can be bookmarked, and the header's
   plain GET form still lands on a URL this page can answer.

   Loaded only by the search pages — every other page just carries the header
   form, which is a plain GET and needs no JavaScript.
   ============================================ */
(function () {
  var form = document.getElementById('search-form');
  var input = document.getElementById('search-input');
  var headingEl = document.getElementById('search-heading');
  var statusEl = document.getElementById('search-status');
  var resultsEl = document.getElementById('search-results');
  var filtersEl = document.getElementById('search-filters');
  var filtersList = document.getElementById('search-filters-list');
  var clearBtn = document.getElementById('search-filters-clear');
  var sortSelect = document.getElementById('search-sort');
  var sortLabel = document.getElementById('search-sort-label');
  var emptyEl = document.getElementById('search-empty');
  var emptyTitle = document.getElementById('search-empty-title');
  var emptyText = document.getElementById('search-empty-text');
  if (!form || !input || !resultsEl) return;

  var T = JSON.parse(document.getElementById('search-strings').textContent);

  // Facets read down the page in the order the site is organised, not
  // alphabetically. A section missing from here still appears — it just sorts
  // to the end — so adding one needs no change in this file.
  var SECTION_ORDER = T.sectionOrder || [];

  var pagefindPromise = null;
  function ensurePagefind() {
    if (!pagefindPromise) {
      // Built by `npx pagefind --site .` at deploy time; absent on a local
      // preview, which is why the failure is handled rather than thrown.
      pagefindPromise = import('/pagefind/pagefind.js').catch(function () {
        return null;
      });
    }
    return pagefindPromise;
  }

  /* -- URL state ---------------------------------------------------------- */

  function getState() {
    var params = new URLSearchParams(location.search);
    return {
      q: params.get('q') || '',
      sections: params.getAll('section'),
      sort: params.get('sort') === 'title' ? 'title' : 'relevance'
    };
  }

  function setUrl(state, replace) {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    state.sections.forEach(function (s) { params.append('section', s); });
    if (state.sort !== 'relevance') params.set('sort', state.sort);
    var qs = params.toString();
    var next = location.pathname + (qs ? '?' + qs : '');
    if (next === location.pathname + location.search) return;
    // Typing replaces, so one search does not leave thirty history entries
    // behind it; submitting, filtering or sorting pushes, because those are the
    // steps someone would expect the back button to walk through.
    history[replace ? 'replaceState' : 'pushState'](state, '', next);
  }

  function checkedSections() {
    var out = [];
    if (!filtersList) return out;
    Array.prototype.forEach.call(
      filtersList.querySelectorAll('input[name="section"]:checked'),
      function (cb) { out.push(cb.value); }
    );
    return out;
  }

  function stateFromControls() {
    return {
      q: input.value.trim(),
      sections: checkedSections(),
      sort: sortSelect ? sortSelect.value : 'relevance'
    };
  }

  /* -- Facets ------------------------------------------------------------- */

  function buildFilters(filters) {
    if (!filtersList) return;
    var names = Object.keys((filters && filters.section) || {});
    if (!names.length) return;

    names.sort(function (a, b) {
      var ai = SECTION_ORDER.indexOf(a), bi = SECTION_ORDER.indexOf(b);
      if (ai === -1 && bi === -1) return a.localeCompare(b);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });

    names.forEach(function (name) {
      var li = document.createElement('li');
      li.className = 'search-filters__item';

      var label = document.createElement('label');

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'section';
      cb.value = name;

      var text = document.createElement('span');
      text.className = 'search-filters__label';
      text.textContent = name;

      var count = document.createElement('span');
      count.className = 'search-filters__count';
      count.setAttribute('data-section', name);

      label.appendChild(cb);
      label.appendChild(text);
      label.appendChild(count);
      li.appendChild(label);
      filtersList.appendChild(li);
    });

    if (filtersEl) filtersEl.hidden = false;
  }

  // Counts are what the current query would return per section, not the size of
  // the section — a facet that always reads (112) tells nobody anything.
  function updateCounts(counts) {
    if (!filtersList) return;
    counts = counts || {};
    Array.prototype.forEach.call(
      filtersList.querySelectorAll('.search-filters__count'),
      function (el) {
        var n = counts[el.getAttribute('data-section')] || 0;
        el.textContent = n ? String(n) : '';
        var item = el.closest('.search-filters__item');
        if (item) item.classList.toggle('is-empty', n === 0);
      }
    );
  }

  function syncControls(state) {
    // Don't fight the visitor's cursor while they are typing in the field.
    if (document.activeElement !== input) input.value = state.q;
    if (sortSelect) sortSelect.value = state.sort;
    if (filtersList) {
      Array.prototype.forEach.call(
        filtersList.querySelectorAll('input[name="section"]'),
        function (cb) { cb.checked = state.sections.indexOf(cb.value) !== -1; }
      );
    }
    if (clearBtn) clearBtn.hidden = state.sections.length === 0;
  }

  /* -- Rendering ---------------------------------------------------------- */

  function sortResults(results, sort) {
    if (sort !== 'title') return results;   // 'relevance' is Pagefind's own order
    return results.slice().sort(function (a, b) {
      return String((a.meta || {}).title || a.url)
        .localeCompare(String((b.meta || {}).title || b.url), undefined, { sensitivity: 'base' });
    });
  }

  function render(results) {
    resultsEl.innerHTML = '';
    results.forEach(function (r) {
      var a = document.createElement('a');
      a.className = 'search-result';
      a.href = r.url;

      // Section first, as a badge — it tells you what kind of page this is
      // before you read the title, which is what you scan a result list for.
      var section = r.filters && r.filters.section && r.filters.section[0];
      if (section) {
        var tag = document.createElement('span');
        tag.className = 'badge search-result__section';
        tag.textContent = section;
        a.appendChild(tag);
      }

      var title = document.createElement('h2');
      title.className = 'search-result__title';
      title.textContent = (r.meta && r.meta.title) || r.url;
      a.appendChild(title);

      var url = document.createElement('span');
      url.className = 'search-result__url';
      url.textContent = r.url;
      a.appendChild(url);

      if (r.excerpt) {
        var excerpt = document.createElement('p');
        excerpt.className = 'search-result__excerpt';
        // Pagefind builds this excerpt from our own indexed pages and adds
        // its own <mark> highlights — not third-party or user-supplied markup.
        excerpt.innerHTML = r.excerpt;
        a.appendChild(excerpt);
      }

      resultsEl.appendChild(a);
    });
  }

  /* -- The search itself -------------------------------------------------- */

  var run = 0;   // results arrive out of order while typing; only the last wins

  // The panel under the results does double duty: topic shortcuts before anyone
  // has typed, and the same shortcuts with a different heading when a query
  // returns nothing. Either way the page is never a heading above white space.
  function showPanel(kind) {
    if (!emptyEl) return;
    if (!kind) { emptyEl.hidden = true; return; }
    if (emptyTitle) emptyTitle.textContent = kind === 'none' ? T.noneTitle : T.emptyTitle;
    if (emptyText) emptyText.textContent = kind === 'none' ? T.noneText : T.emptyText;
    emptyEl.hidden = false;
  }

  // Sorting nothing is a control that looks broken.
  function showSort(on) {
    if (sortLabel) sortLabel.hidden = !on;
  }

  function search(state) {
    syncControls(state);

    if (!state.q) {
      headingEl.textContent = T.heading;
      statusEl.textContent = T.prompt;
      resultsEl.innerHTML = '';
      document.title = T.title;
      updateCounts({});
      showSort(false);
      showPanel('idle');
      return;
    }

    headingEl.textContent = T.resultsFor.replace('%s', state.q);
    document.title = T.resultsFor.replace('%s', state.q) + T.titleSuffix;
    if (!resultsEl.childNodes.length) statusEl.textContent = T.searching;

    var mine = ++run;

    ensurePagefind().then(function (pagefind) {
      if (mine !== run) return;
      if (!pagefind) {
        statusEl.textContent = T.unavailable;
        showSort(false);
        showPanel('idle');
        return;
      }
      return pagefind
        .search(state.q, { filters: { section: state.sections } })
        .then(function (result) {
          if (mine !== run) return null;
          updateCounts(result.totalFilters && result.totalFilters.section);
          return Promise.all(result.results.slice(0, 50).map(function (r) {
            return r.data();
          }));
        })
        .then(function (results) {
          if (mine !== run || !results) return;
          statusEl.textContent = results.length
            ? (results.length === 1 ? T.one : T.many.replace('%d', results.length))
            : T.none.replace('%s', state.q);
          showSort(results.length > 1);
          showPanel(results.length ? null : 'none');
          render(sortResults(results, state.sort));
        });
    });
  }

  /* -- Wiring ------------------------------------------------------------- */

  function go(state, replace) {
    setUrl(state, replace);
    search(state);
  }

  var typing = null;
  input.addEventListener('input', function () {
    clearTimeout(typing);
    typing = setTimeout(function () { go(stateFromControls(), true); }, 180);
  });

  // The form works as a plain GET without this script; with it, submitting
  // should not throw the page away and reload the index to say the same thing.
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearTimeout(typing);
    go(stateFromControls(), false);
  });

  if (filtersList) {
    filtersList.addEventListener('change', function () { go(stateFromControls(), false); });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      var state = stateFromControls();
      state.sections = [];
      go(state, false);
    });
  }
  if (sortSelect) {
    sortSelect.addEventListener('change', function () { go(stateFromControls(), false); });
  }

  window.addEventListener('popstate', function () { search(getState()); });

  // Build the facet list from the index before the first search, so a query
  // arriving in the URL is filtered against checkboxes that already exist.
  var initial = getState();
  ensurePagefind()
    .then(function (pagefind) { return pagefind && pagefind.filters(); })
    .then(buildFilters, function () { /* no index: the status line says so, politely */ })
    .then(function () { search(initial); });
})();
