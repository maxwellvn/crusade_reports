import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, Search } from "lucide-react";
import "../landing.css";

const REGISTER = "/crusade-registration/register";

const HERO_PHOTOS = [
  { src: "/campaign/aac-worship.png", alt: "Families worshipping at a Rhapsody crusade", className: "aac-board-photo-main", width: 1024, height: 521 },
  { src: "/campaign/aac-baptism.png", alt: "A new believer after water baptism", className: "aac-board-photo-baptism", width: 1024, height: 558 },
  { src: "/campaign/aac-believers.png", alt: "Women receiving prayer and Rhapsody of Realities", className: "aac-board-photo-believers", width: 1024, height: 534 },
];

function RegisterButton({ className = "" }) {
  const navigate = useNavigate();
  const labelRef = React.useRef(null);
  const [igniting, setIgniting] = React.useState(false);

  const onClick = (event) => {
    if (igniting) return;
    event.preventDefault();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      navigate(REGISTER);
      return;
    }
    const label = labelRef.current;
    if (label) {
      label.style.maxWidth = `${label.scrollWidth}px`;
      void label.offsetWidth;
      requestAnimationFrame(() => { label.style.maxWidth = "0px"; });
    }
    setIgniting(true);
    window.setTimeout(() => navigate(REGISTER), 900);
  };

  return (
    <Link
      to={REGISTER}
      onClick={onClick}
      aria-label="Register a crusade"
      className={`aac-register-button${igniting ? " is-igniting" : ""} ${className}`}
    >
      <span ref={labelRef} className="aac-register-label">Register a crusade</span>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

export function AngelsLanding() {
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.classList.add(reducedMotion ? "aac-motion-off" : "aac-ready");
    if (reducedMotion || !("IntersectionObserver" in window)) {
      root.querySelectorAll("[data-aac-reveal]").forEach((node) => node.classList.add("is-visible"));
      return undefined;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8%" });
    root.querySelectorAll("[data-aac-reveal]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="aac-landing" ref={rootRef}>
      <header className="aac-nav">
        <Link to="/" className="aac-brand" aria-label="Angels at Christmas home">
          <img src="/angels-at-christmas-emblem.png" alt="" />
          <span><strong>Angels at Christmas</strong><small>Celebration Crusades</small></span>
        </Link>
        <nav aria-label="Campaign links">
          <Link to="/find-my-crusade">Find my crusade</Link>
          <Link to="/report">Submit a report</Link>
          <RegisterButton className="aac-nav-register" />
        </nav>
      </header>

      <main>
        <section className="aac-hero" aria-labelledby="aac-title">
          <div className="aac-stars" aria-hidden="true" />
          <div className="aac-globe" aria-hidden="true"><img src="/assets/globe.webp" alt="" /></div>
          <div className="aac-warmth aac-warmth-red" aria-hidden="true" />
          <div className="aac-warmth aac-warmth-green" aria-hidden="true" />

          <div className="aac-hero-copy">
            <p className="aac-kicker">Rhapsody End-Time Teaching Crusades presents</p>
            <h1 id="aac-title">
              <span>Angels at</span>
              <span className="aac-gold-word">Christmas</span>
              <span className="aac-title-tail">Celebration Crusades</span>
            </h1>
            <p className="aac-lead">This December, take the Gospel to your world. Host a celebration crusade, share the joy of Christ, and give Rhapsody of Realities to everyone in your community.</p>
            <div className="aac-actions">
              <div className="aac-date"><CalendarDays /><span><small>Campaign dates</small><strong>1 to 31 December 2026</strong></span></div>
              <RegisterButton />
            </div>
          </div>

          <div className="aac-event-board" aria-label="Scenes from Rhapsody crusades">
            <div className="aac-board-rail">
              <img className="aac-board-emblem" src="/angels-at-christmas-emblem.png" alt="Angels at Christmas Celebration Crusades" width="1196" height="1315" />
              <div className="aac-board-date" aria-hidden="true"><span>Campaign dates</span><strong>1–31</strong><small>December 2026</small></div>
            </div>
            <div className="aac-board-gallery">
              <figure className={`aac-board-photo ${HERO_PHOTOS[0].className}`}>
                <img src={HERO_PHOTOS[0].src} alt={HERO_PHOTOS[0].alt} width={HERO_PHOTOS[0].width} height={HERO_PHOTOS[0].height} fetchPriority="high" />
              </figure>
              <div className="aac-board-supporting">
                {HERO_PHOTOS.slice(1).map(({ src, alt, className, width, height }) => (
                  <figure className={`aac-board-photo ${className}`} key={src}>
                    <img src={src} alt={alt} width={width} height={height} />
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="aac-journey" aria-labelledby="aac-journey-title">
          <div className="aac-journey-heading" data-aac-reveal>
            <p>One crusade, one complete record.</p>
            <h2 id="aac-journey-title">Plan it now. Return when it holds. Record what God did.</h2>
          </div>

          <div className="aac-journey-layout">
            <ol className="aac-route" data-aac-reveal>
              <li>
                <span className="aac-route-icon"><CheckCircle2 aria-hidden="true" /></span>
                <div><small>Before the crusade</small><h3>Register the plan</h3><p>Add each confirmed crusade taking place from 1 to 31 December 2026.</p><RegisterButton className="aac-route-register" /></div>
              </li>
              <li>
                <span className="aac-route-icon"><Search aria-hidden="true" /></span>
                <div><small>When you return</small><h3>Find your crusade</h3><p>Use your email address or KingsChat username to open your registered crusades.</p><Link className="aac-text-link" to="/find-my-crusade">Find my crusade <ArrowRight /></Link></div>
              </li>
              <li>
                <span className="aac-route-icon"><FileText aria-hidden="true" /></span>
                <div><small>After it holds</small><h3>Report the outcome</h3><p>Submit attendance, salvations, photographs, and the testimony from the crusade.</p><Link className="aac-text-link" to="/report">Submit a report <ArrowRight /></Link></div>
              </li>
            </ol>

            <aside className="aac-journey-note" data-aac-reveal>
              <p>Everything you need is connected to the same campaign record, from registration to the final report.</p>
              <div><span>Campaign window</span><strong>1 to 31<br />December 2026</strong></div>
            </aside>
          </div>
        </section>

        <section className="aac-closing" aria-labelledby="aac-closing-title">
          <figure data-aac-reveal><img src="/campaign/aac-ministry.png" alt="A minister praying with crusade attendees" width="1024" height="540" /></figure>
          <div className="aac-closing-copy" data-aac-reveal>
            <img src="/angels-at-christmas-emblem.png" alt="" />
            <p>Angels at Christmas, December 2026</p>
            <h2 id="aac-closing-title">Let every community hear the good news of Christmas.</h2>
            <RegisterButton />
          </div>
        </section>
      </main>

      <footer className="aac-footer"><span>© 2026 Rhapsody End-Time Teaching Crusades</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://rhapsodycrusades.org">Main website</a></div></footer>
    </div>
  );
}
