import * as React from "react";
import { Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { cn } from "@/lib/utils";

/**
 * Async searchable select.
 * @param fetcher    (query) => Promise<[{ value, label, sublabel?, raw? }]>
 * @param value      current selected label (string) shown on the trigger
 * @param onSelect   (option) => void
 * @param allowCreate if set, offers "+ Add '<query>'" -> onSelect({value:query,label:query,created:true})
 */
export function Combobox({
  fetcher,
  value,
  onSelect,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No results",
  minChars = 0,
  caps = false, // ponytail: display-only uppercase; stored values keep original case
  allowCreate = false,
  createDescription = "Use this as typed",
  disabled = false,
  invalid = false,
  id,
  ariaLabel,
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [options, setOptions] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const reqId = React.useRef(0);

  React.useEffect(() => {
    if (!open) return;
    if (query.length < minChars) {
      setOptions([]);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetcher(query);
        if (id === reqId.current) setOptions(Array.isArray(res) ? res : []);
      } catch {
        if (id === reqId.current) setOptions([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query, open, minChars, fetcher]);

  const showCreate =
    allowCreate && query.trim().length >= 2 && !options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  function choose(opt) {
    onSelect(opt);
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          aria-label={ariaLabel || placeholder}
          disabled={disabled}
          className={cn(
            // field, not button: bottom-rule styling to match Input/Select
            "w-full justify-between rounded-none border-0 border-b border-input px-0 font-normal hover:bg-transparent focus-visible:border-foreground focus-visible:ring-0",
            !value && "text-muted-foreground",
            invalid && "border-foreground"
          )}
        >
          <span className={cn("truncate", caps && value && "uppercase")}>{value || placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command shouldFilter={false}>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            )}
            {!loading && (
              <>
                {options.length === 0 && !showCreate && (
                  <CommandEmpty>{query.length < minChars ? `Type ${minChars}+ characters` : emptyText}</CommandEmpty>
                )}
                <CommandGroup>
                  {options.map((opt) => (
                    <CommandItem key={opt.value} value={opt.value} onSelect={() => choose(opt)}>
                      <Check className={cn("mr-2 size-4", value === opt.label ? "opacity-100" : "opacity-0")} />
                      <div className="min-w-0">
                        <div className={cn("truncate", caps && "uppercase")}>{opt.label}</div>
                        {opt.sublabel && <div className="truncate text-xs text-muted-foreground">{opt.sublabel}</div>}
                      </div>
                    </CommandItem>
                  ))}
                  {showCreate && (
                    <CommandItem
                      value={`__create__${query}`}
                      onSelect={() => choose({ value: query.trim(), label: query.trim(), created: true })}
                    >
                      <Plus className="mr-2 size-4 text-primary" />
                      <div><div className="font-medium">Add “{query.trim()}”</div><div className="text-xs text-muted-foreground">{createDescription}</div></div>
                    </CommandItem>
                  )}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
