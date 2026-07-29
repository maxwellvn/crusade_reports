import * as React from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJSON } from "@/lib/api";

const AdminContext = React.createContext(null);
export const useAdmin = () => React.useContext(AdminContext);

export function AdminGate({ children }) {
  const [state, setState] = React.useState("checking");
  const [message, setMessage] = React.useState("");
  const [admin, setAdmin] = React.useState(null);

  React.useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("auth_error");
    if (error) setMessage(error.replaceAll("_", " "));
    getJSON("/auth/me").then((user) => { setAdmin(user); setState("open"); }).catch(() => setState("locked"));
  }, []);

  if (state === "open") return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;
  if (state === "checking") return null;

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-slate-200"><div className="mx-auto flex max-w-6xl items-center px-4 py-4 sm:px-6"><a href="/" aria-label="A Night of a Thousand Crusades home"><img src="/logo.png" alt="" className="h-11 w-auto" /></a><a href="/" className="ml-auto text-sm font-semibold text-slate-700 hover:text-slate-950">Return home</a></div></header>
      <main className="mx-auto grid min-h-[calc(100vh-77px)] max-w-6xl lg:grid-cols-[minmax(0,1fr)_28rem]">
        <section className="flex flex-col justify-between bg-slate-950 px-6 py-12 text-white sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <div><p className="text-sm font-semibold text-blue-300">Campaign administration</p><h1 className="mt-5 max-w-2xl text-4xl font-normal leading-[1.03] tracking-[-0.03em] sm:text-6xl">The work continues behind the public campaign.</h1><p className="mt-6 max-w-xl text-base leading-7 text-slate-300">Review registrations, reports, mission nations, resources, and operational progress from one protected workspace.</p></div>
          <div className="mt-16 flex items-start gap-3 border-t border-slate-700 pt-6 text-sm text-slate-300"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-300" /><p>Access is limited to approved KingsChat accounts. Your existing dashboard permissions apply after sign-in.</p></div>
        </section>
        <section className="flex items-center px-6 py-12 sm:px-10 lg:py-20"><div className="w-full"><span className="grid size-11 place-items-center rounded-full bg-blue-50 text-blue-700"><LockKeyhole className="size-5" /></span><h2 className="mt-8 text-3xl font-normal tracking-[-0.03em] text-slate-950">Sign in to the dashboard.</h2><p className="mt-3 text-sm leading-6 text-slate-600">Continue with the KingsChat account approved for campaign administration.</p>
          {message && <div role="alert" className="mt-6 border-y border-amber-300 bg-amber-50 py-3 text-sm text-amber-900"><p className="font-semibold">Sign-in could not continue</p><p className="mt-1">{message}</p></div>}
          <Button asChild className="mt-8 h-12 w-full rounded-full"><a href="/api/auth/kingschat/login">Continue with KingsChat <ArrowRight /></a></Button>
          <p className="mt-5 text-xs leading-5 text-slate-500">If your account has not been approved, contact the campaign administrator before signing in.</p>
        </div></section>
      </main>
    </div>
  );
}
