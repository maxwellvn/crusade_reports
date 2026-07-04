import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

// Label + optional required marker + error text. Keeps the form markup flat.
export function Field({ label, htmlFor, required, error, hint, className, children }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs font-medium text-destructive">{error}</p>}
    </div>
  );
}
