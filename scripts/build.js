/* ============================================================
   Nexora AI Forge — build script (no dependencies)
   ------------------------------------------------------------
   Run: node scripts/build.js

   1. Copies the site files into dist/
   2. If SITE_URL is set: injects canonical/og:url tags and
      generates sitemap.xml + robots.txt with real URLs.
   3. If SITE_URL is not set: still builds a working site and
      skips URL-dependent SEO files (with a clear warning).

   Netlify runs this automatically (see netlify.toml).
   ============================================================ */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "dist");

const SITE_FILES = [
  "index.html",
  "privacy.html",
  "terms.html",
  "404.html",
  "styles.css",
  "script.js",
  "config.js",
  "og-image.png"
];

const PAGES = ["/", "/privacy.html", "/terms.html"];

const SITE_URL = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");

function fail(message) {
  console.error("\n  BUILD FAILED: " + message + "\n");
  process.exit(1);
}

/* ---------- 1. copy ---------- */

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

for (const file of SITE_FILES) {
  const from = path.join(ROOT, file);
  if (!fs.existsSync(from)) fail("Missing site file: " + file);
  fs.copyFileSync(from, path.join(OUT, file));
}

/* ---------- 2. canonical / og:url injection ---------- */

const MARKER = /<!-- build:url -->[\s\S]*?<!-- \/build:url -->/;

function injectUrlTags(html, pagePath) {
  if (!SITE_URL || !MARKER.test(html)) return html;
  const injected = [
    `<!-- build:url -->`,
    `  <link rel="canonical" href="${SITE_URL}${pagePath}" />`,
    `  <meta property="og:url" content="${SITE_URL}${pagePath}" />`,
    `  <meta property="og:image" content="${SITE_URL}/og-image.png" />`,
    `  <meta name="twitter:url" content="${SITE_URL}${pagePath}" />`,
    `  <meta name="twitter:image" content="${SITE_URL}/og-image.png" />`,
    `  <!-- /build:url -->`
  ].join("\n  ");
  return html.replace(MARKER, injected);
}

for (const file of ["index.html", "privacy.html", "terms.html"]) {
  const target = path.join(OUT, file);
  const pagePath = file === "index.html" ? "/" : "/" + file;
  const html = fs.readFileSync(target, "utf8");
  fs.writeFileSync(target, injectUrlTags(html, pagePath));
}

/* ---------- 3. robots.txt + sitemap.xml ---------- */

const robots =
  "User-agent: *\nAllow: /\n" +
  (SITE_URL ? "\nSitemap: " + SITE_URL + "/sitemap.xml\n" : "");

fs.writeFileSync(path.join(OUT, "robots.txt"), robots);

if (SITE_URL) {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map(
    (page) =>
      `  <url>\n    <loc>${SITE_URL}${page}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${page === "/" ? "1.0" : "0.4"}</priority>\n  </url>`
  ).join("\n");

  fs.writeFileSync(
    path.join(OUT, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
  );
} else {
  console.warn(
    "\n  WARNING: SITE_URL is not set — skipping sitemap.xml and canonical tags.\n" +
      "  Set SITE_URL in Netlify → Environment variables once your URL is final.\n"
  );
}

console.log(
  "Build OK: " + SITE_FILES.length + " files copied to dist/" +
    (SITE_URL ? " (SEO URLs generated for " + SITE_URL + ")" : " (no SITE_URL yet)")
);
