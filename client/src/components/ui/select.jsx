import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ponytail: native <select> for fixed short enums — no Radix, no portal, a11y for free.
const Select = React.forwardRef(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full appearance-none rounded-none border-0 border-b border-input bg-background px-0 py-2 pr-9 text-sm transition-colors focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-foreground",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <ChevronDown className="pointer-events-none absolute right-1 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
  </div>
));
Select.displayName = "Select";

export { Select };
