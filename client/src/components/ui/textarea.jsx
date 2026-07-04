import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "flex min-h-[80px] w-full rounded-none border-0 border-b border-input bg-background px-0 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-foreground",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export { Textarea };
