import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
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
import { AdminGate, useAdmin } from "@/components/AdminGate";
import { RegistrationForm } from "@/components/RegistrationForm";
import { Settings } from "@/components/Settings";
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
  [/^\/dashboard\/settings/, "Settings"],
  [/^\/dashboard\/widget/, "Reports dashboard"],
  [/^\/dashboard/, "Reports dashboard"],
  [/^\/crusades/, "Reports"],
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
    isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
  );

// Shared header shell. Surfaces are deliberately separate — the report form,
// the admin dashboards and the public campaign pages never cross-link; each
// audience gets only its own URLs.
function Shell({ subtitle, links }) {
  const [logoOk, setLogoOk] = useState(true);
  const admin = useAdmin();
  const visibleLinks = links.filter(([, , , superAdminOnly]) => !superAdminOnly || admin?.is_super_admin);
  return (
    <div className="min-h-screen">
      <header className="border-b border-blue-100 bg-white/95 shadow-sm shadow-blue-100/50 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4">
          {logoOk && (
            <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" onError={() => setLogoOk(false)} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">Rhapsody End-Time Teaching Crusades</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>
          </div>
          {visibleLinks.length > 0 && (
            // On phones the nav wraps to its own row and scrolls sideways if needed.
            <nav className="flex gap-1 max-sm:w-full max-sm:overflow-x-auto max-sm:whitespace-nowrap sm:ml-auto sm:shrink-0">
              {visibleLinks.map(([to, label, end]) => (
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

        {/* /admin lands on the live registrations page */}
        <Route path="/admin" element={<Navigate to="/registrations/live" replace />} />

        {/* Admin surface — everything inside requires an approved KingsChat account */}
        <Route element={<AdminGate><Shell subtitle="Crusade analytics and records."
          links={[["/", "Home", true], ["/registrations/live", "Live"], ["/registrations", "Registrations", true], ["/dashboard", "Reports dashboard", true], ["/crusades", "Reports"], ["/dashboard/zone-links", "Zone links"], ["/dashboard/settings", "Settings", false, true]]} /></AdminGate>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/widget/:id" element={<WidgetDetail />} />
          <Route path="/crusades" element={<CrusadesTable />} />
          <Route path="/registrations" element={<RegistrationsTable />} />
          <Route path="/registrations/live" element={<RegistrationsLive />} />
          <Route path="/dashboard/zone-links" element={<ZoneLinks />} />
          <Route path="/dashboard/settings" element={<Settings />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
