import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + optional required marker + error text. Keeps the form markup flat.
export function Field({ label, htmlFor, required, error, hint, className, children }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-slate-700">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs font-medium text-destructive"><span aria-hidden="true">●</span>{error}</p>}
    </div>
  );
}
