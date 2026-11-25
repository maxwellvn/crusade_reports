import { Link } from "react-router-dom";
import { ArrowRight, CalendarDays, CheckCircle2, FileText, Search } from "lucide-react";
import "../landing.css";

const PRINTS = [
  ["/campaign/aac-worship.png", "Families worshipping at a Rhapsody crusade", "aac-print-one"],
  ["/campaign/aac-baptism.png", "A new believer after water baptism", "aac-print-two"],
  ["/campaign/aac-ministry.png", "Ministers praying with crusade attendees", "aac-print-three"],
  ["/campaign/aac-believers.png", "Women receiving prayer and Rhapsody of Realities", "aac-print-four"],
];

export function AngelsLanding() {
  return (
    <div className="aac-landing">
      <header className="aac-nav">
        <Link to="/" className="aac-brand" aria-label="Angels at Christmas home">
          <img src="/angels-at-christmas-emblem.png" alt="" />
          <span><strong>Angels at Christmas</strong><small>Celebration Crusades</small></span>
        </Link>
        <nav aria-label="Campaign links">
          <Link to="/find-my-crusade">Find my crusade</Link>
          <Link to="/report">Submit a report</Link>
          <Link className="aac-nav-cta" to="/crusade-registration/register">Register <ArrowRight /></Link>
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
            <h1 id="aac-title"><span>Angels at</span><em>Christmas</em><span>Celebration Crusades</span></h1>
            <p className="aac-lead">This December, take the Gospel to your world. Host a celebration crusade, share the joy of Christ and give Rhapsody of Realities to everyone in your community.</p>
            <div className="aac-actions">
              <div className="aac-date"><CalendarDays /><span><small>Throughout</small><strong>December 2026</strong></span></div>
              <Link className="aac-primary" to="/crusade-registration/register">Register a Crusade <ArrowRight /></Link>
            </div>
          </div>

          <div className="aac-collage" aria-label="Scenes from Rhapsody crusades">
            {PRINTS.map(([src, alt, className]) => <figure className={className} key={src}><img src={src} alt={alt} /></figure>)}
            <img className="aac-emblem" src="/angels-at-christmas-emblem.png" alt="Angels at Christmas Celebration Crusades" />
          </div>
        </section>

        <section className="aac-path" aria-labelledby="aac-path-title">
          <div className="aac-path-intro">
            <p className="aac-section-kicker">One campaign. One clear record.</p>
            <h2 id="aac-path-title">From your plan to the final testimony.</h2>
            <p>Every Angels at Christmas crusade stays inside its own campaign record, separate from NOTC.</p>
          </div>
          <div className="aac-steps">
            <article><span>01</span><CheckCircle2 /><h3>Register</h3><p>Add each confirmed crusade scheduled from 1–31 December 2026.</p><Link to="/crusade-registration/register">Start registration <ArrowRight /></Link></article>
            <article><span>02</span><Search /><h3>Find it later</h3><p>Use your email address or KingsChat username to return to your crusades.</p><Link to="/find-my-crusade">Find my crusade <ArrowRight /></Link></article>
            <article><span>03</span><FileText /><h3>Report outcomes</h3><p>After it holds, submit attendance, salvations, evidence and the testimony.</p><Link to="/report">Submit a report <ArrowRight /></Link></article>
          </div>
        </section>

        <section className="aac-closing">
          <img src="/angels-at-christmas-emblem.png" alt="" />
          <div><p>December 1–31, 2026</p><h2>Let every community hear the good news of Christmas.</h2></div>
          <Link className="aac-primary" to="/crusade-registration/register">Register now <ArrowRight /></Link>
        </section>
      </main>

      <footer className="aac-footer"><span>© 2026 Rhapsody End-Time Teaching Crusades</span><div><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://rhapsodycrusades.org">Main website</a></div></footer>
    </div>
  );
}
