/* ============================================================
   Nexora AI Forge — enquiry function tests
   Run: node --test
   ============================================================ */

"use strict";

const test = require("node:test");
const assert = require("node:assert");

const ENV_KEYS = [
  "RESEND_API_KEY",
  "ENQUIRY_TO_EMAIL",
  "ENQUIRY_FROM_EMAIL",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ENQUIRY_TABLE",
  "ENQUIRY_RATE_LIMIT",
  "ENQUIRY_MIN_SECONDS"
];

let handler;
let originalFetch;
let originalEnv;

function loadHandler() {
  delete require.cache[require.resolve("../netlify/functions/enquiry.js")];
  return require("../netlify/functions/enquiry.js").handler;
}

function makeEvent(payload, opts) {
  const options = opts || {};
  return {
    httpMethod: options.method || "POST",
    body: options.raw !== undefined ? options.raw : JSON.stringify(payload),
    isBase64Encoded: false,
    headers: {
      "x-forwarded-for": options.ip || "203.0.113.10",
      "content-type": "application/json"
    }
  };
}

function validPayload(overrides) {
  return Object.assign(
    {
      name: "Priya Sharma",
      email: "priya@example.in",
      phone: "+91 98765 43210",
      company: "Sharma Retail",
      service: "WhatsApp Automation",
      budget: "₹10,000 – ₹25,000",
      message: "We copy orders from WhatsApp into a spreadsheet twice a day.",
      contact_pref: "WhatsApp",
      started_at: "1",
      bot_field: "",
      source: "website-contact-form"
    },
    overrides || {}
  );
}

/* Successful Resend/Supabase call captured for assertions */
function okResponse() {
  return { ok: true, status: 200, text: async () => "" };
}

test.beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
  originalFetch = globalThis.fetch;
  handler = loadHandler();
});

test.afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

/* ---------- request handling ---------- */

test("rejects non-POST methods", async () => {
  const res = await handler(makeEvent({}, { method: "GET" }));
  assert.strictEqual(res.statusCode, 405);
  assert.strictEqual(JSON.parse(res.body).ok, false);
});

test("rejects malformed JSON", async () => {
  const res = await handler(makeEvent(null, { raw: "{not json" }));
  assert.strictEqual(res.statusCode, 400);
});

/* ---------- spam protection ---------- */

test("honeypot submissions are dropped silently with no storage or email", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return okResponse();
  };

  const res = await handler(makeEvent(validPayload({ bot_field: "http://spam" })));
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(JSON.parse(res.body).ok, true);
  assert.strictEqual(called, false, "no external call should be made for bots");
});

test("submissions faster than the time trap are dropped silently", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return okResponse();
  };

  const payload = validPayload({ started_at: String(Date.now()) });
  const res = await handler(makeEvent(payload));
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(called, false);
});

test("rate limits repeated submissions from the same IP", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";
  process.env.ENQUIRY_RATE_LIMIT = "3";
  handler = loadHandler();

  globalThis.fetch = async () => okResponse();

  const ip = "198.51.100.7";
  let last;
  for (let i = 0; i < 4; i++) {
    last = await handler(makeEvent(validPayload({ started_at: "1" }), { ip }));
  }
  assert.strictEqual(last.statusCode, 429);
  assert.match(JSON.parse(last.body).error, /few minutes/i);
});

/* ---------- validation ---------- */

test("rejects invalid input with field-level errors", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";

  const res = await handler(
    makeEvent(
      validPayload({
        name: "",
        email: "not-an-email",
        phone: "abc",
        service: "Dropshipping Empire",
        message: "short",
        started_at: "1"
      }),
      { ip: "203.0.113.20" }
    )
  );

  assert.strictEqual(res.statusCode, 422);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.code, "VALIDATION");
  assert.deepStrictEqual(Object.keys(body.fields).sort(), [
    "email",
    "message",
    "name",
    "phone",
    "service"
  ]);
});

test("accepts a valid enquiry (already configured channels mock)", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";

  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push({ url: String(url), opts });
    return okResponse();
  };

  const res = await handler(makeEvent(validPayload({ started_at: "1" }), { ip: "203.0.113.30" }));

  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.emailed, true);
  assert.strictEqual(body.stored, true);

  const resendCall = calls.find((c) => c.url.includes("api.resend.com"));
  assert.ok(resendCall, "Resend should be called");
  const email = JSON.parse(resendCall.opts.body);
  assert.deepStrictEqual(email.to, ["inbox@example.com"]);
  assert.strictEqual(email.reply_to, "priya@example.in");
  assert.match(email.subject, /WhatsApp Automation/);
  assert.match(email.text, /Priya Sharma/);

  const supaCall = calls.find((c) => c.url.includes("/rest/v1/enquiries"));
  assert.ok(supaCall, "Supabase insert should be called");
  assert.strictEqual(supaCall.opts.headers.apikey, "service-secret");
  const row = JSON.parse(supaCall.opts.body);
  assert.strictEqual(row.status, "New");
  assert.strictEqual(row.name, "Priya Sharma");
});

test("escapes HTML in the notification email", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";

  let body;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes("api.resend.com")) body = JSON.parse(opts.body);
    return okResponse();
  };

  await handler(
    makeEvent(
      validPayload({ message: "<script>alert(1)</script> and <b>bold</b>", started_at: "1" }),
      { ip: "203.0.113.40" }
    )
  );

  assert.ok(body.html.includes("&lt;script&gt;"), "HTML must be escaped");
  assert.ok(!body.html.includes("<script>alert"), "raw script tag must not appear");
});

/* ---------- configuration & failure states ---------- */

test("returns 503 NOT_CONFIGURED when no channel is set up", async () => {
  const res = await handler(makeEvent(validPayload({ started_at: "1" }), { ip: "203.0.113.50" }));
  assert.strictEqual(res.statusCode, 503);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.code, "NOT_CONFIGURED");
  assert.match(body.error, /connected on this site/i);
});

test("returns a friendly 502 when every configured channel fails", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";

  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
    text: async () => "Internal error from provider"
  });

  const res = await handler(makeEvent(validPayload({ started_at: "1" }), { ip: "203.0.113.60" }));
  assert.strictEqual(res.statusCode, 502);
  const body = JSON.parse(res.body);
  assert.match(body.error, /Something went wrong/);
  assert.ok(!/500|Internal error/i.test(body.error), "must not leak raw provider errors");
});

test("succeeds when storage fails but email succeeds", async () => {
  process.env.RESEND_API_KEY = "test-key";
  process.env.ENQUIRY_TO_EMAIL = "inbox@example.com";
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-secret";

  globalThis.fetch = async (url) => {
    if (String(url).includes("supabase.co")) {
      return { ok: false, status: 401, text: async () => "invalid key" };
    }
    return okResponse();
  };

  const res = await handler(makeEvent(validPayload({ started_at: "1" }), { ip: "203.0.113.70" }));
  assert.strictEqual(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.strictEqual(body.emailed, true);
  assert.strictEqual(body.stored, false);
});
