/* QuickEasy Software — site interactions (standard JS, no dependencies) */
(function () {
  "use strict";

  /* ---------- Theme toggle (light / dark) ---------- */
  (function () {
    var btn = document.querySelector(".theme-toggle");
    var root = document.documentElement;
    function resolved() {
      var t = root.getAttribute("data-theme");
      if (t === "dark" || t === "light") return t;
      return window.matchMedia("(prefers-color-scheme:dark)").matches ? "dark" : "light";
    }
    function reflect(t) {
      if (!btn) return;
      btn.setAttribute("aria-pressed", t === "dark" ? "true" : "false");
      btn.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    }
    reflect(resolved());
    if (btn) {
      btn.addEventListener("click", function () {
        var next = resolved() === "dark" ? "light" : "dark";
        root.setAttribute("data-theme", next);
        try { localStorage.setItem("theme", next); } catch (e) {}
        reflect(next);
      });
    }
  })();

  /* ---------- Mobile nav ---------- */
  var toggle = document.querySelector(".nav-toggle");
  if (toggle) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  // On mobile, tapping a parent item opens its submenu instead of navigating
  document.querySelectorAll(".nav .has-menu > a").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (window.matchMedia("(max-width:1040px)").matches) {
        e.preventDefault();
        a.parentElement.classList.toggle("open");
      }
    });
  });
  // Close menu when a real link is tapped
  document.querySelectorAll(".nav a").forEach(function (a) {
    a.addEventListener("click", function () {
      if (!a.parentElement.classList.contains("has-menu")) {
        document.body.classList.remove("nav-open");
      }
    });
  });

  /* ---------- Contact form (per contact-form-integration skill) ---------- */
  var RELAY_URL = "https://e2b3gbknj0.execute-api.eu-west-1.amazonaws.com/contact";
  var SITE_NAME = "quickeasysoftware.com";

  // Live/test switch: the live domain gets its own mail, everywhere else
  // (staging, localhost, preview hosts) keeps going to the dev inbox.
  function recipientFor() {
    var h = location.hostname;
    if (h === "quickeasysoftware.com" || h === "www.quickeasysoftware.com") return "info@quickeasysoftware.com";
    return "info@vibecraftedsoftware.com";
  }

  document.querySelectorAll("form.contact-form").forEach(function (form) {
    var statusEl = form.querySelector(".form-status");
    var submitBtn = form.querySelector('button[type="submit"]');
    var defaultLabel = submitBtn ? submitBtn.textContent : "Send";

    function setStatus(msg, type) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.className = "form-status is-" + type;
    }

    // A form this handler refuses was never sent, so nothing else listening for
    // submit may act on it either — in particular the Multi-mailer opt-in
    // (mail-widget.js), which would otherwise subscribe a ticked address from a
    // form that failed our checks — and the enquiry copy (forms-widget.js), which
    // would keep a portal record of an enquiry that was never sent. This handler
    // registers first (main.js runs before both widgets), so
    // stopImmediatePropagation reaches them.
    function refuse(e) { e.stopImmediatePropagation(); }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      // Honeypot — real users never fill this.
      if (form.elements["hp_field"] && form.elements["hp_field"].value) return refuse(e);

      var el = function (n) { return form.elements[n] ? form.elements[n].value.trim() : ""; };
      var name = el("name"), email = el("email"), phone = el("phone"), message = el("message");

      if (!name || !email || !message) {
        setStatus("Please fill in your name, email, and message.", "error");
        return refuse(e);
      }

      var body = message + (phone ? "\n\nPhone: " + phone : "");
      var payload = {
        site: SITE_NAME,
        recipient: recipientFor(),
        name: name,
        email: email,
        message: body,
        turnstileToken: window.turnstile ? window.turnstile.getResponse() : ""
      };

      if (!RELAY_URL) {
        setStatus("This form isn't connected yet. Please email info@quickeasysoftware.com.", "error");
        return refuse(e);
      }

      if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Sending…"; }
      setStatus("", "");

      fetch(RELAY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) { if (!r.ok) throw new Error("failed"); return r.json().catch(function(){return {};}); })
        .then(function () {
          setStatus("Thanks — your message is on its way.", "success");
          form.reset();
          if (window.turnstile) window.turnstile.reset();
        })
        .catch(function () {
          setStatus("Something went wrong. Please try again, or email info@quickeasysoftware.com.", "error");
        })
        .finally(function () {
          if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = defaultLabel; }
        });
    });
  });

  /* ---------- Pricing currency toggle ---------- */
  // ZAR is the base. Every published price carries a data-usd override, so the
  // USD rate below is only a fallback for any price without one.
  var CUR = {
    ZAR: { rate: 1,     symbol: "R" },
    USD: { rate: 0.056, symbol: "$" }
  };

  function formatPrice(n) {
    // Thousands separators, no decimals (already rounded).
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  function renderPrices(cur) {
    var c = CUR[cur] || CUR.ZAR;
    document.querySelectorAll(".price").forEach(function (el) {
      var zar = parseFloat(el.getAttribute("data-zar"));
      if (isNaN(zar)) return;
      // A per-currency override (e.g. data-usd="76") shows the fixed published
      // price instead of a computed rate*zar conversion.
      var override = el.getAttribute("data-" + cur.toLowerCase());
      var amount = override !== null ? parseFloat(override) : Math.round(zar * c.rate);
      el.textContent = c.symbol + formatPrice(amount);
    });
    document.querySelectorAll(".currency-toggle__btn").forEach(function (b) {
      var on = b.getAttribute("data-cur") === cur;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  var curToggle = document.querySelector(".currency-toggle");
  if (curToggle) {
    curToggle.addEventListener("click", function (e) {
      var btn = e.target.closest(".currency-toggle__btn");
      if (btn) renderPrices(btn.getAttribute("data-cur"));
    });
    renderPrices("ZAR");
  }
})();

/* ============================================
   Site search shortcut. The header affordance is a plain link to /search/, so
   search works with JavaScript off; this only adds the "/" hotkey, which jumps
   to the field when already on the search page and follows the link otherwise.
   Ignored when focus is already in a field, so "/" can still be typed.
   ============================================ */
(function () {
  var link = document.querySelector("a.site-search");
  if (!link) return;

  document.addEventListener("keydown", function (event) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    var active = document.activeElement;
    var tag = active && active.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (active && active.isContentEditable)) return;
    event.preventDefault();
    var field = document.getElementById("search-input");
    if (field) field.focus();
    else window.location.href = link.getAttribute("href");
  });
})();

/* ============================================
   Mailing-list opt-in starts ticked. mail-widget.js adds the box itself, after
   this script has run, so watch each opt-in form and tick the box once it
   appears. Visitors untick it to stay off the list; double opt-in still applies.
   Pre-ticking is a business decision taken against POPIA s69 advice — see
   CLAUDE.md, "Mailing list".
   ============================================ */
(function () {
  if (!window.MutationObserver) return;
  document.querySelectorAll("form[data-mail-optin]").forEach(function (form) {
    function tick() {
      var box = form.querySelector('input[name="vcm_optin"]');
      if (!box) return false;
      box.checked = true;
      return true;
    }
    if (tick()) return;
    var observer = new MutationObserver(function () { if (tick()) observer.disconnect(); });
    observer.observe(form, { childList: true, subtree: true });
  });
})();
