/* ============================================================
   Nexora AI Forge — browser checks (no npm dependencies)
   Run: node tests/browser-check.mjs

   Serves the real site locally, wires the REAL enquiry function
   into the endpoint (with Resend/Supabase mocked at the network
   layer so nothing leaves this machine), then drives headless
   Chrome to verify:
     - zero horizontal overflow at phone/tablet/desktop widths
     - SEO basics (title, h1, description, JSON-LD)
     - mobile navigation
     - form validation, preserved input, disabled submit
     - genuine success message (only after a real 200)
     - genuine error message + WhatsApp fallback link
   ============================================================ */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const PORT = 8791;
const DEBUG_PORT = 9333;
const CHROME =
  process.env.CHROME_PATH ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml"
};

/* ---------------- local server with the real function ---------------- */

process.env.RESEND_API_KEY = "test-key-not-real";
process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-not-real";
process.env.ENQUIRY_RATE_LIMIT = "200";

/* Load the CommonJS function without any build step. */
const enquirySource = await fs.promises.readFile(
  path.join(ROOT, "netlify/functions/enquiry.js"),
  "utf8"
);
const enquiryExports = {};
new Function("module", "exports", enquirySource + "\n;return exports;")(
  { exports: enquiryExports },
  enquiryExports
);
const handler = enquiryExports.handler;
if (typeof handler !== "function") throw new Error("Could not load enquiry handler");
async function runEnquiry(body, headers) {
  return handler({
    httpMethod: "POST",
    body,
    headers: Object.assign({ "x-forwarded-for": "127.0.0.1" }, headers || {})
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === "/.netlify/functions/enquiry" && req.method === "POST") {
    let raw = "";
    for await (const chunk of req) raw += chunk;

    let message = "";
    try {
      message = JSON.parse(raw).message || "";
    } catch {
      /* handled by the function */
    }

    /* Test hooks: delay / force failure by message content. */
    if (message.includes("SIMULATE_DELAY")) await sleep(700);

    const shouldFail = message.includes("SIMULATE_FAILURE");
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: !shouldFail,
      status: shouldFail ? 500 : 200,
      text: async () => (shouldFail ? "provider unavailable" : "")
    });

    try {
      const result = await runEnquiry(raw, req.headers);
      res.writeHead(result.statusCode, result.headers);
      res.end(result.body);
    } finally {
      globalThis.fetch = realFetch;
    }
    return;
  }

  /* static files */
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === "/") filePath = path.join(ROOT, "index.html");
  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    const notFound = path.join(ROOT, "404.html");
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : "Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
  res.end(fs.readFileSync(filePath));
});

/* ---------------- Chrome / CDP ---------------- */

let chrome;
let ws;
let msgId = 0;
const pending = new Map();
const eventWaiters = new Map();
const results = [];

function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "  PASS" : "  FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }
    }, 20000);
  });
}

function waitEvent(name, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeout);
    const list = eventWaiters.get(name) || [];
    list.push(() => {
      clearTimeout(timer);
      resolve();
    });
    eventWaiters.set(name, list);
  });
}

async function evaluate(expression) {
  const out = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (out.exceptionDetails) {
    throw new Error(out.exceptionDetails.exception?.description || "evaluation failed");
  }
  return out.result.value;
}

async function navigate(url) {
  const loaded = waitEvent("Page.loadEventFired");
  /* Unique query param forces a full document load (put it before any #fragment). */
  const cb = "_cb=" + Date.now();
  const target = url.includes("#")
    ? url.replace("#", "?" + cb + "#")
    : url + (url.includes("?") ? "&" : "?") + cb;
  await send("Page.navigate", { url: target });
  await loaded;
  await sleep(150);
}

async function waitForStatus(contains, timeout = 12000) {
  return evaluate(`new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const el = document.querySelector('#formStatus');
      const txt = el ? el.textContent.trim() : '';
      if (${JSON.stringify(contains)}.length === 0 ? txt.length > 0 : txt.includes(${JSON.stringify(contains)})) {
        clearInterval(iv); resolve(txt);
      } else if (Date.now() - t0 > ${timeout}) {
        clearInterval(iv); reject(new Error('status timeout, last: "' + txt + '"'));
      }
    }, 60);
  })`);
}

async function fillForm(values) {
  const payload = JSON.stringify(values);
  await evaluate(`(() => {
    const data = ${payload};
    const set = (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return;
      el.value = val;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('#cfName', data.name || '');
    set('#cfEmail', data.email || '');
    set('#cfPhone', data.phone || '');
    set('#cfCompany', data.company || '');
    set('#cfService', data.service || '');
    set('#cfBudget', data.budget || '');
    set('#cfMessage', data.message || '');
    // pretend the page has been open long enough for the time trap
    const st = document.querySelector('#cfStartedAt');
    if (st) st.value = String(Date.now() - 15000);
    return true;
  })()`);
}

const VALID = {
  name: "Priya Sharma",
  email: "priya@example.in",
  phone: "+91 98765 43210",
  company: "Sharma Retail",
  service: "AI Automation",
  budget: "₹10,000 – ₹25,000",
  message: "We copy orders from email into a spreadsheet twice every day."
};

/* ---------------- checks ---------------- */

async function checkOverflow(width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 500
  });
  await navigate(`http://localhost:${PORT}/`);

  const report = await evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    const scrollable = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    const offenders = [];
    const interactive = document.querySelectorAll('a, button, input, select, textarea, h1, h2, .price-card, .service-card, .trustbar__inner span');
    interactive.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 2 || r.left < -2)) {
        offenders.push(
          el.tagName + '#' + (el.id || '') + '.' + String(el.className || '').split(' ')[0] +
          ' [' + Math.round(r.left) + '..' + Math.round(r.right) + '] ' +
          el.outerHTML.slice(0, 110)
        );
      }
    });
    return { vw, scrollable, offenders: offenders.slice(0, 6) };
  })()`);

  const noScroll = report.scrollable <= report.vw + 1;
  const noClippedInteractive = report.offenders.length === 0;
  record(
    `no horizontal overflow @${width}px`,
    noScroll && noClippedInteractive,
    noScroll && noClippedInteractive
      ? `scrollWidth ${report.scrollable} <= ${report.vw}`
      : `scrollWidth=${report.scrollable} vw=${report.vw} offenders=${JSON.stringify(report.offenders)}`
  );
}

async function checkSeo() {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });
  await navigate(`http://localhost:${PORT}/`);

  const seo = await evaluate(`(() => {
    const ld = document.querySelector('script[type="application/ld+json"]');
    let ldOk = false;
    try { const data = JSON.parse(ld.textContent); ldOk = data['@type'] === 'ProfessionalService' && data.name === 'Nexora AI Forge'; } catch (e) {}
    return {
      title: document.title,
      h1: document.querySelectorAll('h1').length,
      h2: document.querySelectorAll('h2').length,
      desc: (document.querySelector('meta[name="description"]') || {}).content || '',
      og: (document.querySelector('meta[property="og:title"]') || {}).content || '',
      ldOk,
      text: document.body.innerText
    };
  })()`);

  record("title contains brand", seo.title.includes("Nexora AI Forge"), seo.title.slice(0, 70));
  record("exactly one h1", seo.h1 === 1, `h1=${seo.h1}, h2=${seo.h2}`);
  record("meta description present", seo.desc.length > 60 && seo.desc.length < 320, `${seo.desc.length} chars`);
  record("Open Graph title present", seo.og.includes("Nexora"), seo.og.slice(0, 60));
  record("JSON-LD structured data valid", seo.ldOk);

  const banned = ["Northwind", "Coral & Co", "Trusted by teams", "140+", "4.9", "$1,490", "$3,900", "500+ clients"];
  const found = banned.filter((b) => seo.text.includes(b));
  record("no fabricated stats/clients/case studies", found.length === 0, found.length ? `found: ${found.join(", ")}` : "clean");
  record("INR pricing shown", seo.text.includes("₹4,999") && seo.text.includes("₹29,999"));
  record("no USD pricing", !/\$\d[\d,]{2,}/.test(seo.text));

  const wa = await evaluate(`(() => {
    const links = [...document.querySelectorAll('a[data-whatsapp-link]')];
    return { count: links.length, valid: links.every(a => a.href.startsWith('https://wa.me/919667999028')) };
  })()`);
  record("WhatsApp links configured from config.js", wa.count >= 3 && wa.valid, `${wa.count} links`);

  const legal = await evaluate(`(() => ({
    privacy: !!document.querySelector('a[href="privacy.html"]'),
    terms: !!document.querySelector('a[href="terms.html"]'),
    noSocials: document.querySelector('#socials').hidden
  }))()`);
  record("footer legal links present", legal.privacy && legal.terms);
  record("no fake social links rendered", legal.noSocials);
}

async function checkMobileNav() {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 740,
    deviceScaleFactor: 1,
    mobile: true
  });
  await navigate(`http://localhost:${PORT}/`);

  await evaluate(`document.querySelector('#navToggle').click()`);
  await sleep(350);
  const opened = await evaluate(`document.querySelector('#navMenu').classList.contains('open') && document.querySelector('#navToggle').getAttribute('aria-expanded') === 'true'`);
  record("mobile menu opens", opened);

  const tapTargets = await evaluate(`(() => {
    const els = [...document.querySelectorAll('.btn, .nav__toggle, .radio')].filter(e => {
      const cs = getComputedStyle(e);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && e.getClientRects().length > 0;
    });
    const small = els.filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 40; });
    return { total: els.length, small: small.length };
  })()`);
  record("mobile tap targets >= 40px tall", tapTargets.small === 0, `${tapTargets.total} buttons, ${tapTargets.small} too small`);

  await evaluate(`document.querySelector('#navLinks a').click()`);
  await sleep(350);
  const closed = await evaluate(`!document.querySelector('#navMenu').classList.contains('open')`);
  record("mobile menu closes after link tap", closed);
}

async function checkFormValidation() {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true
  });
  await navigate(`http://localhost:${PORT}/#contact`);
  await sleep(200);

  await fillForm({ name: "", email: "bad", phone: "", service: "", message: "" });
  await evaluate(`document.querySelector('#cfSubmit').click()`);
  const status = await waitForStatus("Please fix");
  const state = await evaluate(`(() => ({
    nameErr: document.querySelector('#cfNameError').textContent.trim(),
    emailErr: document.querySelector('#cfEmailError').textContent.trim(),
    phoneErr: document.querySelector('#cfPhoneError').textContent.trim(),
    focused: document.activeElement ? document.activeElement.id : '',
    invalidMarked: document.querySelectorAll('[aria-invalid="true"]').length
  }))()`);

  record("validation error shown", status.includes("Please fix"));
  record("field-level messages shown", Boolean(state.nameErr && state.emailErr && state.phoneErr),
    `${state.nameErr} | ${state.emailErr} | ${state.phoneErr}`);
  record("focus moved to first invalid field", state.focused === "cfName", state.focused);
  record("aria-invalid set on fields", state.invalidMarked >= 3, `${state.invalidMarked} fields`);
}

async function checkFormSuccess() {
  await navigate(`http://localhost:${PORT}/#contact`);
  await fillForm(Object.assign({}, VALID, { message: VALID.message + " SIMULATE_DELAY" }));
  await evaluate(`document.querySelector('#cfSubmit').click()`);

  const disabledDuring = await evaluate(`document.querySelector('#cfSubmit').disabled`);
  const status = await waitForStatus("has been received");

  const after = await evaluate(`(() => ({
    disabled: document.querySelector('#cfSubmit').disabled,
    nameAfter: document.querySelector('#cfName').value,
    success: document.querySelector('#formStatus').className.includes('is-success')
  }))()`);

  record("submit disabled while sending", disabledDuring === true);
  record("real success message after 200", status.includes("Your enquiry has been received"), status.slice(0, 70));
  record("button re-enabled after send", after.disabled === false);
  record("form reset only on success", after.nameAfter === "", `"${after.nameAfter}"`);
}

async function checkFormError() {
  await navigate(`http://localhost:${PORT}/#contact`);
  await fillForm(Object.assign({}, VALID, { message: "Please fail this one: SIMULATE_FAILURE" }));
  await evaluate(`document.querySelector('#cfSubmit').click()`);

  const status = await waitForStatus("Something went wrong");
  const state = await evaluate(`(() => ({
    nameKept: document.querySelector('#cfName').value,
    msgKept: document.querySelector('#cfMessage').value,
    waLink: !!document.querySelector('#formStatus a[href^="https://wa.me/"]'),
    isError: document.querySelector('#formStatus').className.includes('is-error'),
    btnEnabled: !document.querySelector('#cfSubmit').disabled
  }))()`);

  record("friendly error message (no raw codes)", status.includes("Something went wrong") && !/5\d\d/.test(status));
  record("error offers WhatsApp fallback", state.waLink);
  record("user input preserved on error", state.nameKept === VALID.name && state.msgKept.includes("SIMULATE_FAILURE"));
  record("error styling applied", state.isError);
  record("button re-enabled after error", state.btnEnabled);
}

async function checkSecondaryPages() {
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1280,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false
  });

  for (const page of ["privacy.html", "terms.html", "404.html"]) {
    await navigate(`http://localhost:${PORT}/${page}`);
    const info = await evaluate(`(() => ({
      h1: document.querySelectorAll('h1').length,
      title: document.title,
      overflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
    }))()`);
    record(`${page} renders with one h1`, info.h1 === 1 && info.overflow, info.title.slice(0, 60));
  }

  await navigate(`http://localhost:${PORT}/does-not-exist`);
  const status404 = await evaluate(`document.body.innerText.includes('Page not found')`);
  record("unknown URL serves branded 404", status404);
}

/* ---------------- orchestration ---------------- */

async function waitForDevTools() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await sleep(250);
  }
  throw new Error("Chrome DevTools did not start");
}

async function main() {
  await new Promise((r) => server.listen(PORT, r));

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-chrome-"));
  chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${userDataDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=1440,900",
      "about:blank"
    ],
    { stdio: "ignore", shell: false }
  );

  await waitForDevTools();

  const target = await (
    await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent("about:blank")}`, {
      method: "PUT"
    })
  ).json();

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });

  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
      return;
    }
    if (!msg.id && eventWaiters.has(msg.method)) {
      const waiters = eventWaiters.get(msg.method);
      eventWaiters.delete(msg.method);
      waiters.forEach((fn) => fn());
    }
  });

  await send("Page.enable");
  await send("Runtime.enable");

  console.log("\n— layout / overflow —");
  for (const [w, h] of [
    [360, 740],
    [390, 844],
    [414, 896],
    [600, 900],
    [768, 1024],
    [1024, 768],
    [1440, 900]
  ]) {
    await checkOverflow(w, h);
  }

  console.log("\n— SEO / content —");
  await checkSeo();

  console.log("\n— mobile navigation —");
  await checkMobileNav();

  console.log("\n— form: validation —");
  await checkFormValidation();

  console.log("\n— form: success path —");
  await checkFormSuccess();

  console.log("\n— form: error path —");
  await checkFormError();

  console.log("\n— secondary pages —");
  await checkSecondaryPages();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log("Failed:");
    failed.forEach((f) => console.log("  ✗ " + f.name + (f.detail ? " — " + f.detail : "")));
  }
  return failed.length;
}

let exitCode = 1;
try {
  exitCode = (await main()) === 0 ? 0 : 1;
} catch (err) {
  console.error("\nBrowser check crashed:", err.message);
  exitCode = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome?.kill();
  server.close();
}
process.exit(exitCode);
