import React from "react";
import { Link } from "react-router-dom";
import Lenis from "lenis";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpenText,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  ListPlus,
  Mail,
  MapPin,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import "../landing.css";

const REGISTER = "/crusade-registration/register";

const HERO_PHOTOS = [
  { src: "/campaign/aac-worship.png", alt: "Families worshipping together at a Rhapsody crusade", className: "aac-print-worship", focus: "74% 46%" },
  { src: "/campaign/aac-baptism.png", alt: "A new believer after water baptism", className: "aac-print-baptism", focus: "54% 34%" },
  { src: "/campaign/aac-ministry.png", alt: "Ministers praying with crusade attendees", className: "aac-print-ministry", focus: "72% 48%" },
  { src: "/campaign/aac-believers.png", alt: "Women receiving prayer and Rhapsody of Realities", className: "aac-print-believers", focus: "72% 18%" },
];

function RegisterButton({ compact = false, dark = false, className = "" }) {
  return (
    <Link to={REGISTER} className={`aac-cta${compact ? " aac-cta-compact" : ""}${dark ? " aac-cta-dark" : ""} ${className}`}>
      <span className="aac-cta-body">Register a crusade</span>
      <span className="aac-cta-seal" aria-hidden="true"><ArrowUpRight /></span>
    </Link>
  );
}

function TextLink({ to, children }) {
  return <Link className="aac-text-link" to={to}>{children}<ArrowRight aria-hidden="true" /></Link>;
}

const JOURNEY = [
  { icon: CheckCircle2, step: "Before the crusade", title: "Register the plan", copy: "Add every confirmed celebration crusade taking place from 1 to 31 December 2026.", action: <RegisterButton compact /> },
  { icon: Search, step: "When you return", title: "Find your crusade", copy: "Use your email address or KingsChat username to return to every crusade you registered.", action: <TextLink to="/find-my-crusade">Find my crusade</TextLink> },
  { icon: FileText, step: "After it holds", title: "Report the outcome", copy: "Submit attendance, salvations, photographs and the testimony from your crusade.", action: <TextLink to="/report">Submit a report</TextLink> },
];

const PURPOSE = [
  { number: "01", icon: Sparkles, title: "Celebrate Christ", copy: "Gather your community around the good news and joy of Christmas." },
  { number: "02", icon: BookOpenText, title: "Give Rhapsody", copy: "Put Rhapsody of Realities into the hands of everyone you reach." },
  { number: "03", icon: MapPin, title: "Reach your world", copy: "Take the celebration beyond a venue and into cities, streets and communities." },
];

const REGISTRATION_STEPS = [
  {
    icon: UserRound,
    label: "Who you are",
    title: "Tell us who is registering",
    copy: "Choose your organisation type and add the contact details for the person coordinating the crusades.",
  },
  {
    icon: ListPlus,
    label: "Your crusades",
    title: "Add every confirmed crusade",
    copy: "Select the crusade type, then add its date, venue, city, expected attendance and minister details.",
  },
  {
    icon: ClipboardCheck,
    label: "Review",
    title: "Check and submit",
    copy: "Review the complete registration, correct anything that needs attention and submit it to the AAC campaign.",
  },
];

function useCampaignMotion(rootRef) {
  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const revealNodes = [...root.querySelectorAll("[data-aac-reveal]")];
    root.classList.add(reducedMotion ? "aac-motion-off" : "aac-motion-ready");

    let observer;
    if (!reducedMotion && "IntersectionObserver" in window) {
      observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -7%" });
      revealNodes.forEach((node) => observer.observe(node));
    } else {
      revealNodes.forEach((node) => node.classList.add("is-visible"));
    }

    const updateScrollScene = () => {
      const hero = root.querySelector(".aac-hero");
      if (!hero) return;
      const heroRect = hero.getBoundingClientRect();
      const progress = Math.max(0, Math.min(1, -heroRect.top / Math.max(heroRect.height, 1)));
      root.style.setProperty("--aac-hero-progress", progress.toFixed(4));
      root.classList.toggle("aac-has-scrolled", window.scrollY > 28);
    };

    updateScrollScene();
    window.addEventListener("scroll", updateScrollScene, { passive: true });
    window.addEventListener("resize", updateScrollScene, { passive: true });

    let lenis;
    let frame;
    if (!reducedMotion && finePointer) {
      lenis = new Lenis({
        duration: 0.8,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        prevent: (node) => node.matches("input, textarea, select") || Boolean(node.closest("[data-lenis-prevent]")),
      });
      const raf = (time) => {
        lenis.raf(time);
        frame = requestAnimationFrame(raf);
      };
      frame = requestAnimationFrame(raf);
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", updateScrollScene);
      window.removeEventListener("resize", updateScrollScene);
      if (frame) cancelAnimationFrame(frame);
      lenis?.destroy();
    };
  }, [rootRef]);
}

export function AngelsLanding() {
  const rootRef = React.useRef(null);
  useCampaignMotion(rootRef);

  return (
    <div className="aac-landing" ref={rootRef}>
      <header className="aac-nav">
        <div className="aac-nav-inner">
          <Link to="/" className="aac-brand" aria-label="Angels at Christmas home">
            <img src="/angels-at-christmas-emblem.png" alt="" />
            <span><strong>Angels at Christmas</strong><small>Celebration Crusades</small></span>
          </Link>
          <nav aria-label="Campaign links">
            <a href="#how-it-works">How it works</a>
            <Link to="/find-my-crusade">Find my crusade</Link>
            <Link to="/report">Submit a report</Link>
            <RegisterButton compact className="aac-nav-register" />
          </nav>
        </div>
      </header>

      <main>
        <section className="aac-hero" aria-labelledby="aac-title">
          <div className="aac-stars" aria-hidden="true" />
          <div className="aac-globe" aria-hidden="true"><img src="/assets/globe.webp" alt="" /></div>
          <div className="aac-light-ribbon" aria-hidden="true" />
          <div className="aac-warmth aac-warmth-red" aria-hidden="true" />
          <div className="aac-warmth aac-warmth-green" aria-hidden="true" />

          <div className="aac-hero-inner">
            <div className="aac-hero-copy">
              <p className="aac-kicker aac-hero-rise">Rhapsody End-Time Teaching Crusades presents</p>
              <h1 id="aac-title">
                <span className="aac-title-line"><span>Angels at</span></span>
                <span className="aac-title-line aac-gold-word"><span>Christmas</span></span>
                <span className="aac-title-line aac-title-tail"><span>Celebration Crusades</span></span>
              </h1>
              <p className="aac-lead aac-hero-rise">This December, take the Gospel to your world. Host a celebration crusade, share the joy of Christ and give Rhapsody of Realities to everyone in your community.</p>
              <div className="aac-actions aac-hero-rise">
                <div className="aac-date"><CalendarDays /><span><small>Throughout</small><strong>December 2026</strong></span></div>
                <RegisterButton />
              </div>
            </div>

            <div className="aac-hero-collage" aria-label="Scenes from Rhapsody crusades">
              {HERO_PHOTOS.map((photo) => (
                <figure className={`aac-hero-print ${photo.className}`} key={photo.src}>
                  <img src={photo.src} alt={photo.alt} style={{ objectPosition: photo.focus }} />
                </figure>
              ))}
              <img className="aac-hero-emblem" src="/angels-at-christmas-emblem.png" alt="Angels at Christmas Celebration Crusades" width="1196" height="1315" />
            </div>
          </div>
          <a className="aac-scroll-cue" href="#invitation"><span>Discover the campaign</span><i aria-hidden="true" /></a>
        </section>

        <section className="aac-invitation" id="invitation" aria-labelledby="aac-invitation-title">
          <div className="aac-invitation-heading" data-aac-reveal>
            <p className="aac-section-kicker">The invitation</p>
            <h2 id="aac-invitation-title">One month.<br />Every community.<br /><span>One clear message.</span></h2>
          </div>
          <div className="aac-invitation-story">
            <figure className="aac-invitation-photo" data-aac-reveal>
              <img src="/campaign/DSC_6044.jpg" alt="A minister sharing the Gospel with a large outdoor crusade audience" />
              <figcaption><span>Take the Gospel</span><span>to your world</span></figcaption>
            </figure>
            <div className="aac-invitation-copy" data-aac-reveal>
              <p>Angels at Christmas turns the celebration season into a coordinated opportunity to reach people where they are.</p>
              <p>Bring your community together, minister the Word, share Rhapsody of Realities and keep one clear record of every life reached.</p>
              <RegisterButton compact />
            </div>
          </div>
        </section>

        <section className="aac-register-guide" id="how-it-works" aria-labelledby="aac-register-guide-title">
          <div className="aac-register-guide-head" data-aac-reveal>
            <p className="aac-section-kicker">How to register</p>
            <h2 id="aac-register-guide-title">Three clear steps.<br /><span>A few focused minutes.</span></h2>
            <p>The form saves your progress in this browser while you work, so you can complete every confirmed crusade carefully.</p>
          </div>
          <ol className="aac-register-guide-steps" data-aac-reveal>
            {REGISTRATION_STEPS.map(({ icon: Icon, label, title, copy }, index) => (
              <li key={title}>
                <div className="aac-guide-step-top">
                  <span className="aac-guide-number">0{index + 1}</span>
                  <span className="aac-guide-icon"><Icon aria-hidden="true" /></span>
                </div>
                <small>{label}</small>
                <h3>{title}</h3>
                <p>{copy}</p>
              </li>
            ))}
          </ol>
          <div className="aac-register-guide-action" data-aac-reveal>
            <RegisterButton />
            <p>Only confirmed crusades scheduled from 1 to 31 December 2026 can be registered.</p>
          </div>
        </section>

        <section className="aac-journey" aria-labelledby="aac-journey-title">
          <div className="aac-journey-heading" data-aac-reveal>
            <p className="aac-section-kicker">One campaign. One complete record.</p>
            <h2 id="aac-journey-title">From the first plan to the final testimony.</h2>
          </div>
          <div className="aac-journey-layout">
            <ol className="aac-route" data-aac-reveal>
              {JOURNEY.map(({ icon: Icon, step, title, copy, action }, index) => (
                <li key={title}>
                  <span className="aac-route-icon"><Icon aria-hidden="true" /></span>
                  <div><small>{step}</small><h3>{title}</h3><p>{copy}</p>{action}</div>
                  <span className="aac-route-number">0{index + 1}</span>
                </li>
              ))}
            </ol>
            <aside className="aac-journey-card" data-aac-reveal>
              <img src="/campaign/aac-believers.png" alt="Crusade attendees receiving ministry and Rhapsody of Realities" />
              <div><span>Campaign window</span><strong>1 to 31<br />December 2026</strong></div>
            </aside>
          </div>
        </section>

        <section className="aac-purpose" aria-labelledby="aac-purpose-title">
          <div className="aac-purpose-head" data-aac-reveal>
            <p className="aac-section-kicker">What every crusade carries</p>
            <h2 id="aac-purpose-title">A celebration with eternal impact.</h2>
          </div>
          <div className="aac-purpose-grid">
            {PURPOSE.map(({ number, icon: Icon, title, copy }) => (
              <article key={title} data-aac-reveal>
                <span className="aac-purpose-number">{number}</span><Icon aria-hidden="true" /><h3>{title}</h3><p>{copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="aac-moments" aria-labelledby="aac-moments-title">
          <div className="aac-moments-copy" data-aac-reveal>
            <p className="aac-section-kicker">Scenes from the mission</p>
            <h2 id="aac-moments-title">The Word shared.<br />Lives changed.<br />Stories recorded.</h2>
            <p>Every photograph can carry the evidence of a community reached and a testimony worth preserving.</p>
            <TextLink to="/report">Report a completed crusade</TextLink>
          </div>
          <div className="aac-moments-gallery" data-aac-reveal>
            <figure className="aac-moment-large"><img src="/campaign/aac-worship.png" alt="Families worshipping at a Rhapsody crusade" /></figure>
            <figure><img src="/campaign/aac-baptism.png" alt="A new believer after water baptism" /></figure>
            <figure><img src="/campaign/aac-ministry.png" alt="Ministers praying with crusade attendees" /></figure>
          </div>
        </section>
      </main>

      <footer className="aac-footer">
        <section className="aac-footer-scene" aria-labelledby="aac-footer-title">
          <img src="/campaign/DSC_6044.jpg" alt="A minister addressing an outdoor crusade audience at night" />
          <div className="aac-footer-shade" aria-hidden="true" />
          <div className="aac-footer-cta" data-aac-reveal>
            <img src="/angels-at-christmas-emblem.png" alt="" />
            <p>Angels at Christmas, December 2026</p>
            <h2 id="aac-footer-title">Let every community hear the good news of Christmas.</h2>
            <RegisterButton dark />
          </div>
        </section>

        <div className="aac-footer-directory">
          <div className="aac-footer-contact">
            <h3>Contact the crusade team</h3>
            <a href="mailto:info@rhapsodycrusades.org"><Mail aria-hidden="true" />info@rhapsodycrusades.org</a>
            <a href="https://kingschat.online/user/rorcrusades1" target="_blank" rel="noreferrer"><img src="/assets/kingschat.webp" alt="" />KingsChat: rorcrusades1</a>
          </div>
          <nav aria-label="Campaign actions"><h3>Campaign</h3><Link to={REGISTER}>Register a crusade</Link><Link to="/find-my-crusade">Find my crusade</Link><Link to="/report">Submit a report</Link></nav>
          <nav aria-label="Information"><h3>Information</h3><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://rhapsodycrusades.org">Main crusades website</a></nav>
        </div>
        <div className="aac-footer-bottom">
          <Link to="/" className="aac-footer-brand"><img src="/angels-at-christmas-emblem.png" alt="" /><span>Angels at Christmas<br /><small>Celebration Crusades</small></span></Link>
          <p>© 2026 Rhapsody End-Time Teaching Crusades. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
