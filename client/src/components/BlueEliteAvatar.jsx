import * as React from "react";
import { Link, useSearchParams } from "react-router-dom";
import anime from "animejs/lib/anime.es.js";
import { ArrowUpRight, CalendarDays, Globe2 } from "lucide-react";
import { AvatarFramer } from "@/components/AvatarFramer";
import { Button } from "@/components/ui/button";
import "../landing.css";

const FALLBACK_FRAME = "/notc-avatar-frame.jpg";

export function BlueEliteAvatar() {
  const [params] = useSearchParams();
  const rootRef = React.useRef(null);
  const isNew = params.get("new") === "1";
  const countryName = params.get("name") || "";
  const code = (params.get("country") || "").trim().toUpperCase();
  const frameSrc = code ? `/country-avatars/${code}.jpg` : FALLBACK_FRAME;

  React.useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    anime({
      targets: root.querySelectorAll("[data-avatar-reveal]"),
      opacity: [0, 1],
      translateY: [28, 0],
      filter: ["blur(10px)", "blur(0px)"],
      easing: "easeOutExpo",
      duration: 900,
      delay: anime.stagger(120, { start: 80 }),
    });
  }, []);

  return (
    <div ref={rootRef} className="reg-page blue-elite-avatar-page">
      <header className="fixed inset-x-0 top-4 z-50 px-4">
        <div className="reg-header mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full pl-3 pr-5 backdrop-blur-md">
          <Link to="/blue-elite" className="flex min-w-0 items-center gap-2.5">
            <img src="/logo.png" alt="" className="h-8 w-auto" />
            <span className="hidden truncate text-sm font-semibold text-[#14163b] sm:block">Loveworld Blue Elite — Campaign Avatar</span>
          </Link>
          <Link to="/blue-elite" className="reg-header-link shrink-0 text-sm font-semibold">
            Blue Elite landing
          </Link>
        </div>
      </header>

      <main className="avatar-shell mx-auto max-w-6xl">
        <section className="avatar-hero" data-avatar-reveal style={{ opacity: 0 }}>
          <div className="avatar-hero-copy">
            <p className="reg-eyebrow text-sm font-semibold uppercase tracking-[0.06em]">
              Loveworld Kingdom Blue-Elite
            </p>
            <h1 className="reg-title mt-4 text-4xl leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              {isNew ? "Registered. Now claim your avatar." : "Blue-Elite Campaign Avatar"}
            </h1>
            <p className="mt-5 max-w-xl text-lg font-medium text-white">
              {countryName ? `I have registered a crusade for ${countryName}!` : "I have registered a crusade for my nation!"}
            </p>
            <p className="mt-3 max-w-lg text-base leading-7 text-indigo-100">
              The Blue-Elite aren’t left out of the invasion. Put your country on your display picture with your own
              photo in the frame, and show the kingdom you’re in the field.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/20 pt-7 text-sm">
              <p className="flex gap-3">
                <CalendarDays className="size-5 shrink-0 text-[#efe89a]" />
                <span>
                  <strong className="block text-white">Friday, August 28, 2026</strong>
                  <span className="text-indigo-200">A Night of a Thousand Crusades</span>
                </span>
              </p>
              <p className="flex gap-3">
                <Globe2 className="size-5 shrink-0 text-[#efe89a]" />
                <span>
                  <strong className="block text-white">{countryName || "Every nation, every continent"}</strong>
                  <span className="text-indigo-200">Every nation. Every soul. You’re not left out.</span>
                </span>
              </p>
            </div>
          </div>
          <div className="avatar-hero-media">
            <img src="/PM.jpeg" alt="Night of a Thousand Crusades campaign avatar" />
          </div>
          <div className="avatar-hero-glow" aria-hidden="true" />
        </section>

        <section className="reg-card avatar-tool" data-avatar-reveal style={{ opacity: 0 }}>
          <AvatarFramer frameSrc={frameSrc} fallbackSrc={FALLBACK_FRAME} downloadName="blue-elite-avatar.png" />
        </section>

        <section className="avatar-cta" data-avatar-reveal style={{ opacity: 0 }}>
          <div>
            <p className="text-sm font-semibold text-[#efe89a]">Not registered your crusade yet?</p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-indigo-100">
              Register your one confirmed crusade with your country, then come back and claim your campaign avatar.
            </p>
          </div>
          <Button asChild size="lg" className="rounded-full bg-white px-6 text-indigo-950 hover:bg-indigo-50">
            <Link to="/blue-elite/register">
              Register your crusade <ArrowUpRight />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}