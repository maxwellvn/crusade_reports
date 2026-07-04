import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";

// Public campaign page — A Night of a Thousand Crusades. Runwai voice:
// cinematic full-bleed photography in scrim, eyebrow + display lockups,
// monochrome type, black/white pill CTAs. All CTAs land on the registration form.

const REGISTER = "/crusade-registration/register";

const CONTACTS = [
  ["USA", ["+1 (469) 656-1284", "+1 800 620 8522"]],
  ["UK", ["+44 (0) 170 855 6604"]],
  ["Canada", ["+1 (647) 797-8077"]],
  ["South Africa", ["+27 1132 60971-2"]],
  ["Nigeria", ["+234 201 8888 186"]],
];

function Eyebrow({ children, light }) {
  return <p className={`text-sm font-medium uppercase tracking-[0.35px] ${light ? "text-white/70" : "text-muted-foreground"}`}>{children}</p>;
}

function PillCta({ to, children, onDark, className = "" }) {
  const style = onDark ? "bg-white text-black hover:bg-white/90" : "bg-primary text-primary-foreground hover:bg-primary/85";
  return (
    <Link to={to} className={`inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-semibold transition-all duration-200 active:scale-[0.98] ${style} ${className}`}>
      {children}
    </Link>
  );
}

export function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Pill header */}
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full border border-white/10 bg-black/55 pl-3 pr-2 backdrop-blur-md">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Rhapsody End-Time Crusades" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold text-white sm:block">Rhapsody End-Time Crusades</span>
          </Link>
          <div className="flex items-center gap-2">
            <a href="https://rhapsodycrusades.org/resources" target="_blank" rel="noreferrer"
              className="hidden h-10 items-center rounded-full px-4 text-sm font-semibold text-white/80 transition-colors hover:text-white sm:inline-flex">
              Resources
            </a>
            <a href="https://rhapsodycrusades.org/sponsor" target="_blank" rel="noreferrer"
              className="hidden h-10 items-center rounded-full border border-white/30 px-4 text-sm font-semibold text-white transition-colors hover:border-white sm:inline-flex">
              Donate
            </a>
            <Link to={REGISTER}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-black transition-all duration-200 hover:bg-white/90 active:scale-[0.98]">
              Register Now <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Cinematic hero */}
      <section className="relative flex min-h-[94vh] items-end overflow-hidden bg-black">
        <img src="/campaign/DSC_6044.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-black/25" />
        <div className="relative mx-auto w-full max-w-5xl px-6 pb-20 pt-44">
          <div className="max-w-3xl space-y-6 animate-step-in motion-reduce:animate-none">
            <h1 className="text-5xl leading-[1.02] tracking-[-1.2px] text-white sm:text-6xl md:text-7xl">
              A Night of a<br />Thousand Crusades.
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">
              One night. Thousands of crusades, held simultaneously across cities and nations of the world.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <PillCta to={REGISTER} onDark>Register your crusades <ArrowRight className="size-4" /></PillCta>
              <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-white/40 px-7 text-sm font-semibold text-white transition-colors hover:border-white">
                rhapsodycrusades.org <ArrowUpRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className="mx-auto max-w-5xl px-6 py-24">
          <Eyebrow>How to register</Eyebrow>
          <h2 className="mt-4 text-4xl tracking-[-0.9px]">Three steps. A few minutes.</h2>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-3">
            {[
              ["Tell us who you are", "Register as a zone, group, church or network, and pick your country and plan date."],
              ["Break it down by type", "Mega crusades, street crusades, medical outreaches… state how many of each — and the cities, if you know them."],
              ["Submit and be counted", "Your crusades join the global tally instantly and appear on the live map."],
            ].map(([title, body], i) => (
              <div key={title} className="bg-card p-8">
                <span className="grid size-9 place-items-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{i + 1}</span>
                <h3 className="mt-5 text-xl tracking-tight">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10">
            <PillCta to={REGISTER}>Start registration <ArrowRight className="size-4" /></PillCta>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t">
        <div className="mx-auto grid max-w-5xl gap-14 px-6 py-24 md:grid-cols-2">
          <div className="space-y-5">
            <Eyebrow>Ready to Join Us?</Eyebrow>
            <h2 className="text-4xl tracking-[-0.9px]">Connect with us today.</h2>
            <p className="leading-relaxed text-muted-foreground">
              Be part of something extraordinary. Whether you have questions, want to participate, or need
              assistance, we’re here for you — we’re excited to hear from you and answer any questions you
              may have.
            </p>
            <div className="space-y-1.5 pt-2 text-sm">
              <p><a href="mailto:info@rhapsodycrusades.org" className="font-semibold underline-offset-4 hover:underline">info@rhapsodycrusades.org</a></p>
              <p><a href="tel:+14696561284" className="hover:underline">+1 (469) 656-1284</a></p>
              <p className="text-muted-foreground">KingsChat: <span className="text-foreground">rorcrusades1</span></p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.35px] text-muted-foreground">Additional Contact Numbers</p>
            <dl className="mt-4 divide-y">
              {CONTACTS.map(([region, numbers]) => (
                <div key={region} className="flex items-baseline justify-between gap-4 py-3">
                  <dt className="text-sm text-muted-foreground">{region}</dt>
                  <dd className="space-y-0.5 text-right text-sm tabular-nums">
                    {numbers.map((n) => <p key={n}>{n}</p>)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Closing CTA + footer */}
      <footer className="bg-[#0c0c0c] text-white">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <h2 className="mx-auto max-w-2xl text-4xl tracking-[-0.9px] sm:text-5xl">Reaching the whole world in one night.</h2>
          <div className="mt-8">
            <PillCta to={REGISTER} onDark>Register your crusades <ArrowRight className="size-4" /></PillCta>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="" className="h-7 w-auto" />
              <span className="text-sm text-white/70">Rhapsody End-Time Crusades</span>
            </div>
            <div className="flex items-center gap-5 text-sm text-white/60">
              <a href="https://rhapsodycrusades.org" target="_blank" rel="noreferrer" className="hover:text-white">rhapsodycrusades.org</a>
              <a href="https://rhapsodycrusades.org/sponsor" target="_blank" rel="noreferrer" className="hover:text-white">Donate</a>
              <a href="mailto:info@rhapsodycrusades.org" className="hover:text-white">info@rhapsodycrusades.org</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
