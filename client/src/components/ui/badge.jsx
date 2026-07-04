import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, variant = "secondary", ...props }) {
  const styles = {
    default: "border-transparent bg-primary text-primary-foreground",
    secondary: "border-transparent bg-secondary text-secondary-foreground",
    outline: "text-foreground",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
