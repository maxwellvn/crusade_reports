import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, Radio, UsersRound } from "lucide-react";
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
    <div className="reg-page blue-elite-landing">
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-3xl items-center justify-between rounded-full pl-3 pr-4 backdrop-blur-md">
          <Link to="/blue-elite" className="flex items-center gap-2.5">
            <img src="/logo.png" alt="Loveworld Blue Elite" className="h-8 w-auto" />
            <span className="hidden text-sm font-semibold sm:block">Loveworld Blue Elite — Crusade Registration</span>
          </Link>
        </div>
      </header>

      <main className="blue-elite-landing-main mx-auto grid max-w-6xl items-stretch gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,.85fr)]">
        <section className="blue-elite-landing-lead flex flex-col justify-between px-6 py-14 text-white sm:px-10 sm:py-20 lg:px-14"><div><p className="text-sm font-semibold text-[#efe89a]">Loveworld Blue Elite Staff</p><h1 className="mt-5 max-w-3xl text-5xl font-medium leading-[.98] tracking-[-0.03em] sm:text-7xl">The Loveworld Kingdom Blue-Elite aren’t left out.</h1><p className="mt-7 max-w-xl text-base leading-7 text-indigo-100">Register each confirmed crusade individually so plans can be coordinated and campaign progress followed accurately.</p><Button type="button" size="lg" className="mt-9 rounded-full bg-white px-6 text-indigo-950 hover:bg-indigo-50" onClick={() => navigate(REGISTER)}>Start registration <ArrowRight /></Button></div><p className="mt-16 max-w-xl border-t border-white/25 pt-6 text-sm leading-6 text-indigo-100">Your progress is saved in this browser as you work, so you can revisit it anytime.</p></section>
        <section className="bg-white px-6 py-12 sm:px-10 sm:py-16 lg:px-12 lg:py-20"><p className="text-sm font-semibold text-indigo-700">Before you begin</p><h2 className="mt-3 text-3xl font-normal tracking-[-0.03em] text-slate-950">Have your crusade’s details ready.</h2><div className="mt-10 border-y border-slate-200">{[
          [UsersRound, "Personal details", "Zone, group, church, department, and your contact details."],
          [Radio, "Your one crusade", "Crusade type, name, date, venue, location, expected attendance, and ministers."],
          [Check, "One final review", "Check the details before sending your crusade to the campaign record."],
        ].map(([Icon, title, copy]) => <div key={title} className="grid grid-cols-[2.5rem_1fr] gap-4 border-b border-slate-200 py-6 last:border-0"><span className="grid size-9 place-items-center rounded-full bg-indigo-50 text-indigo-700"><Icon className="size-4" /></span><div><h3 className="text-base font-semibold text-slate-950">{title}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p></div></div>)}</div></section>
      </main>
    </div>
  );
}
