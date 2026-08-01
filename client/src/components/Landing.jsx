import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import anime from "animejs/lib/anime.es.js";
import { getJSON } from "@/lib/api";
import "../landing.css";

// Public campaign page — A Night of a Thousand Crusades.
// Design ported from the ukcopy static mockup (gray hero card + photo collage +
// globe on a navy frame). All CTAs land on the registration form.

const REGISTER = "/crusade-registration/register";

const HERO_WORDS = ["Crusades", "Conferences", "Outreaches", "Rallies", "Distribution"];

// Typewriter: deletes the current word, types the next, loops. Static on
// reduced-motion. Speeds in ms per char / hold at full word.
function useTypewriter(words, { typeMs = 85, deleteMs = 45, holdMs = 1600 } = {}) {
  const [text, setText] = React.useState(words[0]);
  React.useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let wordIdx = 0, charIdx = words[0].length, deleting = true, timer;
    const tick = () => {
      const word = words[wordIdx];
      if (deleting) {
        charIdx -= 1;
        setText(word.slice(0, charIdx));
        if (charIdx === 0) { deleting = false; wordIdx = (wordIdx + 1) % words.length; }
        timer = setTimeout(tick, deleteMs);
      } else {
        charIdx += 1;
        setText(words[wordIdx].slice(0, charIdx));
        if (charIdx === words[wordIdx].length) { deleting = true; timer = setTimeout(tick, holdMs); return; }
        timer = setTimeout(tick, typeMs);
      }
    };
    timer = setTimeout(tick, holdMs);
    return () => clearTimeout(timer);
  }, []);
  return text;
}

// Register CTA: on click, collapse to a circle showing only the arrow icon,
// rotate the arrow to point forward, then navigate.
function RegisterButton({ children, className = "" }) {
  const navigate = useNavigate();
  const labelRef = React.useRef(null);
  const [igniting, setIgniting] = React.useState(false);
  const onClick = (e) => {
    if (igniting) return;
    e.preventDefault();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { navigate(REGISTER); return; }
    // Pin the label to its exact width so the collapse starts moving instantly
    // (no dead zone from an oversized max-width), then animate it to 0.
    const label = labelRef.current;
    if (label) {
      label.style.maxWidth = `${label.scrollWidth}px`;
      void label.offsetWidth; // force reflow so the next value transitions
      requestAnimationFrame(() => { label.style.maxWidth = "0px"; });
    }
    setIgniting(true);
    setTimeout(() => navigate(REGISTER), 1250);
  };
  return (
    <Link to={REGISTER} onClick={onClick} aria-label="Register"
      className={`btn btn-primary reg-btn${igniting ? " igniting" : ""} ${className}`}>
      <span className="reg-label" ref={labelRef}>{children}</span>
      <img src="/assets/icon-arrow.svg" className="btn-icon" alt="" />
    </Link>
  );
}

// Donate link: on hover, cycle through money icons (each blurs in); stop on
// leave. Uses the already-loaded Remix Icon font, so no extra network requests.
const DONATE_ICONS = ["ri-money-euro-circle-fill", "ri-money-cny-box-fill", "ri-money-dollar-box-fill", "ri-money-cny-circle-fill"];
function DonateLink({ onClick }) {
  const [hover, setHover] = React.useState(false);
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (!hover) return;
    setIdx(0);
    const t = setInterval(() => setIdx((n) => (n + 1) % DONATE_ICONS.length), 1150);
    return () => clearInterval(t);
  }, [hover]);
  return (
    <a href="https://rhapsodycrusades.org/sponsor" target="_blank" rel="noreferrer"
      className="nav-link donate-link" onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      Donate
      <span className="donate-icon" aria-hidden="true">
        {hover && <i key={idx} className={`${DONATE_ICONS[idx]} donate-cycle`} />}
      </span>
    </a>
  );
}

const CONTACTS = [
  ["USA", ["+1 (469) 656-1284", "+1 800 620 8522"]],
  ["UK", ["+44 (0) 170 855 6604"]],
  ["Canada", ["+1 (647) 797-8077"]],
  ["South Africa", ["+27 1132 60971-2"]],
  ["Nigeria", ["+234 201 8888 186"]],
];

// ponytail: summaries only; the linked public pages remain the source of truth.
const INITIATIVES = [
  {
    to: "/select-nation",
    title: "National Missions Leadership Initiative",
    copy: "Each Zonal Pastor may express interest in a mission nation outside their zone's home nation. Where multiple zones share works or interests, the NOTC administration will appoint the Lead Regional or Zonal Pastor.",
    action: "Select a nation",
    image: "/national-missions-leadership.png",
    tone: "gold",
  },
  {
    to: "/media-training",
    title: "Global Media Training Mobilisation",
    copy: "We are mobilising a global media workforce to ensure excellence, consistency, and maximum impact across all nations.",
    action: "Register for training",
    image: "/media-training-mobilisation.png",
    tone: "cyan",
  },
  {
    to: "/mission-trips",
    title: "Global Missions Trip Volunteer Mobilisation",
    copy: "We are mobilising volunteers from across our churches, zones, and networks to participate in missions trips and support the global outreach efforts.",
    action: "Apply Now",
    image: "/global-missions-trip-volunteer.png",
    tone: "rose",
  },
];

function ResourcesPreview() {
  const [resources, setResources] = React.useState([]);
  const [status, setStatus] = React.useState("loading");

  React.useEffect(() => {
    let active = true;
    getJSON("/resources")
      .then((data) => {
        if (!active) return;
        setResources((data.resources || []).slice(0, 3));
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => { active = false; };
  }, []);

  return (
    <section className="resources-preview" aria-labelledby="resources-preview-title">
      <div className="resources-preview-intro">
        <div>
          <h2 id="resources-preview-title">Approved Resources Hub</h2>
        </div>
        <p>Access all approved resources required for effective preparation, teaching, outreach, and crusade execution.</p>
      </div>

      {status === "loading" ? (
        <div className="resource-preview-grid" aria-label="Loading resources">
          {[0, 1, 2].map((item) => <div className="resource-preview-skeleton" key={item} />)}
        </div>
      ) : resources.length ? (
        <div className="resource-preview-grid">
          {resources.map((resource) => (
            <article className="resource-preview-item" key={resource.id}>
              <a href={resource.url} target="_blank" rel="noreferrer" aria-label={`Open ${resource.title}`}>
                <div className="resource-preview-media">
                  {resource.thumbnail_url || resource.resource_type === "image" ? (
                    <img src={resource.thumbnail_url || resource.url} alt="" loading="lazy" referrerPolicy="no-referrer" />
                  ) : resource.resource_type === "video" ? (
                    <video src={resource.url} preload="metadata" muted />
                  ) : (
                    <span aria-hidden="true">{resource.resource_type?.slice(0, 1)?.toUpperCase() || "R"}</span>
                  )}
                </div>
                <div className="resource-preview-copy">
                  <span>{resource.category || "Approved resource"} · {resource.resource_type || "resource"}</span>
                  <h3>{resource.title}</h3>
                  {resource.description && <p>{resource.description}</p>}
                </div>
              </a>
            </article>
          ))}
        </div>
      ) : (
        <p className="resources-preview-empty">{status === "error" ? "The latest resources could not be loaded right now." : "Approved resources will appear here as they are published."}</p>
      )}

      <Link to="/resources" className="resources-preview-action">View more resources</Link>
    </section>
  );
}

// Cookie consent — shows once, remembers the choice in localStorage.
function CookiePrompt() {
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    try { if (!localStorage.getItem("cookie-consent")) setShow(true); } catch { /* private mode */ }
  }, []);
  const decide = (v) => {
    try { localStorage.setItem("cookie-consent", v); } catch { /* ignore */ }
    setShow(false);
  };
  if (!show) return null;
  return (
    <div className="cookie-prompt" role="dialog" aria-label="Cookie notice">
      <p className="cookie-copy">
        We use cookies to improve your experience and to count crusades on the live map.
      </p>
      <div className="cookie-actions">
        <button type="button" className="cookie-decline" onClick={() => decide("declined")}>Decline</button>
        <button type="button" className="cookie-accept" onClick={() => decide("accepted")}>Accept</button>
      </div>
    </div>
  );
}

// Countdown to A Night of a Thousand Crusades — 28 August (the next one; rolls to
// next year once this year's has passed). anime.js staggers the boxes in and
// pulses the seconds each tick. Static under reduced-motion.
function nextAug28() {
  const now = new Date();
  const thisYear = new Date(now.getFullYear(), 7, 28, 0, 0, 0); // month 7 = August
  return thisYear.getTime() > now.getTime() ? thisYear : new Date(now.getFullYear() + 1, 7, 28, 0, 0, 0);
}

function timeLeft(target) {
  const ms = Math.max(0, target - Date.now());
  return {
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
  };
}

function Countdown() {
  const target = React.useRef(nextAug28()).current;
  const [t, setT] = React.useState(() => timeLeft(target));
  const gridRef = React.useRef(null);
  const secondsRef = React.useRef(null);
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  React.useEffect(() => {
    const id = setInterval(() => setT(timeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  React.useEffect(() => {
    if (!gridRef.current || reduced()) return;
    anime({
      targets: gridRef.current.querySelectorAll(".cd-box"),
      translateY: [28, 0], opacity: [0, 1], scale: [0.92, 1],
      delay: anime.stagger(110), duration: 750, easing: "easeOutExpo",
    });
  }, []);

  React.useEffect(() => {
    if (!secondsRef.current || reduced()) return;
    anime({ targets: secondsRef.current, scale: [1.16, 1], duration: 450, easing: "easeOutElastic(1, .6)" });
  }, [t.seconds]);

  const units = [["Days", t.days], ["Hours", t.hours], ["Minutes", t.minutes], ["Seconds", t.seconds]];
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <section className="countdown" aria-label="Countdown to A Night of a Thousand Crusades">
      <div className="countdown-glow" aria-hidden="true" />
      <span className="eyebrow">Save the date · 28 August</span>
      <h2 className="countdown-title">A Night of a Thousand Crusades</h2>
      <p className="countdown-edition">The Continents &amp; Nations Edition</p>
      <div className="countdown-grid" ref={gridRef}>
        {units.map(([label, value]) => (
          <div className="cd-box" key={label}>
            <span className="cd-num" ref={label === "Seconds" ? secondsRef : undefined}>{pad(value)}</span>
            <span className="cd-label">{label}</span>
          </div>
        ))}
      </div>
      <RegisterButton className="countdown-register">Register Now</RegisterButton>
    </section>
  );
}

export function Landing() {
  const [navOpen, setNavOpen] = React.useState(false);
  const closeNav = () => setNavOpen(false);
  const rootRef = React.useRef(null);
  const loaderRef = React.useRef(null);
  const [loaded, setLoaded] = React.useState(false);
  const heroWord = useTypewriter(HERO_WORDS);

  // Page loader (globe icon zooms out + blurs away) → hero intro → scroll
  // parallax + section reveals, synced to Lenis smooth scroll. gsap/ScrollTrigger/
  // Lenis come from CDN (index.html). Scoped to the root; torn down on unmount.
  React.useEffect(() => {
    const { gsap, ScrollTrigger, Lenis } = window;
    const root = rootRef.current;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animated = gsap && ScrollTrigger && Lenis && root && !reduce;

    let lenis, ctx, onTick, safety, hardCap, started = false;

    const play = () => {
      if (started) return;
      started = true;
      clearTimeout(safety);
      clearTimeout(hardCap);
      if (!animated) { setLoaded(true); return; }

      gsap.registerPlugin(ScrollTrigger);
      const spring = "back.out(1.4)";
      const blur = (px) => `blur(${px}px)`;

      lenis = new Lenis({ lerp: 0.1 });
      lenis.on("scroll", ScrollTrigger.update);
      onTick = (t) => lenis.raf(t * 1000);
      gsap.ticker.add(onTick);
      gsap.ticker.lagSmoothing(0);

      ctx = gsap.context(() => {
        // ---- Loader reveal: globe zooms out + blurs, overlay fades to page ----
        const loader = loaderRef.current;
        if (loader) {
          gsap.timeline()
            .fromTo(loader.querySelector(".loader-globe"),
              { scale: 0.42, filter: blur(0) },
              { scale: 1.75, filter: blur(16), duration: 1.15, ease: "power2.inOut" })
            .to(loader, { autoAlpha: 0, duration: 0.7, ease: "power1.out",
              onComplete: () => setLoaded(true) }, "-=0.55");
        }

        // ---- Hero intro (plays as the loader dissolves) ----
        const intro = gsap.timeline({ defaults: { ease: spring }, delay: 0.5 });
        intro
          .fromTo(".edition-badge",
            { autoAlpha: 0, y: 20, scale: 0.9, filter: blur(8) },
            { autoAlpha: 1, y: 0, scale: 1, filter: blur(0), duration: 0.7, clearProps: "filter" })
          .fromTo(".site-header",
            { autoAlpha: 0, y: -55, filter: blur(8) },
            { autoAlpha: 1, y: 0, filter: blur(0), duration: 0.9, clearProps: "filter" })
          .fromTo(".hero-content h1",
            { autoAlpha: 0, y: 44, filter: blur(16) },
            { autoAlpha: 1, y: 0, filter: blur(0), duration: 1.1, clearProps: "filter" }, "-=0.45")
          .fromTo(".hero-sub",
            { autoAlpha: 0, y: 28, filter: blur(10) },
            { autoAlpha: 1, y: 0, filter: blur(0), duration: 0.9, clearProps: "filter" }, "-=0.75")
          .fromTo(".hero-collage img",
            { autoAlpha: 0, y: 64, scale: 0.92, filter: blur(12) },
            { autoAlpha: 1, y: 0, scale: 1, filter: blur(0), duration: 1, stagger: 0.12, clearProps: "filter" }, "-=0.55")
          .fromTo(".hero-globe",
            { autoAlpha: 0, scale: 1.06, filter: blur(12) },
            { autoAlpha: 1, scale: 1, filter: blur(0), duration: 1.3, ease: "power2.out", clearProps: "filter" }, "-=1.15");

        // ---- Scroll parallax: globe + collage at differing speeds ----
        gsap.to(".hero-globe", {
          yPercent: 9, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
        });
        // Each collage image drifts up at its own rate — the top one moves ~1.5x
        // the scroll (yPercent -50), the others progressively less. (approximate)
        const drift = { ".collage-a": -50, ".collage-b": -16, ".collage-c": -32, ".collage-d": -8 };
        Object.entries(drift).forEach(([sel, yPercent]) => {
          gsap.to(sel, {
            yPercent, ease: "none",
            scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.5 },
          });
        });

        // ---- Section reveals on scroll ----
        const reveal = (targets, opts = {}) =>
          gsap.fromTo(targets,
            { autoAlpha: 0, y: opts.y ?? 32, filter: blur(opts.blur ?? 10) },
            {
              autoAlpha: 1, y: 0, filter: blur(0),
              duration: opts.duration ?? 0.9, ease: spring,
              stagger: opts.stagger ?? 0, delay: opts.delay ?? 0,
              scrollTrigger: { trigger: opts.trigger, start: opts.start ?? "top 82%" },
              clearProps: "transform,filter",   // clear transform so CSS :hover works
            });

        reveal(".resources-preview-intro > *, .resource-preview-grid, .resources-preview-action", { trigger: ".resources-preview", start: "top 82%", y: 38, blur: 10, stagger: 0.12, duration: 0.85 });
        gsap.utils.toArray(".initiative-feature").forEach((feature) => {
          reveal(feature, { trigger: feature, start: "top 84%", y: 48, blur: 12, duration: 0.95 });
        });
        reveal(".how-to h2, .how-to .section-sub", { trigger: ".how-to", start: "top 80%", stagger: 0.12, duration: 0.8 });
        reveal(".step", { trigger: ".steps", start: "top 84%", y: 54, blur: 12, stagger: 0.16, duration: 0.9 });
        reveal(".how-to .btn-primary", { trigger: ".steps", start: "top 66%", y: 24, blur: 6, duration: 0.7, delay: 0.15 });
        reveal(".footer-cta > *", { trigger: ".footer-cta", start: "top 82%", y: 36, stagger: 0.13, duration: 0.9 });
        reveal(".footer-brand, .footer-col, .footer-numbers", { trigger: ".footer-main", start: "top 88%", y: 30, blur: 8, stagger: 0.12, duration: 0.8 });
        reveal(".footer-bottom", { trigger: ".footer-bottom", start: "top 95%", y: 20, blur: 5, duration: 0.7 });
      }, root);
    };

    // Preload hero imagery, but keep the loader up for a minimum ~2.7s (the
    // reveal itself adds ~1.3s → ~4s total) so it doesn't flash by on fast/cached
    // loads. Hard cap in case images never resolve.
    const MIN_LOADER_MS = 2700;
    const t0 = performance.now();
    const armed = () => {
      const wait = Math.max(0, MIN_LOADER_MS - (performance.now() - t0));
      safety = setTimeout(play, wait);
    };
    const sources = ["/assets/globe.webp", "/assets/crusade-1.webp", "/assets/crusade-2.webp", "/assets/crusade-3.webp", "/assets/crusade-4.webp"];
    let remaining = sources.length;
    sources.forEach((src) => {
      const im = new Image();
      im.onload = im.onerror = () => { if (--remaining <= 0) armed(); };
      im.src = src;
    });
    hardCap = setTimeout(play, MIN_LOADER_MS + 3000);

    return () => {
      clearTimeout(safety);
      clearTimeout(hardCap);
      if (onTick) gsap.ticker.remove(onTick);
      lenis?.destroy();
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className={`landing-page${navOpen ? " nav-open" : ""}`}>
      {/* ===== Page loader: globe icon zooms out + blurs into the page ===== */}
      {!loaded && (
        <div className="page-loader" ref={loaderRef} aria-hidden="true">
          <span className="loader-ring" />
          <img className="loader-globe" src="/assets/globe.webp" alt="" />
        </div>
      )}

      {/* ===== Hero (gray card: header + title + globe + collage) ===== */}
      <section className="hero">
        <div className="hero-glow" aria-hidden="true" />
        <img src="/assets/globe.webp" className="hero-globe" alt="" aria-hidden="true" />

        <header className="site-header">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="Rhapsody End-Time Teaching Crusades" />
          </Link>
          <button
            className="nav-toggle"
            aria-label={navOpen ? "Close menu" : "Open menu"}
            aria-expanded={navOpen}
            aria-controls="primary-nav"
            onClick={() => setNavOpen((o) => !o)}
          >
            <span /><span /><span />
          </button>
          <nav className="nav" id="primary-nav">
            <div className="mobile-initiative-links" aria-label="NOTC initiatives">
              <Link to="/select-nation" onClick={closeNav}>Select a Nation</Link>
              <Link to="/media-training" onClick={closeNav}>Media Training</Link>
              <Link to="/mission-trips" onClick={closeNav}>Mission Trips</Link>
            </div>
            <div className="nav-pill">
              <Link to="/resources" className="nav-link resources-link" onClick={closeNav}>
                Resources <img src="/assets/icon-resources.svg" className="nav-icon" alt="" />
              </Link>
              <span className="nav-divider" />
              <DonateLink onClick={closeNav} />
            </div>
            <RegisterButton>Register Now</RegisterButton>
          </nav>
        </header>

        <div className="hero-content">
          <span className="edition-badge">Continents &amp; Nations Edition</span>
          <h1>Rhapsody End-Time Teaching<br /><em aria-live="polite">{heroWord}<span className="type-caret" aria-hidden="true" /></em></h1>
          <div className="hero-sub">
            <h2>A Night of a Thousand Crusades</h2>
            <p>One night. Thousands of crusades, held simultaneously across cities and nations of the world.</p>
          </div>
        </div>

        <div className="hero-collage">
          <img src="/assets/crusade-3.webp" alt="Crusade stage" className="collage-a" />
          <img src="/assets/crusade-1.webp" alt="Crusade gathering" className="collage-b" />
          <img src="/assets/crusade-4.webp" alt="Crusade worship" className="collage-c" />
          <img src="/assets/crusade-2.webp" alt="Crusade crowd" className="collage-d" />
        </div>
      </section>

      {/* ===== Countdown (right after the hero) ===== */}
      <Countdown />

      {/* ===== Approved resources preview ===== */}
      <ResourcesPreview />

      {/* ===== Public initiatives ===== */}
      <div className="initiatives" aria-label="NOTC initiatives">
        {INITIATIVES.map((item, index) => (
          <section className={`initiative-feature initiative-${item.tone}${index % 2 ? " initiative-reverse" : ""}`} key={item.to} aria-labelledby={`initiative-${index}`}>
            <Link to={item.to} className="initiative-image" aria-label={item.action}>
              <img src={item.image} alt="" loading="lazy" />
            </Link>
            <div className="initiative-copy">
              {item.label && <span>{item.label}</span>}
              <h2 id={`initiative-${index}`}>{item.title}</h2>
              <p>{item.copy}</p>
              <Link to={item.to}>{item.action}</Link>
            </div>
          </section>
        ))}
      </div>

      {/* ===== How to Register ===== */}
      <section id="register" className="how-to">
        <h2>How to register</h2>
        <p className="section-sub">Three steps. A few minutes.</p>

        <ol className="steps">
          {[
            ["Tell us who you are", "Register as a zone, group, church or network."],
            ["Break it down by type", "Mega crusades, street crusades, medical outreaches… state how many of each — and the cities, if you know them."],
            ["Submit and be counted", "Your crusades join the global tally instantly and appear on the live map."],
          ].map(([title, body], i) => (
            <li className="step" key={title}>
              <span className="step-num">{i + 1}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>

        <RegisterButton>Start Registration</RegisterButton>
      </section>

      {/* ===== Footer ===== */}
      <footer className="site-footer">
        <div className="footer-cta">
          <span className="eyebrow">Continents &amp; Nations Edition</span>
          <h2 className="footer-tagline">Reaching the whole world in one night.</h2>
          <p className="footer-cta-sub">Register your crusade and join the global tally — appear on the live map across nations and continents of the world.</p>
          <RegisterButton className="btn-lg">Register your crusades</RegisterButton>
        </div>

        <div className="footer-main">
          <div className="footer-cols">
            <div className="footer-brand">
              <div className="footer-brand-head">
                <img src="/logo.png" alt="" className="footer-logo" />
                <span className="footer-brand-name">Rhapsody End-Time<br />Teaching Crusades</span>
              </div>
              <p className="footer-desc">Thousands of crusades held simultaneously across nations and continents of the world — reaching the whole world in one night.</p>
              <div className="footer-social">
                <a href="https://kingschat.online/user/rorcrusades1" target="_blank" rel="noreferrer"
                  className="footer-kingschat" aria-label="KingsChat">
                  <img src="/assets/kingschat.webp" alt="" />
                </a>
              </div>
            </div>

            <div className="footer-links-groups">
              <div className="footer-col">
                <h4>Explore</h4>
                <Link to={REGISTER}>Register</Link>
                <Link to="/resources">Resources</Link>
                <Link to="/select-nation">Select a nation</Link>
                <Link to="/media-training">Media training</Link>
                <Link to="/mission-trips">Mission trips</Link>
                <a href="https://rhapsodycrusades.org/sponsor" target="_blank" rel="noreferrer">Donate</a>
              </div>
              <div className="footer-col">
                <h4>Connect</h4>
                <a href="mailto:info@rhapsodycrusades.org">info@rhapsodycrusades.org</a>
                <a href="tel:+14696561284">+1 (469) 656-1284</a>
                <a href="#">KingsChat: rorcrusades1</a>
              </div>
            </div>
          </div>

          <div className="footer-numbers">
            <h4>Contact Numbers</h4>
            <ul className="footer-numbers-grid">
              {CONTACTS.map(([region, numbers]) => (
                <li key={region}>
                  <span className="country">{region}</span>
                  {numbers.map((n) => (
                    <a href={`tel:${n.replace(/[^\d+]/g, "")}`} key={n}>{n}</a>
                  ))}
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-bottom">
            <p className="footer-copy">© 2026 Rhapsody End-Time Teaching Crusades. All rights reserved.</p>
            <nav className="footer-legal">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer">rhapsodycrusades.org</a>
            </nav>
          </div>

          <span className="footer-watermark" aria-hidden="true">Rhapsody</span>
        </div>
      </footer>

      <CookiePrompt />
    </div>
  );
}
