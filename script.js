/* ============================================
   Nexora — AI Automation Agency
   Site scripts
   ============================================ */

(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasIO = typeof window.IntersectionObserver === "function";
  var emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }

  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ---------- Sticky nav, scroll progress, back-to-top ---------- */
  var nav = $("#nav");
  var progressBar = $("#scrollProgress");
  var toTop = $("#toTop");
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      var y = window.scrollY || window.pageYOffset || 0;

      if (nav) nav.classList.toggle("scrolled", y > 24);

      if (progressBar) {
        var doc = document.documentElement;
        var max = doc.scrollHeight - doc.clientHeight;
        var ratio = max > 0 ? Math.min(y / max, 1) : 0;
        progressBar.style.transform = "scaleX(" + ratio + ")";
      }

      if (toTop) toTop.classList.toggle("show", y > 650);

      ticking = false;
    });
  }

  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);

  if (toTop) {
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: prefersReduced ? "auto" : "smooth" });
      var logo = $(".nav .logo");
      if (logo) logo.focus({ preventScroll: true });
    });
  }

  /* ---------- Mobile menu ---------- */
  var navToggle = $("#navToggle");
  var navMenu = $("#navMenu");
  var navLinks = $("#navLinks");

  function setMenu(open) {
    if (!navMenu || !navToggle) return;
    navMenu.classList.toggle("open", open);
    navToggle.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
    navToggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  }

  function menuIsOpen() {
    return navMenu && navMenu.classList.contains("open");
  }

  if (navToggle) {
    navToggle.addEventListener("click", function () {
      setMenu(!menuIsOpen());
    });
  }

  if (navMenu) {
    navMenu.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) setMenu(false);
    });
  }

  document.addEventListener("click", function (e) {
    if (!menuIsOpen()) return;
    if (e.target && e.target.closest && e.target.closest("#nav")) return;
    setMenu(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && menuIsOpen()) {
      setMenu(false);
      if (navToggle) navToggle.focus();
    }
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 991 && menuIsOpen()) setMenu(false);
  });

  /* ---------- Scroll spy (active nav link) ---------- */
  var linkById = {};
  $$(".nav__links a").forEach(function (a) {
    var href = a.getAttribute("href") || "";
    if (href.charAt(0) === "#" && href.length > 1) {
      linkById[href.slice(1)] = a;
    }
  });

  if (hasIO && Object.keys(linkById).length) {
    var spyObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          Object.keys(linkById).forEach(function (id) {
            linkById[id].classList.remove("active");
          });
          var active = linkById[entry.target.id];
          if (active) active.classList.add("active");
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );

    $$("main section[id]").forEach(function (section) {
      spyObserver.observe(section);
    });
  }

  /* ---------- Scroll reveal ---------- */
  var revealEls = $$(".reveal");

  if (hasIO && revealEls.length) {
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var siblings = el.parentNode
            ? $$(".reveal", el.parentNode)
            : [];
          var idx = Math.max(siblings.indexOf(el), 0);
          var delay = Math.min(idx * 90, 450);
          window.setTimeout(function () {
            el.classList.add("visible");
          }, delay);
          revealObserver.unobserve(el);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealEls.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealEls.forEach(function (el) {
      el.classList.add("visible");
    });
  }

  /* ---------- Typing effect in hero card ---------- */
  var typedEl = $("#typedText");
  var caret = $(".glass-card .caret");

  var lines = [
    "$ nexora run --flow lead-intake\n",
    "→ WhatsApp message received\n",
    "→ Qualifying… budget: mid, timeline: 30d\n",
    "✓ Added to CRM · reply sent in 0.8s\n"
  ];

  function typeLine(text) {
    return new Promise(function (resolve) {
      var i = 0;
      (function step() {
        if (i < text.length) {
          typedEl.textContent += text.charAt(i);
          i += 1;
          window.setTimeout(step, text.charAt(i - 1) === "\n" ? 300 : 22);
        } else {
          resolve();
        }
      })();
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  async function runTyping() {
    /* jshint ignore:start */
    while (true) {
      typedEl.textContent = "";
      for (var i = 0; i < lines.length; i++) {
        await typeLine(lines[i]);
        await wait(260);
      }
      await wait(2600);
    }
    /* jshint ignore:end */
  }

  if (typedEl) {
    if (prefersReduced) {
      typedEl.textContent = lines.join("");
      if (caret) caret.style.display = "none";
    } else if (document.readyState !== "loading") {
      runTyping();
    } else {
      document.addEventListener("DOMContentLoaded", runTyping);
    }
  }

  /* ---------- FAQ accordion ---------- */
  $$(".faq__q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.parentElement;
      if (!item) return;
      var answer = $(".faq__a", item);
      if (!answer) return;
      var isOpen = item.classList.contains("open");

      // close others
      $$(".faq__item.open").forEach(function (openItem) {
        if (openItem === item) return;
        openItem.classList.remove("open");
        var openAnswer = $(".faq__a", openItem);
        if (openAnswer) openAnswer.style.maxHeight = null;
        var openBtn = $(".faq__q", openItem);
        if (openBtn) openBtn.setAttribute("aria-expanded", "false");
      });

      if (isOpen) {
        item.classList.remove("open");
        answer.style.maxHeight = null;
        btn.setAttribute("aria-expanded", "false");
      } else {
        item.classList.add("open");
        answer.style.maxHeight = answer.scrollHeight + "px";
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  // keep open answers sized correctly on resize/orientation change
  window.addEventListener("resize", function () {
    $$(".faq__item.open .faq__a").forEach(function (answer) {
      answer.style.maxHeight = answer.scrollHeight + "px";
    });
  });

  /* ---------- Apply public site configuration (config.js) ---------- */
  var CFG = window.NEXORA || {};
  var CONTACT = CFG.contact || {};

  function waUrl(message) {
    var num = String(CONTACT.whatsappNumber || "").replace(/\D/g, "");
    if (!num) return "#";
    var text = message || CONTACT.whatsappMessage || "Hello Nexora!";
    return "https://wa.me/" + num + "?text=" + encodeURIComponent(text);
  }

  $$("[data-whatsapp-link]").forEach(function (el) {
    el.setAttribute("href", waUrl());
    el.setAttribute("target", "_blank");
    el.setAttribute("rel", "noopener noreferrer");
  });

  $$("[data-config-email]").forEach(function (el) {
    if (CONTACT.email) {
      el.textContent = CONTACT.email;
      el.setAttribute("href", "mailto:" + CONTACT.email);
    }
  });

  $$("[data-config-phone]").forEach(function (el) {
    if (CONTACT.phoneDisplay) {
      el.textContent = CONTACT.phoneDisplay;
      el.setAttribute("href", "tel:" + (CONTACT.phoneDial || CONTACT.phoneDisplay));
    }
  });

  $$("[data-config-location]").forEach(function (el) {
    if (CONTACT.location) el.textContent = CONTACT.location;
  });

  /* Social icons are only rendered when a real profile URL exists in config.js. */
  var socialsBox = $("#socials");
  if (socialsBox && CFG.social) {
    var socialIcons = {
      linkedin:
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3-.02-2.96-1.8-2.96-1.8 0-2.08 1.4-2.08 2.86V21h-4V9z"></path></svg>',
      instagram:
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none"></circle></svg>',
      x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.9 2H22l-7.1 8.1L23.4 22h-6.6l-5.2-6.8L5.6 22H2.5l7.6-8.7L1.9 2h6.8l4.7 6.2L18.9 2zm-1.2 18h1.7L7.1 3.8H5.3L17.7 20z"></path></svg>',
      github:
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2.9-.3 1.9-.4 2.9-.4s2 .1 2.9.4c2.2-1.5 3.2-1.2 3.2-1.2.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.4-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .4.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z"></path></svg>'
    };
    var socialHtml = "";
    Object.keys(socialIcons).forEach(function (key) {
      var url = CFG.social[key];
      if (!url) return;
      socialHtml +=
        '<a href="' +
        url +
        '" target="_blank" rel="noopener noreferrer" aria-label="Nexora AI Forge on ' +
        key +
        '">' +
        socialIcons[key] +
        "</a>";
    });
    if (socialHtml) {
      socialsBox.innerHTML = socialHtml;
      socialsBox.hidden = false;
    }
  }

  /* ---------- Enquiry form ----------
     Real submission: POSTs to the Netlify Function (netlify/functions/enquiry.js),
     which validates, filters spam, stores the lead (if a database is configured)
     and emails the business. All secrets live server-side — never here. */
  var contactForm = $("#contactForm");

  if (contactForm) {
    var formStatus = $("#formStatus");
    var submitBtn = $("#cfSubmit");
    var startedAtInput = $("#cfStartedAt");
    var pageLoadedAt = Date.now();
    var attempted = false;
    var submitting = false;

    var ENQUIRY_CFG = CFG.enquiry || {};
    var ENQUIRY_ENDPOINT = ENQUIRY_CFG.endpoint || "/.netlify/functions/enquiry";
    var MIN_SECONDS = ENQUIRY_CFG.minSeconds || 3;

    if (startedAtInput) startedAtInput.value = String(pageLoadedAt);

    var rules = [
      {
        id: "cfName",
        errorId: "cfNameError",
        test: function (v) { return v.trim().length >= 2; },
        msg: "Please tell us your name."
      },
      {
        id: "cfEmail",
        errorId: "cfEmailError",
        test: function (v) { return emailRe.test(v.trim()); },
        msg: "Please enter a valid email address."
      },
      {
        id: "cfPhone",
        errorId: "cfPhoneError",
        test: function (v) {
          var digits = v.replace(/\D/g, "");
          return /^[+\d\s()\-]{7,18}$/.test(v.trim()) && digits.length >= 7 && digits.length <= 15;
        },
        msg: "Please enter a valid phone or WhatsApp number."
      },
      {
        id: "cfService",
        errorId: "cfServiceError",
        test: function (v) { return v !== ""; },
        msg: "Please choose a service."
      },
      {
        id: "cfMessage",
        errorId: "cfMessageError",
        test: function (v) { return v.trim().length >= 10 && v.trim().length <= 3000; },
        msg: "A sentence or two (at least 10 characters) helps us prepare."
      }
    ];

    function applyRule(rule) {
      var input = document.getElementById(rule.id);
      var errorEl = document.getElementById(rule.errorId);
      if (!input || !errorEl) return true;

      var ok = rule.test(input.value);
      var field = input.closest(".field");

      if (!ok && attempted) {
        errorEl.textContent = rule.msg;
        if (field) field.classList.add("field--invalid");
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", rule.errorId);
      } else if (ok) {
        errorEl.textContent = "";
        if (field) field.classList.remove("field--invalid");
        input.removeAttribute("aria-invalid");
        input.removeAttribute("aria-describedby");
      }

      return ok;
    }

    rules.forEach(function (rule) {
      var input = document.getElementById(rule.id);
      if (!input) return;
      input.addEventListener("blur", function () {
        attempted = true;
        applyRule(rule);
      });
      input.addEventListener("input", function () {
        if (attempted) applyRule(rule);
      });
      input.addEventListener("change", function () {
        if (attempted) applyRule(rule);
      });
    });

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      });
    }

    /* States: "" (idle/sending), "success", "error" (validation),
       "error-link" (submission failure — always offers WhatsApp). */
    function setStatus(message, state) {
      if (!formStatus) return;
      if (state === "error-link") {
        formStatus.className = "form__status is-error";
        formStatus.innerHTML =
          escapeHtml(message) +
          ' <a href="' +
          waUrl("Hi Nexora, the enquiry form failed — I'll send my details here instead.") +
          '" target="_blank" rel="noopener noreferrer">Message us on WhatsApp</a>';
        return;
      }
      formStatus.className = "form__status" + (state ? " is-" + state : "");
      formStatus.textContent = message;
    }

    function setSubmitting(isSubmitting) {
      submitting = isSubmitting;
      if (submitBtn) {
        submitBtn.disabled = isSubmitting;
        submitBtn.classList.toggle("is-loading", isSubmitting);
        submitBtn.textContent = isSubmitting ? "Sending…" : "Send enquiry";
      }
    }

    function collectPayload() {
      var pref = contactForm.querySelector('input[name="contact_pref"]:checked');
      return {
        name: ($("#cfName").value || "").trim(),
        email: ($("#cfEmail").value || "").trim(),
        phone: ($("#cfPhone").value || "").trim(),
        company: ($("#cfCompany") ? $("#cfCompany").value : "").trim(),
        service: $("#cfService").value || "",
        budget: $("#cfBudget") ? $("#cfBudget").value : "",
        message: ($("#cfMessage").value || "").trim(),
        contact_pref: pref ? pref.value : "Email",
        started_at: startedAtInput ? startedAtInput.value : "",
        bot_field: contactForm.bot_field ? contactForm.bot_field.value : "",
        source: "website-contact-form"
      };
    }

    function postJson(payload) {
      var controller = typeof AbortController === "function" ? new AbortController() : null;
      var timer = controller
        ? window.setTimeout(function () { controller.abort(); }, 15000)
        : null;

      return fetch(ENQUIRY_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (data) {
            return { ok: res.ok, status: res.status, data: data || {} };
          });
        })
        .finally(function () {
          if (timer) window.clearTimeout(timer);
        });
    }

    /* Netlify's built-in form capture: zero-config fallback when the serverless
       function has no email provider configured yet. Only used on Netlify hosts. */
    function postNetlifyForms(payload) {
      var body = new URLSearchParams();
      Object.keys(payload).forEach(function (key) {
        body.append(key, payload[key]);
      });
      body.append("form-name", "enquiry");

      return fetch("/", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString()
      }).then(function (res) {
        return { ok: res.ok, status: res.status, via: "netlify-forms" };
      });
    }

    function canFallbackToNetlifyForms() {
      var onNetlify = /(^|\.)netlify\.app$/.test(window.location.hostname);
      return Boolean(ENQUIRY_CFG.netlifyFormsFallback && onNetlify);
    }

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();
      if (submitting) return;

      attempted = true;
      var firstBad = null;
      var valid = true;

      rules.forEach(function (rule) {
        var ok = applyRule(rule);
        if (!ok && valid) {
          valid = false;
          firstBad = document.getElementById(rule.id);
        }
      });

      if (!valid) {
        setStatus("Please fix the highlighted fields and try again.", "error");
        if (firstBad) firstBad.focus();
        return;
      }

      var payload = collectPayload();

      /* Time trap: a real person cannot complete this form in under MIN_SECONDS. */
      var elapsed = (Date.now() - Number(payload.started_at || pageLoadedAt)) / 1000;
      var tooFast = Number(payload.started_at || 0) > 0 && elapsed < MIN_SECONDS;

      if (payload.bot_field || tooFast) {
        /* Pretend success so bots learn nothing — nothing is sent or stored. */
        setStatus("Thanks! Your enquiry has been received. We'll get back to you shortly.", "success");
        return;
      }

      setSubmitting(true);
      setStatus("Sending your enquiry…");

      postJson(payload)
        .then(function (result) {
          if (result.ok) {
            return { success: true };
          }
          if (result.status === 503 && result.data.code === "NOT_CONFIGURED" && canFallbackToNetlifyForms()) {
            return postNetlifyForms(payload).then(function (fb) {
              return { success: fb.ok };
            });
          }
          return {
            success: false,
            message: typeof result.data.error === "string" ? result.data.error : null
          };
        })
        .then(function (outcome) {
          if (outcome.success) {
            setStatus("Thanks! Your enquiry has been received. We'll get back to you shortly.", "success");
            contactForm.reset();
            attempted = false;
            if (startedAtInput) startedAtInput.value = String(pageLoadedAt);
            $$(".field--invalid", contactForm).forEach(function (f) {
              f.classList.remove("field--invalid");
            });
            $$(".field__error", contactForm).forEach(function (el) {
              el.textContent = "";
            });
            if (formStatus) formStatus.scrollIntoView({ block: "nearest", behavior: prefersReduced ? "auto" : "smooth" });
            return;
          }
          console.error("[Nexora] enquiry submission failed:", outcome);
          setStatus(
            outcome.message ||
              "Something went wrong while sending your enquiry. Please try again in a moment.",
            "error-link"
          );
        })
        .catch(function (err) {
          console.error("[Nexora] enquiry network error:", err);
          setStatus(
            "We couldn't reach our server. Please check your connection and try again.",
            "error-link"
          );
        })
        .then(function () {
          setSubmitting(false);
        });
    });
  }

  /* ---------- Pointer spotlight on cards ---------- */
  if (!prefersReduced && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    $$(".spot").forEach(function (el) {
      el.addEventListener(
        "pointermove",
        function (ev) {
          var rect = el.getBoundingClientRect();
          var x = ((ev.clientX - rect.left) / rect.width) * 100;
          var y = ((ev.clientY - rect.top) / rect.height) * 100;
          el.style.setProperty("--mx", x.toFixed(2) + "%");
          el.style.setProperty("--my", y.toFixed(2) + "%");
        },
        { passive: true }
      );
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = $("#year");
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());
})();
