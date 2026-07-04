import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// Shared sortable-table plumbing for the URL-driven admin tables.
// Sort state lives in the search params so it composes with filters and paging.

export function useTableSort(params, setParams, defaultSort) {
  function setSort(col) {
    const next = new URLSearchParams(params);
    const active = (next.get("sort") || defaultSort) === col;
    const dir = next.get("dir") || "desc";
    next.set("sort", col);
    next.set("dir", active ? (dir === "asc" ? "desc" : "asc") : "asc");
    next.delete("page");
    setParams(next);
  }

  function Th({ col, label, right }) {
    const active = (params.get("sort") || defaultSort) === col;
    const dir = params.get("dir") || "desc";
    const Icon = !active ? ChevronsUpDown : dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={`py-2 pr-3 font-medium whitespace-nowrap ${right ? "text-right" : "text-left"}`}
        aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        <button type="button" onClick={() => setSort(col)}
          className={`inline-flex items-center gap-1 transition-colors hover:text-foreground ${active ? "text-foreground" : ""}`}>
          {label} <Icon className={`size-3 shrink-0 ${active ? "" : "opacity-50"}`} />
        </button>
      </th>
    );
  }

  return { Th, setSort };
}

export function Pagination({ page, totalPages, onPage }) {
  return (
    <div className="flex items-center justify-between">
      <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next</Button>
    </div>
  );
}
