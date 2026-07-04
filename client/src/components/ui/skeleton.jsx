import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

// Shared loading placeholder — varied widths so it reads as content, not stripes.
function LoadingRows({ rows = 6, className }) {
  return (
    <div className={cn("space-y-3 py-4", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${90 - (i % 3) * 18}%` }} />
      ))}
    </div>
  );
}

export { Skeleton, LoadingRows };
