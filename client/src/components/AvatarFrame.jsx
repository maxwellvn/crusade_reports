import { Link } from "react-router-dom";
import { ArrowUpRight, CalendarDays, Globe2 } from "lucide-react";
import { AvatarFramer } from "@/components/AvatarFramer";
import { Button } from "@/components/ui/button";

const REGISTER = "/crusade-registration/register";

export function AvatarFrame() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4 sm:px-6">
          <Link to="/" aria-label="A Night of a Thousand Crusades home">
            <img src="/logo.png" alt="" className="h-11 w-auto" />
          </Link>
          <span className="hidden min-w-0 truncate text-sm font-semibold text-slate-950 sm:block">
            Campaign Avatar
          </span>
          <Link to="/" className="ml-auto shrink-0 text-sm font-semibold text-slate-700 hover:text-slate-950">
            Return home
          </Link>
        </div>
      </header>

      <section className="border-b border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto grid max-w-6xl lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-center">
          <div className="px-4 py-12 sm:px-6 sm:py-20">
            <h1 className="max-w-5xl text-4xl font-normal leading-[1.02] tracking-[-0.035em] sm:text-6xl">
              <span className="mb-4 block text-sm font-semibold leading-5 tracking-normal text-blue-300">
                NIGHT OF A THOUSAND CRUSADES (NOTC) —
              </span>
              CAMPAIGN AVATAR
            </h1>
            <p className="mt-6 max-w-3xl text-lg font-medium text-white">
              I have registered a Rhapsody End-Time Crusade!
            </p>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-300">
              Add your photo to the campaign avatar and announce your participation. Set it as your display picture and
              invite others to join the massive invasion with the gospel.
            </p>
            <div className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-white/20 pt-7 text-sm">
              <p className="flex gap-3">
                <CalendarDays className="size-5 shrink-0 text-blue-300" />
                <span>
                  <strong className="block text-white">Friday, August 28, 2026</strong>
                  <span className="text-slate-400">A Night of a Thousand Crusades</span>
                </span>
              </p>
              <p className="flex gap-3">
                <Globe2 className="size-5 shrink-0 text-blue-300" />
                <span>
                  <strong className="block text-white">Every nation, every continent</strong>
                  <span className="text-slate-400">Reaching every nation. Reaching every soul.</span>
                </span>
              </p>
            </div>
          </div>
          <div className="bg-white lg:mr-6">
            <img
              src="/notc-avatar-frame.jpg"
              alt="Night of a Thousand Crusades campaign avatar frame"
              className="aspect-square w-full object-contain"
            />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <AvatarFramer />

        <section className="mt-16 border-y border-blue-200 bg-blue-50 px-5 py-7 sm:px-8">
          <p className="text-sm font-semibold text-blue-950">Not registered a crusade yet?</p>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-900">
            Sponsor and host a Rhapsody End-Time Teaching Crusade, then come back and claim your avatar.
          </p>
          <Button asChild className="mt-5 rounded-full">
            <Link to={REGISTER}>
              Register your crusades <ArrowUpRight />
            </Link>
          </Button>
        </section>
      </main>
    </div>
  );
}
