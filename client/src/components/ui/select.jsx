import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function optionText(children) {
  return React.Children.toArray(children).map((child) => typeof child === "string" || typeof child === "number" ? child : "").join("");
}

function collectOptions(children, result = []) {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment || child.type === "optgroup") {
      collectOptions(child.props.children, result);
      return;
    }
    if (child.type === "option") {
      result.push({
        value: String(child.props.value ?? optionText(child.props.children)),
        label: optionText(child.props.children),
        disabled: Boolean(child.props.disabled),
      });
    }
  });
  return result;
}

function assignRef(ref, value) {
  if (typeof ref === "function") ref(value);
  else if (ref) ref.current = value;
}

// Searchable select with a native select retained underneath for React Hook Form,
// browser form submission, autofill, and existing onChange handlers.
const Select = React.forwardRef(({
  className,
  children,
  value: controlledValue,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  id,
  name,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  ...props
}, forwardedRef) => {
  const nativeRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [internalValue, setInternalValue] = React.useState(() => String(defaultValue ?? ""));
  const options = React.useMemo(() => collectOptions(children), [children]);
  const selectedValue = String(controlledValue ?? internalValue ?? "");
  const selected = options.find((option) => option.value === selectedValue);
  const placeholder = options.find((option) => option.value === "")?.label || "Select an option";

  const setNativeRef = React.useCallback((node) => {
    nativeRef.current = node;
    assignRef(forwardedRef, node);
    if (node && controlledValue === undefined) setInternalValue(node.value || String(defaultValue ?? ""));
  }, [forwardedRef, controlledValue, defaultValue]);

  React.useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form || controlledValue !== undefined) return undefined;
    const syncAfterReset = () => requestAnimationFrame(() => setInternalValue(nativeRef.current?.value || ""));
    form.addEventListener("reset", syncAfterReset);
    return () => form.removeEventListener("reset", syncAfterReset);
  }, [controlledValue]);

  function choose(nextValue) {
    const select = nativeRef.current;
    if (!select) return;
    setInternalValue(nextValue);
    select.value = nextValue;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    setOpen(false);
  }

  function handleOpenChange(nextOpen) {
    setOpen(nextOpen);
    if (!nextOpen && onBlur && nativeRef.current) {
      onBlur({ target: nativeRef.current, currentTarget: nativeRef.current, type: "blur" });
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <select
        ref={setNativeRef}
        name={name}
        value={controlledValue}
        defaultValue={controlledValue === undefined ? defaultValue : undefined}
        onChange={(event) => {
          if (controlledValue === undefined) setInternalValue(event.target.value);
          onChange?.(event);
        }}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        className="pointer-events-none absolute size-px opacity-0"
        {...props}
      >
        {children}
      </select>

      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-white px-3 py-2 text-left text-sm shadow-sm shadow-slate-100 transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/15 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/10",
            className
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", !selectedValue && "text-muted-foreground")}>{selected?.label || placeholder}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-primary/70" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search…" />
          <CommandList>
            <CommandEmpty>No matching options</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={`${option.value}-${option.label}`}
                  value={`${option.label} ${option.value}`}
                  disabled={option.disabled}
                  onSelect={() => choose(option.value)}
                >
                  <Check className={cn("mr-2 size-4", option.value === selectedValue ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
Select.displayName = "Select";

export { Select };
