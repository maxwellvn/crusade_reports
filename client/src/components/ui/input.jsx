import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-10 w-full rounded-none border-0 border-b border-input bg-background px-0 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-foreground",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
