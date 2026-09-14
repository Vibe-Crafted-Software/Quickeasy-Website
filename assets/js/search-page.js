/* ============================================
   Dedicated search results page (/search/ and /th/search/).

   Reads ?q= from the URL, queries the Pagefind index that was built at
   deploy time (see deploy.mjs step 3), and renders the results itself.
   Pagefind picks the index matching the <html lang> of THIS page, so the
   Thai page searches the Thai pages and the English page the English ones.

   Loaded only by the search pages — every other page just carries the
   header form, which is a plain GET and needs no JavaScript.
   ============================================ */
(function () {
  var form = document.getElementById('search-form');
  var input = document.getElementById('search-input');
  var headingEl = document.getElementById('search-heading');
  var statusEl = document.getElementById('search-status');
  var resultsEl = document.getElementById('search-results');
  if (!form || !input || !resultsEl) return;

  var T = JSON.parse(document.getElementById('search-strings').textContent);

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

  function queryOf() {
    return new URLSearchParams(location.search).get('q') || '';
  }

  function render(results) {
    resultsEl.innerHTML = '';
    results.forEach(function (r) {
      var a = document.createElement('a');
      a.className = 'search-result';
      a.href = r.url;

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

  function run(q, push) {
    input.value = q;

    if (!q) {
      headingEl.textContent = T.heading;
      statusEl.textContent = T.prompt;
      resultsEl.innerHTML = '';
      document.title = T.title;
      return;
    }

    headingEl.textContent = T.resultsFor.replace('%s', q);
    statusEl.textContent = T.searching;
    document.title = T.resultsFor.replace('%s', q) + T.titleSuffix;

    if (push) {
      history.pushState({ q: q }, '', location.pathname + '?q=' + encodeURIComponent(q));
    }

    ensurePagefind().then(function (pagefind) {
      if (!pagefind) {
        statusEl.textContent = T.unavailable;
        return;
      }
      pagefind.search(q).then(function (search) {
        return Promise.all(
          search.results.slice(0, 50).map(function (r) {
            return r.data();
          })
        ).then(function (results) {
          statusEl.textContent = results.length
            ? (results.length === 1 ? T.one : T.many.replace('%d', results.length))
            : T.none.replace('%s', q);
          render(results);
        });
      });
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    run(input.value.trim(), true);
  });

  window.addEventListener('popstate', function () {
    run(queryOf(), false);
  });

  run(queryOf(), false);
})();
