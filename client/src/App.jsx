import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ReportForm } from "@/components/ReportForm";
import { Dashboard } from "@/components/Dashboard";
import { WidgetDetail } from "@/components/WidgetDetail";
import { CrusadesTable } from "@/components/CrusadesTable";
import { EditCrusadePage } from "@/components/EditCrusadePage";
import { RegistrationsLive } from "@/components/RegistrationsLive";
import { RegistrationsTable } from "@/components/RegistrationsTable";
import { ZoneLinks } from "@/components/ZoneLinks";
import { ZonePortal } from "@/components/ZonePortal";
import { Landing } from "@/components/Landing";
import { NotFound } from "@/components/NotFound";
import { AdminGate, useAdmin } from "@/components/AdminGate";
import { RegistrationForm } from "@/components/RegistrationForm";
import { BlueEliteLanding } from "@/components/BlueEliteLanding";
import { BlueEliteRegistrationForm } from "@/components/BlueEliteRegistrationForm";
import { BlueEliteDashboard } from "@/components/BlueEliteDashboard";
import { BlueEliteRegistrationsTable } from "@/components/BlueEliteRegistrationsTable";
import { Settings } from "@/components/Settings";
import { ResourcesLibrary } from "@/components/ResourcesLibrary";
import { ResourcesAdmin } from "@/components/ResourcesAdmin";
import { MissionNationSelection } from "@/components/MissionNationSelection";
import { MissionNationAdmin } from "@/components/MissionNationAdmin";
import { MediaTrainingRegistration } from "@/components/MediaTrainingRegistration";
import { MediaTrainingAdmin } from "@/components/MediaTrainingAdmin";
import { MissionTripRegistration } from "@/components/MissionTripRegistration";
import { MissionTripAdmin } from "@/components/MissionTripAdmin";
import { PublicTranslator } from "@/components/PublicTranslator";
import { Toaster } from "@/components/ui/sonner";
import { getJSON } from "@/lib/api";
import { cn } from "@/lib/utils";

const BRAND = "Rhapsody End-Time Teaching Crusades";
const DEFAULT_DESCRIPTION = "Join A Night of a Thousand Crusades, register crusades, access approved resources, and take part in global mission initiatives.";

// First match wins. Public pages are indexable; protected and tokenized pages are not.
const PAGE_META = [
  [/^\/$/, "A Night of a Thousand Crusades", "Register and prepare for A Night of a Thousand Crusades, a global mobilisation of simultaneous gospel crusades.", true, "/"],
  [/^\/crusade-registration\/register/, "Register Your Crusades", "Register confirmed crusades for A Night of a Thousand Crusades and add them to the global record.", true, "/crusade-registration/register"],
  [/^\/crusade-registration/, "A Night of a Thousand Crusades", "Register and prepare for A Night of a Thousand Crusades, a global mobilisation of simultaneous gospel crusades.", true, "/crusade-registration"],
  [/^\/blue-elite\/register/, "Blue Elite Crusade Registration", "Register confirmed crusades for the Loveworld Blue Elite team.", true, "/blue-elite/register"],
  [/^\/blue-elite/, "Loveworld Blue Elite", "Loveworld Blue Elite staff can register and review confirmed crusades for NOTC.", true, "/blue-elite"],
  [/^\/report/, "Report a Crusade", "Submit the verified outcome of a completed A Night of a Thousand Crusades event.", true, "/report"],
  [/^\/resources$/, "NOTC Resource Library", "Find approved NOTC documents, media, songs, videos, images, and ministry resources.", true, "/resources"],
  [/^\/select-nation/, "NOTC National Missions Leadership Initiative", "Zonal Pastors can state their preferred mission nation and proposed commitment of at least 1,000 crusades.", true, "/select-nation"],
  [/^\/media-training$/, "NOTC Global Media Training Mobilisation", "Register individually for the Night of a Thousand Crusades Global Media Training Mobilisation.", true, "/media-training", "/media-training-mobilisation.png"],
  [/^\/mission-trips$/, "NOTC Mission Trip Volunteers", "Volunteer for international NOTC mission trips and identify the nations where you can serve.", true, "/mission-trips"],
  [/^\/zone\//, "Zone Portal", "Private NOTC zone planning and reporting portal.", false],
  [/^\/(admin|dashboard|crusades|registrations)/, "NOTC Administration", "Protected NOTC administration workspace.", false],
];

function setMeta(selector, attribute, value) {
  let element = document.head.querySelector(selector);
  if (!element) { element = document.createElement("meta"); document.head.appendChild(element); }
  Object.entries(attribute).forEach(([name, content]) => element.setAttribute(name, content));
  element.setAttribute("content", value);
}

function TitleManager() {
  const { pathname } = useLocation();
  useEffect(() => {
    const match = PAGE_META.find(([re]) => re.test(pathname));
    const title = match?.[1] || "Page Not Found";
    const description = match?.[2] || DEFAULT_DESCRIPTION;
    const indexable = Boolean(match?.[3]);
    const canonicalPath = match?.[4] || pathname;
    const canonicalUrl = `${window.location.origin}${canonicalPath}`;
    const socialImage = `${window.location.origin}${match?.[5] || "/logo.png"}`;
    document.title = `${title} — ${BRAND}`;
    setMeta('meta[name="description"]', { name: "description" }, description);
    setMeta('meta[name="robots"]', { name: "robots" }, indexable ? "index, follow" : "noindex, nofollow");
    setMeta('meta[property="og:title"]', { property: "og:title" }, document.title);
    setMeta('meta[property="og:description"]', { property: "og:description" }, description);
    setMeta('meta[property="og:type"]', { property: "og:type" }, "website");
    setMeta('meta[property="og:url"]', { property: "og:url" }, canonicalUrl);
    setMeta('meta[property="og:site_name"]', { property: "og:site_name" }, BRAND);
    setMeta('meta[property="og:image"]', { property: "og:image" }, socialImage);
    setMeta('meta[name="twitter:card"]', { name: "twitter:card" }, "summary");
    setMeta('meta[name="twitter:title"]', { name: "twitter:title" }, document.title);
    setMeta('meta[name="twitter:description"]', { name: "twitter:description" }, description);
    setMeta('meta[name="twitter:image"]', { name: "twitter:image" }, socialImage);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; document.head.appendChild(canonical); }
    canonical.href = canonicalUrl;
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
        <div className="mx-auto max-w-7xl px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
          {logoOk && (
            <img src="/logo.png" alt="" className="h-11 w-auto shrink-0" onError={() => setLogoOk(false)} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold tracking-tight">Rhapsody End-Time Teaching Crusades</h1>
            <p className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</p>
          </div>
          </div>
          {visibleLinks.length > 0 && (
            <nav className="mt-3 flex w-full gap-1 overflow-x-auto border-t border-blue-100 pt-2 [scrollbar-width:thin]">
              {visibleLinks.map(([to, label, end]) => (
                <NavLink key={to} to={to} end={end} className={(state) => cn(navLink(state), "shrink-0 whitespace-nowrap")}>{label}</NavLink>
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

// /admin redirects to the configured default landing page. The setting lives in
// app_settings and is editable from the Settings page; we fetch it once on mount.
// While loading (and as a fallback if the fetch fails) we use /registrations/live,
// which is the seeded default — so /admin always works even if the API is down.
function AdminRedirect() {
  const [to, setTo] = useState("/registrations/live");
  useEffect(() => {
    getJSON("/campaign-settings")
      .then((s) => s.default_landing_page && setTo(s.default_landing_page))
      .catch(() => {});
  }, []);
  return <Navigate to={to} replace />;
}

// Settings is super-admin only. Non-super-admins who hit the URL directly are
// redirected to the dashboard instead of seeing the "only @maxwellvn" message.
function SettingsRoute() {
  const admin = useAdmin();
  if (!admin?.is_super_admin) return <Navigate to="/dashboard" replace />;
  return <Settings />;
}

// Blue Elite admin surface is super-admin only — the data is isolated from the
// public registration views and only @maxwellvn can see it. Non-super-admins
// who hit the URL directly are redirected to the standard dashboard.
function SuperAdminRoute({ children }) {
  const admin = useAdmin();
  if (!admin?.is_super_admin) return <Navigate to="/dashboard" replace />;
  return children;
}

// /admin/pm — self-service access link. Sends the user to KingsChat login with
// pm=1, which sets a short-lived cookie that auto-adds their username to the
// dashboard allow list on callback. If already signed in and approved, go straight
// to the dashboard.
function PmRedirect() {
  useEffect(() => {
    getJSON("/auth/me")
      .then(() => { window.location.assign("/admin"); })
      .catch(() => { window.location.assign("/api/auth/kingschat/login?pm=1"); });
  }, []);
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <img src="/logo.png" alt="" className="mx-auto h-12 w-auto" />
        <p className="text-sm text-muted-foreground">Redirecting to KingsChat sign-in…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <TitleManager />
      <PublicTranslator />
      <Routes>
        {/* Public campaign surface — self-contained pages, no app chrome */}
        <Route path="/" element={<Landing />} />
        <Route path="/crusade-registration" element={<Landing />} />
        <Route path="/crusade-registration/register" element={<RegistrationForm />} />

        {/* Loveworld Blue Elite staff registration — standalone surface, same
            crusade logic as the public form but a separate audience and data
            partition (program='blue_elite'). No portal connection. */}
        <Route path="/blue-elite" element={<BlueEliteLanding />} />
        <Route path="/blue-elite/register" element={<BlueEliteRegistrationForm />} />

        {/* Zone capability-link dashboards — self-contained, token-scoped */}
        <Route path="/zone/:token" element={<ZonePortal />} />

        {/* Reporting surface — standalone campaign-style page, same as registration */}
        <Route path="/report" element={<ReportForm />} />
        <Route path="/resources" element={<ResourcesLibrary />} />
        <Route path="/select-nation" element={<MissionNationSelection />} />
        <Route path="/media-training" element={<MediaTrainingRegistration />} />
        <Route path="/mission-trips" element={<MissionTripRegistration />} />

        {/* /admin lands on the configured default landing page */}
        <Route path="/admin" element={<AdminRedirect />} />

        {/* /admin/pm — self-service access link. Redirects to KingsChat login
            with pm=1, which auto-adds the signed-in username to the allow list. */}
        <Route path="/admin/pm" element={<PmRedirect />} />

        {/* Admin surface — everything inside requires an approved KingsChat account */}
        <Route element={<AdminGate><Shell subtitle="Crusade analytics and records."
          links={[["/", "Home", true], ["/registrations/live", "Live"], ["/registrations", "Registrations", true], ["/dashboard", "Reports dashboard", true], ["/crusades", "Reports"], ["/dashboard/zone-links", "Zone links"], ["/dashboard/mission-nations", "Mission nations", false, true], ["/dashboard/media-training", "Media training", false, true], ["/dashboard/mission-trips", "Mission trips", false, true], ["/dashboard/resources", "Resources", false, true], ["/dashboard/blue-elite", "Blue Elite", false, true], ["/registrations/blue-elite", "Blue Elite reg.", false, true], ["/dashboard/settings", "Settings", false, true]]} /></AdminGate>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/widget/:id" element={<WidgetDetail />} />
          <Route path="/crusades" element={<CrusadesTable />} />
          <Route path="/crusades/:id/edit" element={<SuperAdminRoute><EditCrusadePage /></SuperAdminRoute>} />
          <Route path="/registrations" element={<RegistrationsTable />} />
          <Route path="/registrations/live" element={<RegistrationsLive />} />
          <Route path="/dashboard/zone-links" element={<ZoneLinks />} />
          <Route path="/dashboard/settings" element={<SettingsRoute />} />
          <Route path="/dashboard/resources" element={<SuperAdminRoute><ResourcesAdmin /></SuperAdminRoute>} />
          <Route path="/dashboard/mission-nations" element={<SuperAdminRoute><MissionNationAdmin /></SuperAdminRoute>} />
          <Route path="/dashboard/media-training" element={<SuperAdminRoute><MediaTrainingAdmin /></SuperAdminRoute>} />
          <Route path="/dashboard/mission-trips" element={<SuperAdminRoute><MissionTripAdmin /></SuperAdminRoute>} />
          {/* Blue Elite admin surface — super-admin only */}
          <Route path="/dashboard/blue-elite" element={<SuperAdminRoute><BlueEliteDashboard /></SuperAdminRoute>} />
          <Route path="/registrations/blue-elite" element={<SuperAdminRoute><BlueEliteRegistrationsTable /></SuperAdminRoute>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
