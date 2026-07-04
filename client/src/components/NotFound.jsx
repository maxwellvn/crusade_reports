import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-background px-6">
      <div className="max-w-md space-y-5 text-center">
        <img src="/logo.png" alt="" className="mx-auto h-10 w-auto" />
        <p className="text-7xl tracking-[-1.2px] text-muted-foreground/40 tabular-nums">404</p>
        <h1 className="text-2xl tracking-tight">This page doesn’t exist.</h1>
        <p className="text-sm text-muted-foreground">The link may be wrong, or the page may have moved.</p>
        <Link to="/crusade-registration"
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground transition-all duration-200 hover:bg-primary/85 active:scale-[0.98]">
          Go to the campaign page
        </Link>
      </div>
    </div>
  );
}
