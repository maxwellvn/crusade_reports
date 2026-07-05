import * as React from "react";
import { Link } from "react-router-dom";
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

const CONTACTS = [
  ["USA", ["+1 (469) 656-1284", "+1 800 620 8522"]],
  ["UK", ["+44 (0) 170 855 6604"]],
  ["Canada", ["+1 (647) 797-8077"]],
  ["South Africa", ["+27 1132 60971-2"]],
  ["Nigeria", ["+234 201 8888 186"]],
];

export function Landing() {
  const [navOpen, setNavOpen] = React.useState(false);
  const closeNav = () => setNavOpen(false);
  const rootRef = React.useRef(null);
  const heroWord = useTypewriter(HERO_WORDS);

  // GSAP intro + scroll reveals + globe parallax, synced to Lenis smooth scroll.
  // Ported from the ukcopy main.js; gsap/ScrollTrigger/Lenis come from CDN
  // (see index.html). Scoped to the landing root and fully torn down on unmount.
  React.useEffect(() => {
    const { gsap, ScrollTrigger, Lenis } = window;
    const root = rootRef.current;
    if (!gsap || !ScrollTrigger || !Lenis || !root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    gsap.registerPlugin(ScrollTrigger);
    const q = gsap.utils.selector(root);
    const spring = "back.out(1.4)";
    const blur = (px) => `blur(${px}px)`;

    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    const onTick = (t) => lenis.raf(t * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: spring } });
      intro
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
          { autoAlpha: 1, y: 0, scale: 1, filter: blur(0), duration: 1, stagger: 0.12, clearProps: "transform,filter" }, "-=0.55")
        .fromTo(".hero-globe",
          { autoAlpha: 0, scale: 1.06, filter: blur(12) },
          { autoAlpha: 1, scale: 1, filter: blur(0), duration: 1.3, ease: "power2.out", clearProps: "filter" }, "-=1.15");

      gsap.to(".hero-globe", {
        yPercent: 9, ease: "none",
        scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
      });

      const reveal = (targets, opts = {}) =>
        gsap.fromTo(targets,
          { autoAlpha: 0, y: opts.y ?? 32, filter: blur(opts.blur ?? 10) },
          {
            autoAlpha: 1, y: 0, filter: blur(0),
            duration: opts.duration ?? 0.9, ease: spring,
            stagger: opts.stagger ?? 0, delay: opts.delay ?? 0,
            scrollTrigger: { trigger: opts.trigger, start: opts.start ?? "top 82%" },
            clearProps: "filter",
          });

      reveal(".how-to h2, .how-to .section-sub", { trigger: ".how-to", start: "top 80%", stagger: 0.12, duration: 0.8 });
      reveal(".step", { trigger: ".steps", start: "top 84%", y: 54, blur: 12, stagger: 0.16, duration: 0.9 });
      reveal(".how-to .btn-primary", { trigger: ".steps", start: "top 66%", y: 24, blur: 6, duration: 0.7, delay: 0.15 });
      reveal(".footer-cta > *", { trigger: ".footer-cta", start: "top 82%", y: 36, stagger: 0.13, duration: 0.9 });
      reveal(".footer-brand, .footer-col, .footer-numbers", { trigger: ".footer-main", start: "top 88%", y: 30, blur: 8, stagger: 0.12, duration: 0.8 });
      reveal(".footer-bottom", { trigger: ".footer-bottom", start: "top 95%", y: 20, blur: 5, duration: 0.7 });
    }, root);

    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
      ctx.revert();
    };
  }, []);

  return (
    <div ref={rootRef} className={`landing-page${navOpen ? " nav-open" : ""}`}>
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
            <div className="nav-pill">
              <a href="https://rhapsodycrusades.org/resources" target="_blank" rel="noreferrer" className="nav-link" onClick={closeNav}>
                Resources <img src="/assets/icon-resources.svg" className="nav-icon" alt="" />
              </a>
              <span className="nav-divider" />
              <a href="https://rhapsodycrusades.org/sponsor" target="_blank" rel="noreferrer" className="nav-link" onClick={closeNav}>Donate</a>
            </div>
            <Link to={REGISTER} className="btn btn-primary" onClick={closeNav}>
              Register Now <img src="/assets/icon-arrow.svg" className="btn-icon" alt="" />
            </Link>
          </nav>
        </header>

        <div className="hero-content">
          <h1>Rhapsody End-Time Teaching<br /><em aria-live="polite">{heroWord}<span className="type-caret" aria-hidden="true" /></em></h1>
          <p className="hero-sub">
            A Night of a Thousand Crusades.<br />
            One night. Thousands of crusades, held simultaneously across cities and nations of the world.
          </p>
        </div>

        <div className="hero-collage">
          <img src="/assets/crusade-3.webp" alt="Crusade stage" className="collage-a" />
          <img src="/assets/crusade-1.webp" alt="Crusade gathering" className="collage-b" />
          <img src="/assets/crusade-4.webp" alt="Crusade worship" className="collage-c" />
          <img src="/assets/crusade-2.webp" alt="Crusade crowd" className="collage-d" />
        </div>
      </section>

      {/* ===== How to Register ===== */}
      <section id="register" className="how-to">
        <h2>How to register</h2>
        <p className="section-sub">Three steps. A few minutes.</p>

        <ol className="steps">
          {[
            ["Tell us who you are", "Register as a zone, group, church or network, and pick your country and plan date."],
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

        <Link to={REGISTER} className="btn btn-primary">
          Start Registration <img src="/assets/icon-arrow.svg" className="btn-icon" alt="" />
        </Link>
      </section>

      {/* ===== Footer ===== */}
      <footer className="site-footer">
        <div className="footer-cta">
          <span className="eyebrow">One night. Thousands of crusades.</span>
          <h2 className="footer-tagline">Reaching the whole world in one night.</h2>
          <p className="footer-cta-sub">Register your crusade and join the global tally — appear on the live map across cities and nations of the world.</p>
          <Link to={REGISTER} className="btn btn-primary btn-lg">
            Register your crusades <img src="/assets/icon-arrow.svg" className="btn-icon" alt="" />
          </Link>
        </div>

        <div className="footer-main">
          <div className="footer-cols">
            <div className="footer-brand">
              <div className="footer-brand-head">
                <img src="/logo.png" alt="" className="footer-logo" />
                <span className="footer-brand-name">Rhapsody End-Time<br />Teaching Crusades</span>
              </div>
              <p className="footer-desc">Thousands of crusades held simultaneously across cities and nations of the world — reaching the whole world in one night.</p>
              <div className="footer-social">
                <a href="#" aria-label="Facebook"><i className="ri-facebook-fill" /></a>
                <a href="#" aria-label="Instagram"><i className="ri-instagram-line" /></a>
                <a href="#" aria-label="YouTube"><i className="ri-youtube-fill" /></a>
                <a href="#" aria-label="KingsChat"><i className="ri-chat-3-fill" /></a>
              </div>
            </div>

            <div className="footer-links-groups">
              <div className="footer-col">
                <h4>Explore</h4>
                <Link to={REGISTER}>Register</Link>
                <a href="https://rhapsodycrusades.org/resources" target="_blank" rel="noreferrer">Resources</a>
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
    </div>
  );
}
