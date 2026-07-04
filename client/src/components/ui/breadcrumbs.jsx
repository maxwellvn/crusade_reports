import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

// items: [{ label, to? }] — last item (no `to`) renders as the current page.
export function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-muted-foreground">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0" />}
          {item.to ? (
            <Link to={item.to} className="transition-colors hover:text-foreground hover:underline">{item.label}</Link>
          ) : (
            <span className="font-medium text-foreground">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
