import * as React from "react";
import { getJSON, postJSON } from "@/lib/api";
import "../admin-gate.css";

const AdminContext = React.createContext(null);
export const useAdmin = () => React.useContext(AdminContext);

// Sign-in gate for the admin surface. Visual language mirrors the campaign
// landing page (indigo frame, navy stage, gold glow, globe + crusade
// photography). Styles live in admin-gate.css, scoped to .admin-gate so they
// do not leak into the admin dashboard it protects.
export function AdminGate({ children }) {
  const [state, setState] = React.useState("checking");
  const [message, setMessage] = React.useState("");
  const [admin, setAdmin] = React.useState(null);

  React.useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("auth_error");
    if (error) setMessage(error.replaceAll("_", " "));
    getJSON("/auth/me")
      .then((user) => { setAdmin(user); setState("open"); })
      .catch((err) => {
        // 403 = signed in via KingsChat but not approved for dashboard access.
        // 401 = no session at all. We show a sign-out button only when the user
        // is actually signed in (403) so they can switch accounts.
        const code = err?.code || "";
        setMessage(code === "FORBIDDEN" ? err.message : "");
        setState(code === "FORBIDDEN" ? "forbidden" : "locked");
      });
  }, []);

  if (state === "open") return <AdminContext.Provider value={admin}>{children}</AdminContext.Provider>;

  if (state === "checking") {
    return (
      <div className="admin-gate gate-checking" role="status" aria-label="Checking access">
        <img src="/assets/globe.webp" alt="" className="gate-checking-globe" />
      </div>
    );
  }

  const forbidden = state === "forbidden";

  return (
    <div className="admin-gate">
      <div className="gate-card">
        <section className="gate-visual">
          <div className="gate-glow" aria-hidden="true" />
          <img src="/assets/globe.webp" className="gate-globe" alt="" aria-hidden="true" />
          <div className="gate-visual-copy">
            <span className="gate-eyebrow">NOTC Administration</span>
            <h1>A Night of a Thousand Crusades</h1>
            <p>Registrations, reports, mission nations, and operations — one protected workspace.</p>
          </div>
        </section>

        <section className="gate-panel">
          <header className="gate-panel-head">
            <a href="/" aria-label="A Night of a Thousand Crusades home"><img src="/logo.png" alt="" /></a>
            <a href="/" className="gate-home-link">Return home</a>
          </header>
          <div className="gate-form">
            <h2>{forbidden ? "Access required" : "Sign in"}</h2>
            <p>{forbidden ? "Your KingsChat account is not approved for this dashboard." : "Use the KingsChat account approved for NOTC administration."}</p>
            {message && (
              <div role="alert" className="gate-error">
                <p className="gate-error-title">Sign-in could not continue</p>
                <p>{message}</p>
              </div>
            )}
            {forbidden ? (
              <button type="button" className="gate-cta gate-cta-secondary" onClick={async () => {
                await postJSON("/auth/logout", {});
                window.location.reload();
              }}>
                Sign out and switch account
              </button>
            ) : (
              <a href="/api/auth/kingschat/login" className="gate-cta">
                <img src="/assets/kingschat.webp" alt="" className="gate-cta-mark" />
                Continue with KingsChat
                <img src="/assets/icon-arrow.svg" alt="" className="gate-cta-arrow" />
              </a>
            )}
            <p className="gate-helper">{forbidden ? "Contact the NOTC administrator to request access." : "Not approved yet? Contact the NOTC administrator."}</p>
          </div>
        </section>
      </div>
    </div>
  );
}
