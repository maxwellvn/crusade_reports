import * as React from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

function labelChildren(children, label) {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    if (typeof child.type === "string" && !["input", "select", "textarea", "button"].includes(child.type)) {
      return React.cloneElement(child, {}, labelChildren(child.props.children, label));
    }
    if (child.props["aria-label"] || child.props["aria-labelledby"] || child.props.id) return child;
    return React.cloneElement(child, { "aria-label": label });
  });
}

// Label + optional required marker + error text. Keeps the form markup flat.
export function Field({ label, htmlFor, required, error, hint, className, children }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} className="text-slate-700">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      {label ? labelChildren(children, label) : children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="flex items-center gap-1 text-xs font-medium text-destructive"><span aria-hidden="true">●</span>{error}</p>}
    </div>
  );
}
