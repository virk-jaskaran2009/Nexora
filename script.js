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

  /* ---------- Animated counters ---------- */
  function formatNumber(value, decimals) {
    var str = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
    var parts = str.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }

  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target)) return;

    var decimals = parseInt(el.getAttribute("data-decimals") || "0", 10) || 0;

    if (prefersReduced) {
      el.textContent = formatNumber(target, decimals);
      return;
    }

    var duration = 1500;
    var start = null;

    function tick(now) {
      if (start === null) start = now;
      var progress = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = formatNumber(target * eased, decimals);
      if (progress < 1) {
        window.requestAnimationFrame(tick);
      } else {
        el.textContent = formatNumber(target, decimals);
      }
    }

    window.requestAnimationFrame(tick);
  }

  var countEls = $$("[data-count]");

  if (hasIO && countEls.length) {
    var countObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animateCount(entry.target);
            countObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    countEls.forEach(function (el) {
      countObserver.observe(el);
    });
  } else {
    countEls.forEach(animateCount);
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

  /* ---------- Contact form ---------- */
  var contactForm = $("#contactForm");

  if (contactForm) {
    var formStatus = $("#formStatus");
    var submitBtn = $("#cfSubmit");
    var attempted = false;

    var rules = [
      {
        id: "cfName",
        errorId: "cfNameError",
        test: function (v) {
          return v.trim().length >= 2;
        },
        msg: "Please tell us your name."
      },
      {
        id: "cfEmail",
        errorId: "cfEmailError",
        test: function (v) {
          return emailRe.test(v.trim());
        },
        msg: "Please enter a valid email address."
      },
      {
        id: "cfService",
        errorId: "cfServiceError",
        test: function (v) {
          return v !== "";
        },
        msg: "Please choose a service."
      },
      {
        id: "cfMessage",
        errorId: "cfMessageError",
        test: function (v) {
          return v.trim().length >= 10;
        },
        msg: "A sentence or two helps us prepare."
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

    contactForm.addEventListener("submit", function (e) {
      e.preventDefault();

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
        if (formStatus) {
          formStatus.textContent = "Please fix the highlighted fields and try again.";
          formStatus.className = "form__status is-error";
        }
        if (firstBad) firstBad.focus();
        return;
      }

      var nameInput = document.getElementById("cfName");
      var firstName = nameInput
        ? nameInput.value.trim().split(/\s+/)[0]
        : "there";

      if (formStatus) {
        formStatus.textContent = "Sending…";
        formStatus.className = "form__status";
      }
      if (submitBtn) {
        submitBtn.classList.add("is-loading");
        submitBtn.disabled = true;
        submitBtn.textContent = "Sending…";
      }

      // No backend in this build — simulate delivery, then confirm the UI.
      window.setTimeout(function () {
        if (formStatus) {
          formStatus.textContent =
            "Thanks, " +
            firstName +
            "! Your message is in — we'll reply within one business day.";
          formStatus.className = "form__status is-success";
        }
        contactForm.reset();
        attempted = false;
        $$(".field--invalid", contactForm).forEach(function (f) {
          f.classList.remove("field--invalid");
        });
        $$(".field__error", contactForm).forEach(function (el) {
          el.textContent = "";
        });
        if (submitBtn) {
          submitBtn.classList.remove("is-loading");
          submitBtn.disabled = false;
          submitBtn.textContent = "Send message";
        }
      }, 950);
    });
  }

  /* ---------- CTA quick form ---------- */
  var ctaForm = $("#ctaForm");
  var ctaMsg = $("#ctaMsg");

  if (ctaForm) {
    ctaForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = ctaForm.querySelector("input");
      var value = input ? input.value.trim() : "";

      if (!emailRe.test(value)) {
        if (ctaMsg) {
          ctaMsg.textContent = "Please enter a valid email address.";
          ctaMsg.className = "cta__msg is-error";
        }
        if (input) input.focus();
        return;
      }

      if (ctaMsg) {
        ctaMsg.textContent =
          "Sent — we'll email " + value + " within one business day to lock in a slot.";
        ctaMsg.className = "cta__msg";
      }
      ctaForm.reset();
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
