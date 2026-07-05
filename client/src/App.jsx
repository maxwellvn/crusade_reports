import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Outlet, useLocation } from "react-router-dom";
import { ReportForm } from "@/components/ReportForm";
import { Dashboard } from "@/components/Dashboard";
import { WidgetDetail } from "@/components/WidgetDetail";
import { CrusadesTable } from "@/components/CrusadesTable";
import { RegistrationsLive } from "@/components/RegistrationsLive";
import { RegistrationsTable } from "@/components/RegistrationsTable";
import { ZoneLinks } from "@/components/ZoneLinks";
import { ZonePortal } from "@/components/ZonePortal";
import { Landing } from "@/components/Landing";
import { NotFound } from "@/components/NotFound";
import { AdminGate } from "@/components/AdminGate";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const BRAND = "Rhapsody End-Time Teaching Crusades";

// Per-route document title (first match wins; order matters for prefixes).
const PAGE_TITLES = [
  [/^\/$/, "A Night of a Thousand Crusades"],
  [/^\/crusade-registration\/register/, "Register your crusades"],
  [/^\/crusade-registration/, "A Night of a Thousand Crusades"],
  [/^\/report/, "Report a crusade"],
  [/^\/dashboard\/zone-links/, "Zone links"],
  [/^\/dashboard\/widget/, "Dashboard"],
  [/^\/dashboard/, "Dashboard"],
  [/^\/crusades/, "All crusades"],
  [/^\/registrations\/live/, "Live registrations"],
  [/^\/registrations/, "Registrations"],
  [/^\/zone\//, "Zone portal"],
];

function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = PAGE_TITLES.find(([re]) => re.test(pathname));
    document.title = `${match ? match[1] : "Page not found"} — ${BRAND}`;
  }, [pathname]);
  return null;
}

const navLink = ({ isActive }) =>
  cn(
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
  );

// Shared header shell. Surfaces are deliberately separate — the report form,
// the admin dashboards and the public campaign pages never cross-link; each
// audience gets only its own URLs.
function Shell({ subtitle, links }) {
  const [logoOk, setLogoOk] = useState(true);
  return (
    <div className="min-h-screen">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
          {logoOk && (
            <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" onError={() => setLogoOk(false)} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">Rhapsody End-Time Teaching Crusades</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>
          </div>
          {links.length > 0 && (
            // On phones the nav wraps to its own row and scrolls sideways if needed.
            <nav className="flex gap-1 max-sm:w-full max-sm:overflow-x-auto max-sm:whitespace-nowrap sm:ml-auto sm:shrink-0">
              {links.map(([to, label, end]) => (
                <NavLink key={to} to={to} end={end} className={navLink}>{label}</NavLink>
              ))}
            </nav>
          )}
        </div>
      </header>
      <main className="px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TitleManager />
      <Routes>
        {/* Public campaign surface — self-contained pages, no app chrome */}
        <Route path="/" element={<Landing />} />
        <Route path="/crusade-registration" element={<Landing />} />
        <Route path="/crusade-registration/register" element={<RegistrationForm />} />

        {/* Zone capability-link dashboards — self-contained, token-scoped */}
        <Route path="/zone/:token" element={<ZonePortal />} />

        {/* Reporting surface */}
        <Route element={<Shell subtitle="Capture crusade outcomes across zones, groups, churches and networks." links={[]} />}>
          <Route path="/report" element={<ReportForm />} />
        </Route>

        {/* Admin surface — everything inside requires the admin key */}
        <Route element={<AdminGate><Shell subtitle="Crusade analytics and records."
          links={[["/", "Home", true], ["/dashboard", "Dashboard", true], ["/crusades", "All crusades"], ["/registrations", "Registrations", true], ["/registrations/live", "Live"], ["/dashboard/zone-links", "Zone links"]]} /></AdminGate>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/widget/:id" element={<WidgetDetail />} />
          <Route path="/crusades" element={<CrusadesTable />} />
          <Route path="/registrations" element={<RegistrationsTable />} />
          <Route path="/registrations/live" element={<RegistrationsLive />} />
          <Route path="/dashboard/zone-links" element={<ZoneLinks />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
