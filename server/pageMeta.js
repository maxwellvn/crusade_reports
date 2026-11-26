import { DEFAULT_CAMPAIGN } from "./campaigns.js";

const BRAND = "Rhapsody End-Time Teaching Crusades";
const AAC_BRAND = "Angels at Christmas";

const PAGES = [
  [/^\/$/, "A Night of a Thousand Crusades", "Register and prepare for A Night of a Thousand Crusades, a global mobilisation of simultaneous gospel crusades.", "/", "/logo.png"],
  [/^\/crusade-registration\/register\/?$/, "Register Your Crusades", "Register confirmed crusades for A Night of a Thousand Crusades and add them to the global record.", "/crusade-registration/register", "/logo.png"],
  [/^\/crusade-registration\/?$/, "A Night of a Thousand Crusades", "Register and prepare for A Night of a Thousand Crusades, a global mobilisation of simultaneous gospel crusades.", "/crusade-registration", "/logo.png"],
  [/^\/blue-elite\/register\/?$/, "Blue Elite Crusade Registration", "Register confirmed crusades for the Loveworld Blue Elite team.", "/blue-elite/register", "/logo.png"],
  [/^\/blue-elite\/?$/, "Loveworld Blue Elite", "Loveworld Blue Elite staff can register and review confirmed crusades for NOTC.", "/blue-elite", "/logo.png"],
  [/^\/report\/?$/, "Report a Crusade", "Submit the verified outcome of a completed A Night of a Thousand Crusades event.", "/report", "/logo.png"],
  [/^\/resources\/?$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) Approved Resources Hub", "Access all approved resources required for effective preparation, teaching, outreach, and crusade execution.", "/resources", "/logo.png"],
  [/^\/select-nation\/?$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) – NATIONAL MISSIONS LEADERSHIP INITIATIVE", "Ministers can select a preferred mission nation and propose a commitment of at least 1,000 crusades.", "/select-nation", "/national-missions-leadership.png"],
  [/^\/media-training\/?$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) GLOBAL MEDIA TRAINING MOBILISATION", "Intensive training for media personnel, presenters, aspiring presenters, creatives, and volunteers serving the global evangelistic vision.", "/media-training", "/media-training-mobilisation.png"],
  [/^\/mission-trips\/?$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) GLOBAL MISSIONS TRIP VOLUNTEER MOBILISATION", "Volunteer for a global missions trip if you have independent travel access, availability, and a desire to serve in another nation.", "/mission-trips", "/global-missions-trip-volunteer.png"],
  [/^\/upcoming-crusades\/?$/, "UPCOMING NIGHT OF A THOUSAND CRUSADES", "Participants can select one planned international crusade they would like to attend and review the relevant travel details.", "/upcoming-crusades", "/logo.png"],
  [/^\/avatar\/?$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) CAMPAIGN AVATAR", "Add your photo to the Night of a Thousand Crusades campaign avatar and share your participation ahead of Friday, August 28, 2026.", "/avatar", "/notc-avatar-frame.jpg"],
  [/^\/privacy\/?$/, "Privacy Policy", "How the Night of a Thousand Crusades platform collects, uses, stores, and protects your personal information.", "/privacy", "/logo.png"],
  [/^\/terms\/?$/, "Terms of Service", "The terms governing your use of the Night of a Thousand Crusades platform.", "/terms", "/logo.png"],
];

const AAC_PAGES = [
  [/^\/$/, "Angels at Christmas", "Register, prepare and report Angels at Christmas Celebration Crusades throughout December 2026.", "/", "/angels-at-christmas-emblem.png"],
  [/^\/crusade-registration\/register\/?$/, "Register an Angels Crusade", "Register a confirmed Angels at Christmas Celebration Crusade taking place from 1 to 31 December 2026.", "/crusade-registration/register", "/angels-at-christmas-emblem.png"],
  [/^\/crusade-registration\/?$/, "Angels at Christmas", "Register, prepare and report Angels at Christmas Celebration Crusades throughout December 2026.", "/crusade-registration", "/angels-at-christmas-emblem.png"],
  [/^\/crusade-registration\/find\/?$/, "Find Your Angels Crusade", "Find a registered Angels at Christmas crusade and submit its completed report.", "/crusade-registration/find", "/angels-at-christmas-emblem.png"],
  [/^\/report\/?$/, "Report an Angels Crusade", "Submit the verified outcome of a completed Angels at Christmas Celebration Crusade.", "/report", "/angels-at-christmas-emblem.png"],
  [/^\/resources\/?$/, "Angels at Christmas Resources", "Access approved Angels at Christmas resources for crusade preparation and execution.", "/resources", "/angels-at-christmas-emblem.png"],
  [/^\/privacy\/?$/, "Privacy Policy", "How the Angels at Christmas portal collects, uses, stores and protects your personal information.", "/privacy", "/angels-at-christmas-emblem.png"],
  [/^\/terms\/?$/, "Terms of Service", "The terms governing your use of the Angels at Christmas portal.", "/terms", "/angels-at-christmas-emblem.png"],
];

const escapeAttribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

function replaceMeta(html, attribute, key, tag) {
  const pattern = new RegExp(`<meta\\s+[^>]*${attribute}=["']${key}["'][^>]*>`, "i");
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace("</head>", `    ${tag}\n  </head>`);
}

export function renderPageMetadata(template, pathname, origin, campaign = DEFAULT_CAMPAIGN) {
  const isAac = campaign === "aac";
  const page = (isAac ? AAC_PAGES : PAGES).find(([pattern]) => pattern.test(pathname));
  if (!page) return template;
  const [, heading, description, canonicalPath, imagePath] = page;
  const title = `${heading} — ${isAac ? AAC_BRAND : BRAND}`;
  const canonical = `${origin}${canonicalPath}`;
  const image = `${origin}${imagePath}`;
  const meta = {
    title: escapeAttribute(title), description: escapeAttribute(description),
    canonical: escapeAttribute(canonical), image: escapeAttribute(image),
  };
  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${meta.title}</title>`);
  html = replaceMeta(html, "name", "description", `<meta name="description" content="${meta.description}" />`);
  html = replaceMeta(html, "property", "og:title", `<meta property="og:title" content="${meta.title}" />`);
  html = replaceMeta(html, "property", "og:description", `<meta property="og:description" content="${meta.description}" />`);
  html = replaceMeta(html, "property", "og:image", `<meta property="og:image" content="${meta.image}" />`);
  html = replaceMeta(html, "property", "og:url", `<meta property="og:url" content="${meta.canonical}" />`);
  html = html.replace(/<meta name="twitter:card"[^>]*>/i, `<meta name="twitter:card" content="summary_large_image" />`);
  html = html.replace(/<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${meta.title}" />`);
  html = html.replace(/<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${meta.description}" />`);
  html = html.replace(/<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${meta.image}" />`);
  const canonicalTag = `<link rel="canonical" href="${meta.canonical}" />`;
  html = /<link rel="canonical"[^>]*>/i.test(html) ? html.replace(/<link rel="canonical"[^>]*>/i, canonicalTag) : html.replace("</head>", `    ${canonicalTag}\n  </head>`);
  return html;
}
