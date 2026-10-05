/* ============================================================
   Nexora AI Forge — public site configuration
   ------------------------------------------------------------
   Everything a non-technical person may need to change lives
   here: contact details, WhatsApp number, enquiry endpoint.

   RULE: never put API keys, tokens or passwords in this file.
   Secrets belong in Netlify environment variables only
   (see .env.example).
   ============================================================ */

window.NEXORA = {
  brand: {
    name: "Nexora AI Forge",
    shortName: "Nexora",
    tagline: "Build smarter. Automate better.",
    location: "Delhi NCR, India"
  },

  contact: {
    /* Shown in the contact section, footer and mailto: links. */
    email: "nexora.aiforge@gmail.com",

    /* Phone shown to visitors (display + dial formats). */
    phoneDisplay: "+91 96679 99028",
    phoneDial: "+919667999028",

    /* WhatsApp: digits only, country code first, no + or spaces.
       Used to build every wa.me link on the site. */
    whatsappNumber: "919667999028",

    /* Default WhatsApp pre-filled message. */
    whatsappMessage:
      "Hi Nexora! I'd like to discuss an automation or website project."
  },

  site: {
    /* Production URL, e.g. "https://your-site.netlify.app".
       Leave "" until your Netlify/domain URL is final — the build
       script skips sitemap/canonical generation when empty. */
    url: ""
  },

  enquiry: {
    /* Primary endpoint: the Netlify Function in
       netlify/functions/enquiry.js (keeps all secrets server-side). */
    endpoint: "/.netlify/functions/enquiry",

    /* When the primary endpoint is not configured (no env vars yet),
       visitors on *.netlify.app fall back to Netlify's built-in form
       capture so enquiries are never silently lost. */
    netlifyFormsFallback: true,

    /* Minimum seconds a real human needs to fill the form.
       Submissions faster than this are treated as bots. */
    minSeconds: 3
  },

  /* Social profiles. Leave a value empty to hide that icon —
     empty links are never rendered. */
  social: {
    linkedin: "",
    instagram: "",
    x: "",
    github: ""
  }
};
