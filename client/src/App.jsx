import { useState } from "react";
import { BrowserRouter, Routes, Route, NavLink, Outlet } from "react-router-dom";
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
import { RegistrationForm } from "@/components/RegistrationForm";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

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
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4">
          {logoOk && (
            <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" onError={() => setLogoOk(false)} />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">Rhapsody End-Time Crusades</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>
          </div>
          {links.length > 0 && (
            <nav className="ml-auto flex shrink-0 gap-1">
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

        {/* Admin surface */}
        <Route element={<Shell subtitle="Crusade analytics and records."
          links={[["/", "Home", true], ["/dashboard", "Dashboard", true], ["/crusades", "All crusades"], ["/registrations", "Registrations", true], ["/registrations/live", "Live"], ["/dashboard/zone-links", "Zone links"]]} />}>
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
