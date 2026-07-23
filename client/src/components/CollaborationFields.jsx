import * as React from "react";
import { X } from "lucide-react";
import { Combobox } from "@/components/Combobox";
import { ZONE_CONTRIBUTIONS } from "@/lib/constants";

// Network-only crusade collaboration controls, shared by the registration form
// (create) and the crusade editor (update). Values are string arrays; the server
// stores each as a comma-joined string, which splitCollaboration turns back.

export const splitCollaboration = (value) =>
  String(value || "").split(",").map((item) => item.trim()).filter(Boolean);

// Pick any number of collaborating zones/networks. Selected collaborators render
// as removable chips above the searchable picker.
export function CollaboratorPicker({ value = [], onChange, fetcher, invalid }) {
  const list = Array.isArray(value) ? value : [];
  const add = (name) => { if (name && !list.includes(name)) onChange([...list, name]); };
  const remove = (name) => onChange(list.filter((item) => item !== name));
  return (
    <div className="space-y-2">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {list.map((name) => (
            <span key={name} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground">
              {name}
              <button type="button" onClick={() => remove(name)} className="rounded-full p-0.5 hover:bg-foreground/10" aria-label={`Remove ${name}`}>
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Combobox value="" fetcher={fetcher} invalid={invalid} minChars={0}
        placeholder={list.length ? "Add another collaborator" : "Select zones, networks or ministries"}
        searchPlaceholder="Search zones, networks and ministries…" emptyText="No collaborators found"
        onSelect={(option) => add(option.label)} />
    </div>
  );
}

// Multi-select of contribution types (checkboxes).
export function ContributionChecklist({ value = [], onChange }) {
  const list = Array.isArray(value) ? value : [];
  const toggle = (option) => onChange(list.includes(option) ? list.filter((item) => item !== option) : [...list, option]);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ZONE_CONTRIBUTIONS.map((option) => (
        <label key={option} className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={list.includes(option)} onChange={() => toggle(option)} className="size-4 shrink-0 accent-primary" />
          <span>{option}</span>
        </label>
      ))}
    </div>
  );
}
