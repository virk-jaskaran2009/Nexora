/* ============================================================
   Nexora AI Forge — enquiry endpoint (Netlify Function)
   ------------------------------------------------------------
   Visitor -> this function -> validation -> spam filter ->
   storage (Supabase, optional) -> email notification (Resend,
   optional) -> honest success/error response.

   All secrets come from Netlify environment variables
   (see .env.example). NOTHING secret lives in frontend code.

   Zero npm dependencies: it uses the Node 18+ global fetch.
   ============================================================ */

"use strict";

/* Keep in sync with the <select> options in index.html.
   The server never trusts whatever the browser sent. */
const ALLOWED_SERVICES = [
  "AI Automation",
  "WhatsApp Automation",
  "Instagram Automation",
  "Website",
  "Web Application",
  "AI Solution",
  "Other"
];

const ALLOWED_BUDGETS = [
  "Under ₹5,000",
  "₹5,000 – ₹10,000",
  "₹10,000 – ₹25,000",
  "₹25,000 – ₹50,000",
  "₹50,000+",
  "Not sure yet",
  ""
];

const ALLOWED_PREFS = ["Email", "Phone", "WhatsApp"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY_BYTES = 50 * 1024;
const MIN_SECONDS = Number(process.env.ENQUIRY_MIN_SECONDS || 3);
const RATE_LIMIT = Number(process.env.ENQUIRY_RATE_LIMIT || 5);
const RATE_WINDOW_MS = 10 * 60 * 1000;

/* ---------- helpers ---------- */

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    },
    body: JSON.stringify(body)
  };
}

function clean(value, max) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Simple per-instance rate limiter. Cold starts reset it, which is fine:
   it stops bursts, it is not a security boundary. */
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_LIMIT) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return false;
}

function validate(payload) {
  const errors = {};
  const value = {
    name: clean(payload.name, 120),
    email: clean(payload.email, 200),
    phone: clean(payload.phone, 30),
    company: clean(payload.company, 160),
    service: clean(payload.service, 60),
    budget: clean(payload.budget, 40),
    message: clean(payload.message, 3000),
    contact_pref: clean(payload.contact_pref, 20),
    source: clean(payload.source, 60)
  };

  if (value.name.length < 2) errors.name = "Please tell us your name.";
  if (!EMAIL_RE.test(value.email)) errors.email = "Please enter a valid email address.";

  const digits = value.phone.replace(/\D/g, "");
  if (!/^[+\d\s()-]{7,18}$/.test(value.phone) || digits.length < 7 || digits.length > 15) {
    errors.phone = "Please enter a valid phone or WhatsApp number.";
  }

  if (!ALLOWED_SERVICES.includes(value.service)) {
    errors.service = "Please choose a service.";
  }

  if (value.message.length < 10) {
    errors.message = "A sentence or two helps us prepare.";
  } else if (value.message.length > 3000) {
    errors.message = "Please keep the message under 3000 characters.";
  }

  if (value.budget && !ALLOWED_BUDGETS.includes(value.budget)) value.budget = "";
  if (!ALLOWED_PREFS.includes(value.contact_pref)) value.contact_pref = "Email";
  if (!value.source) value.source = "website";

  return { errors, value };
}

/* ---------- storage: Supabase (optional) ---------- */

async function storeInSupabase(value) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.ENQUIRY_TABLE || "enquiries";

  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal"
    },
    body: JSON.stringify({
      name: value.name,
      email: value.email,
      phone: value.phone,
      company: value.company,
      service: value.service,
      budget: value.budget,
      message: value.message,
      contact_pref: value.contact_pref,
      status: "New",
      source: value.source
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase insert failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return true;
}

/* ---------- email: Resend (optional) ---------- */

function buildEmail(value) {
  const rows = [
    ["Name", value.name],
    ["Email", value.email],
    ["Phone / WhatsApp", value.phone],
    ["Company", value.company || "—"],
    ["Service", value.service],
    ["Budget", value.budget || "—"],
    ["Preferred contact", value.contact_pref],
    ["Source", value.source]
  ];

  const tableRows = rows
    .map(
      ([label, val]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#6b7280;font-size:13px;white-space:nowrap;">${escapeHtml(
          label
        )}</td><td style="padding:6px 0;font-size:14px;color:#111827;">${escapeHtml(val)}</td></tr>`
    )
    .join("");

  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;">
    <h2 style="font-size:18px;margin:0 0 4px;">New website enquiry</h2>
    <p style="font-size:13px;color:#6b7280;margin:0 0 18px;">Nexora AI Forge contact form · ${escapeHtml(
      new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
    )} IST</p>
    <table style="border-collapse:collapse;width:100%;border-top:1px solid #e5e7eb;">${tableRows}</table>
    <h3 style="font-size:15px;margin:20px 0 6px;">Message</h3>
    <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;margin:0;color:#111827;">${escapeHtml(
      value.message
    )}</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />
    <p style="font-size:12px;color:#9ca3af;margin:0;">Reply directly to this email to answer ${escapeHtml(
      value.name
    )}.</p>
  </div>`;

  const text = [
    "New website enquiry — Nexora AI Forge",
    ...rows.map(([label, val]) => `${label}: ${val}`),
    "",
    "Message:",
    value.message
  ].join("\n");

  return { html, text };
}

async function sendEmail(value) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ENQUIRY_TO_EMAIL;
  const from = process.env.ENQUIRY_FROM_EMAIL || "Nexora AI Forge <onboarding@resend.dev>";

  const { html, text } = buildEmail(value);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      reply_to: value.email,
      subject: `New enquiry: ${value.service} — ${value.name}`,
      html,
      text
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
  return true;
}

/* ---------- handler ---------- */

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Method not allowed." });
  }

  if (event.body && event.body.length > MAX_BODY_BYTES) {
    return json(413, { ok: false, error: "Payload too large." });
  }

  let payload;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";
    payload = JSON.parse(raw);
  } catch (err) {
    return json(400, { ok: false, error: "Invalid request body." });
  }

  if (typeof payload !== "object" || payload === null) {
    return json(400, { ok: false, error: "Invalid request body." });
  }

  /* Honeypot: real people never see this field. Pretend success. */
  if (typeof payload.bot_field === "string" && payload.bot_field.trim() !== "") {
    return json(200, { ok: true });
  }

  /* Time trap: humans need longer than MIN_SECONDS to fill the form. */
  const startedAt = Number(payload.started_at);
  if (startedAt > 0 && Date.now() - startedAt < MIN_SECONDS * 1000) {
    return json(200, { ok: true });
  }

  const ip =
    (event.headers && (event.headers["x-nf-client-connection-ip"] || event.headers["x-forwarded-for"])) ||
    "unknown";

  if (isRateLimited(String(ip).split(",")[0].trim())) {
    return json(429, {
      ok: false,
      error: "We've received a few enquiries from you already. Please wait a few minutes and try again."
    });
  }

  const { errors, value } = validate(payload);
  if (Object.keys(errors).length > 0) {
    return json(422, {
      ok: false,
      code: "VALIDATION",
      error: "Please fix the highlighted fields and try again.",
      fields: errors
    });
  }

  const hasEmail = Boolean(process.env.RESEND_API_KEY && process.env.ENQUIRY_TO_EMAIL);
  const hasStore = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

  /* Nothing configured yet: tell the frontend honestly so it can fall
     back to Netlify's built-in form capture instead of lying to the user. */
  if (!hasEmail && !hasStore) {
    console.warn("[enquiry] No email/storage channel configured — see .env.example");
    return json(503, {
      ok: false,
      code: "NOT_CONFIGURED",
      error: "The enquiry service isn't connected on this site yet."
    });
  }

  let stored = false;
  let emailed = false;
  const failures = [];

  if (hasStore) {
    try {
      stored = await storeInSupabase(value);
    } catch (err) {
      failures.push(err.message);
      console.error("[enquiry] storage failed:", err.message);
    }
  }

  if (hasEmail) {
    try {
      emailed = await sendEmail(value);
    } catch (err) {
      failures.push(err.message);
      console.error("[enquiry] email failed:", err.message);
    }
  }

  const configured = (hasStore ? 1 : 0) + (hasEmail ? 1 : 0);
  const succeeded = (stored ? 1 : 0) + (emailed ? 1 : 0);

  if (succeeded === 0) {
    return json(502, {
      ok: false,
      error:
        "Something went wrong while sending your enquiry. Please try again in a moment."
    });
  }

  if (succeeded < configured) {
    /* Partial success: the lead reached at least one channel. Keep the
       visitor's success message truthful and alert us in the logs. */
    console.error("[enquiry] partial delivery:", failures.join(" | "));
  }

  return json(200, { ok: true, stored, emailed });
};
