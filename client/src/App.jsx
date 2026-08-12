import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { ReportForm } from "@/components/ReportForm";
import { Dashboard } from "@/components/Dashboard";
import { WidgetDetail } from "@/components/WidgetDetail";
import { CrusadesTable } from "@/components/CrusadesTable";
import { EditCrusadePage } from "@/components/EditCrusadePage";
import { RegistrationsLive } from "@/components/RegistrationsLive";
import { CrusadeAnalysis } from "@/components/CrusadeAnalysis";
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
import { UpcomingCrusades } from "@/components/UpcomingCrusades";
import { UpcomingCrusadesAdmin } from "@/components/UpcomingCrusadesAdmin";
import { AvatarFrame } from "@/components/AvatarFrame";
import { PublicTranslator } from "@/components/PublicTranslator";
import { CrusadeCoverage } from "@/components/CrusadeCoverage";
import { CountryCoverage } from "@/components/CountryCoverage";
import { PastoralChecklist } from "@/components/PastoralChecklist";
import { DatabaseProtection } from "@/components/DatabaseProtection";
import { ManualOrganizations } from "@/components/ManualOrganizations";
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
  [/^\/blue-elite\/register/, "Blue Elite Crusade Registration", "Register confirmed crusades for the Loveworld Blue Elite staff.", true, "/blue-elite/register"],
  [/^\/blue-elite/, "Loveworld Blue Elite", "Loveworld Blue Elite staff can register and review confirmed crusades for NOTC.", true, "/blue-elite"],
  [/^\/report/, "Report a Crusade", "Submit the verified outcome of a completed A Night of a Thousand Crusades event.", true, "/report"],
  [/^\/resources$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) Approved Resources Hub", "Access all approved resources required for effective preparation, teaching, outreach, and crusade execution.", true, "/resources"],
  [/^\/select-nation$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) – NATIONAL MISSIONS LEADERSHIP INITIATIVE", "Ministers can select a preferred mission nation and propose a commitment of at least 1,000 crusades.", true, "/select-nation", "/national-missions-leadership.png"],
  [/^\/media-training$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) GLOBAL MEDIA TRAINING MOBILISATION", "Intensive training for media personnel, presenters, aspiring presenters, creatives, and volunteers serving the global evangelistic vision.", true, "/media-training", "/media-training-mobilisation.png"],
  [/^\/mission-trips$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) GLOBAL MISSIONS TRIP VOLUNTEER MOBILISATION", "Volunteer for a global missions trip if you have independent travel access, availability, and a desire to serve in another nation.", true, "/mission-trips", "/global-missions-trip-volunteer.png"],
  [/^\/upcoming-crusades$/, "UPCOMING NIGHT OF A THOUSAND CRUSADES", "Participants can select one planned international crusade they would like to attend and review the relevant travel details.", true, "/upcoming-crusades"],
  [/^\/avatar$/, "NIGHT OF A THOUSAND CRUSADES (NOTC) CAMPAIGN AVATAR", "Add your photo to the Night of a Thousand Crusades campaign avatar and share your participation ahead of Friday, August 28, 2026.", true, "/avatar", "/notc-avatar-frame.jpg"],
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
    setMeta('meta[name="twitter:card"]', { name: "twitter:card" }, match?.[5] ? "summary_large_image" : "summary");
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
  const visibleLinks = links.filter(([to, , , superAdminOnly]) => {
    if (superAdminOnly && !admin?.is_super_admin) return false;
    // For non-super-admins, check page-level permissions. The Home link ("/")
    // is always visible. Every other link needs a matching permission key.
    if (!admin?.is_super_admin && to !== "/") {
      const pageKey = to.replace(/^\//, "");
      const allowed = admin?.permissions?.includes(pageKey)
        || (to === "/crusades" && admin?.permissions?.includes("crusades/edit"));
      if (admin?.permissions && !allowed) return false;
    }
    return true;
  });
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

// Leadership self-service access links. The access marker sets a short-lived
// cookie that auto-adds the signed-in KingsChat username to the dashboard allow
// list on callback. Approved users go straight to the dashboard.
function LeadershipAccessRedirect({ access }) {
  useEffect(() => {
    getJSON("/auth/me")
      .then(() => { window.location.assign("/admin"); })
      .catch(() => { window.location.assign(`/api/auth/kingschat/login?${access}=1`); });
  }, [access]);
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-md space-y-4 text-center">
        <img src="/logo.png" alt="" className="mx-auto h-12 w-auto" />
        <p className="text-sm text-muted-foreground">Redirecting to KingsChat sign-in…</p>
      </div>
    </div>
  );
}

// Page-level access guard. Checks the signed-in admin's permissions array
// (returned by /auth/me) and redirects to the first accessible page if the
// user doesn't have access. Super admins bypass the check.
function PageGuard({ pageKey, alternatePageKeys = [], children }) {
  const admin = useAdmin();
  if (admin?.is_super_admin) return children;
  const allowed = [pageKey, ...alternatePageKeys].some((key) => admin?.permissions?.includes(key));
  if (!allowed) return <Navigate to="/admin" replace />;
  return children;
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
        <Route path="/upcoming-crusades" element={<UpcomingCrusades />} />
        <Route path="/avatar" element={<AvatarFrame />} />

        {/* /admin lands on the configured default landing page */}
        <Route path="/admin" element={<AdminRedirect />} />

        {/* Leadership self-service links auto-add the signed-in KingsChat user. */}
        <Route path="/admin/pm" element={<LeadershipAccessRedirect access="pm" />} />
        <Route path="/admin/dg" element={<LeadershipAccessRedirect access="dg" />} />

        {/* Admin surface — everything inside requires an approved KingsChat account */}
        <Route element={<AdminGate><Shell subtitle="Crusade analytics and records."
          links={[["/", "Home", true], ["/registrations/live", "Live"], ["/dashboard/crusade-analysis", "Crusade analysis"], ["/registrations", "Registrations", true], ["/dashboard", "Reports dashboard", true], ["/crusades", "Reports"], ["/dashboard/coverage", "Coverage"], ["/dashboard/country-coverage", "Country coverage"], ["/dashboard/pastoral-checklist", "Pastoral checklist"], ["/dashboard/zone-links", "Zone links"], ["/registrations/manual-organizations", "Manual organisations"], ["/dashboard/mission-nations", "Mission nations"], ["/dashboard/upcoming-crusades", "Upcoming crusades"], ["/dashboard/media-training", "Media training"], ["/dashboard/mission-trips", "Mission trips"], ["/dashboard/resources", "Resources"], ["/dashboard/blue-elite", "Blue Elite"], ["/registrations/blue-elite", "Blue Elite reg."], ["/dashboard/database-protection", "Backups"], ["/dashboard/settings", "Settings", false, true]]} /></AdminGate>}>
          <Route path="/dashboard" element={<PageGuard pageKey="dashboard"><Dashboard /></PageGuard>} />
          <Route path="/dashboard/widget/:id" element={<PageGuard pageKey="dashboard"><WidgetDetail /></PageGuard>} />
          <Route path="/crusades" element={<PageGuard pageKey="crusades" alternatePageKeys={["crusades/edit"]}><CrusadesTable /></PageGuard>} />
          <Route path="/crusades/:id/edit" element={<PageGuard pageKey="crusades/edit"><EditCrusadePage /></PageGuard>} />
          <Route path="/registrations" element={<PageGuard pageKey="registrations"><RegistrationsTable /></PageGuard>} />
          <Route path="/registrations/live" element={<PageGuard pageKey="registrations/live"><RegistrationsLive /></PageGuard>} />
          <Route path="/dashboard/crusade-analysis" element={<PageGuard pageKey="dashboard/crusade-analysis"><CrusadeAnalysis /></PageGuard>} />
          <Route path="/registrations/manual-organizations" element={<PageGuard pageKey="registrations/manual-organizations"><ManualOrganizations /></PageGuard>} />
          <Route path="/dashboard/zone-links" element={<PageGuard pageKey="dashboard/zone-links"><ZoneLinks /></PageGuard>} />
          <Route path="/dashboard/coverage" element={<PageGuard pageKey="dashboard/coverage"><CrusadeCoverage /></PageGuard>} />
          <Route path="/dashboard/settings" element={<SettingsRoute />} />
          <Route path="/dashboard/country-coverage" element={<PageGuard pageKey="dashboard/country-coverage"><CountryCoverage /></PageGuard>} />
          <Route path="/dashboard/pastoral-checklist" element={<PageGuard pageKey="dashboard/pastoral-checklist"><PastoralChecklist /></PageGuard>} />
          <Route path="/dashboard/database-protection" element={<PageGuard pageKey="dashboard/database-protection"><DatabaseProtection /></PageGuard>} />
          <Route path="/dashboard/resources" element={<PageGuard pageKey="dashboard/resources"><ResourcesAdmin /></PageGuard>} />
          <Route path="/dashboard/mission-nations" element={<PageGuard pageKey="dashboard/mission-nations"><MissionNationAdmin /></PageGuard>} />
          <Route path="/dashboard/media-training" element={<PageGuard pageKey="dashboard/media-training"><MediaTrainingAdmin /></PageGuard>} />
          <Route path="/dashboard/mission-trips" element={<PageGuard pageKey="dashboard/mission-trips"><MissionTripAdmin /></PageGuard>} />
          <Route path="/dashboard/upcoming-crusades" element={<PageGuard pageKey="dashboard/upcoming-crusades"><UpcomingCrusadesAdmin /></PageGuard>} />
          <Route path="/dashboard/blue-elite" element={<PageGuard pageKey="dashboard/blue-elite"><BlueEliteDashboard /></PageGuard>} />
          <Route path="/registrations/blue-elite" element={<PageGuard pageKey="registrations/blue-elite"><BlueEliteRegistrationsTable /></PageGuard>} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  );
}
