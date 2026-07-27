import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import "../landing.css";

// Loveworld Blue Elite staff registration landing — a standalone surface,
// deliberately separate from the public /crusade-registration campaign page.
// Same visual language (reg-page / reg-card / reg-header) so staff recognise
// the form, but its own header copy and CTA. Uses the app's standard Button
// (not the campaign-only .reg-btn classes, which are scoped to .landing-page).

const REGISTER = "/blue-elite/register";

export function BlueEliteLanding() {
  const navigate = useNavigate();
  return (
    <div className="reg-page">
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-3xl items-center justify-between rounded-full pl-3 pr-4 backdrop-blur-md">
          <Link to="/blue-elite" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Loveworld Blue Elite" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold sm:block">Loveworld Blue Elite — Crusade Registration</span>
          </Link>
        </div>
      </header>

      <main className="reg-main">
        <div className="reg-card space-y-8 pb-24 text-center">
          <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.35px]">Loveworld Blue Elite Staff</p>
          <h1 className="reg-title text-4xl tracking-[-0.9px] sm:text-5xl">
            Register your crusades.
          </h1>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Button type="button" size="lg" onClick={() => navigate(REGISTER)}>
              Register your crusades <ArrowRight />
            </Button>
          </div>

          <div className="grid gap-4 pt-8 text-left sm:grid-cols-3">
            {[
              { n: "1", t: "Identify your team", d: "Pick your zone, group and church, and tell us your department." },
              { n: "2", t: "Add each crusade", d: "One row per crusade — type, date, venue, expected attendance, ministers." },
              { n: "3", t: "Submit", d: "Your crusades join the Blue Elite tally and become visible to the coordinator." },
            ].map((s) => (
              <div key={s.n} className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
                <div className="mb-2 grid size-7 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{s.n}</div>
                <div className="font-medium">{s.t}</div>
                <p className="mt-1 text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
