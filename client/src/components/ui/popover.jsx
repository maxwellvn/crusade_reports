import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;

const PopoverContent = React.forwardRef(({ className, align = "start", sideOffset = 4, ...props }, ref) => (
  // No Portal: rendering inline keeps the popover inside native <dialog> top layer.
  // The Combobox is the only consumer, and its dropdowns are small enough that
  // parent overflow clipping is not a concern in practice.
  <PopoverPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-72 rounded-md border bg-popover p-0 text-popover-foreground outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
      className
    )}
    {...props}
  />
));
PopoverContent.displayName = "PopoverContent";

export { Popover, PopoverTrigger, PopoverContent };
