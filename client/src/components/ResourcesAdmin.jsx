import * as React from "react";
import { ArrowUpRight, ExternalLink, FileUp, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getJSON, deleteJSON } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";

const EMPTY = { title: "", description: "", category: "Teaching", resource_type: "document", external_url: "" };

function AdminSection({ title, description, children }) {
  return <section className="grid gap-5 border-t border-slate-200 py-8 sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-10 sm:py-10">
    <div><h3 className="text-base font-semibold tracking-[-0.015em] text-slate-950">{title}</h3><p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{description}</p></div>
    <div className="min-w-0">{children}</div>
  </section>;
}

export function ResourcesAdmin() {
  const [resources, setResources] = React.useState([]);
  const [categories, setCategories] = React.useState([]);
  const [newCategory, setNewCategory] = React.useState("");
  const [form, setForm] = React.useState(EMPTY);
  const [file, setFile] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const fileRef = React.useRef(null);
  const load = React.useCallback(() => getJSON("/resources").then((d) => { setResources(d.resources); setCategories(d.categories); }).catch((e) => toast.error(e.message)), []);
  React.useEffect(() => { load(); }, [load]);

  async function submit(event) {
    event.preventDefault();
    if (!file && !form.external_url.trim()) return toast.error("Choose a file or enter a link.");
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => body.append(key, value));
    if (file) body.append("file", file);
    setSaving(true);
    try {
      const response = await fetch("/api/resources", { method: "POST", body });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || "Upload failed.");
      await load(); setForm({ ...EMPTY, category: categories[0]?.name || "Teaching" }); setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Resource published.");
    } catch (error) { toast.error(error.message); } finally { setSaving(false); }
  }

  async function remove(resource) {
    if (!window.confirm(`Delete “${resource.title}”? This cannot be undone.`)) return;
    try { await deleteJSON(`/resources/${resource.id}`); await load(); toast.success("Resource deleted."); }
    catch (error) { toast.error(error.message); }
  }

  async function addCategory(event) {
    event.preventDefault();
    try {
      const response = await fetch("/api/resources/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newCategory }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message || "Could not add category.");
      setCategories((rows) => [...rows, result].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((current) => ({ ...current, category: result.name })); setNewCategory(""); toast.success("Category added.");
    } catch (error) { toast.error(error.message); }
  }

  async function removeCategory(category) {
    if (!window.confirm(`Delete the “${category.name}” category?`)) return;
    try {
      await deleteJSON(`/resources/categories/${category.id}`);
      const remaining = categories.filter((row) => row.id !== category.id);
      setCategories(remaining);
      if (form.category === category.name) setForm((current) => ({ ...current, category: remaining[0]?.name || "" }));
      toast.success("Category deleted.");
    } catch (error) { toast.error(error.message); }
  }

  return <div className="mx-auto max-w-5xl">
    <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Resources" }]} />
    <div className="flex flex-col gap-5 pb-10 pt-6 sm:flex-row sm:items-end sm:justify-between">
      <div><h2 className="text-3xl font-normal tracking-[-0.03em] text-slate-950 sm:text-4xl">Resource library</h2><p className="mt-2 text-sm text-slate-600">Publish and organize materials for the public NOTC library.</p></div>
      <Button asChild variant="outline" className="w-fit rounded-full"><a href="/resources" target="_blank" rel="noreferrer">View public library <ArrowUpRight /></a></Button>
    </div>

    <AdminSection title="Publish a resource" description="Add a file up to 150 MB or point visitors to an external resource.">
      <form onSubmit={submit} className="max-w-2xl space-y-5">
        <Field label="Title" required><Input required maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Name this resource" /></Field>
        <div className="grid gap-5 sm:grid-cols-2"><Field label="Resource type"><Select value={form.resource_type} disabled={Boolean(form.external_url)} onChange={(e) => setForm({ ...form, resource_type: e.target.value })}><option value="document">Document</option><option value="image">Image</option><option value="video">Video</option><option value="audio">Song / audio</option><option value="other">Other file</option></Select></Field><Field label="Category"><Select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}</Select></Field></div>
        <Field label="Description"><Textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Explain what this resource contains and who it is for." /></Field>
        <fieldset className="space-y-4 border-t border-slate-200 pt-5"><legend className="pr-3 text-sm font-semibold text-slate-950">Source</legend><p className="text-sm leading-6 text-slate-600">Choose one source. Adding a file disables the link field, and adding a link disables file upload.</p>
          <Field label="File"><Input ref={fileRef} type="file" disabled={Boolean(form.external_url)} onChange={(e) => setFile(e.target.files?.[0] || null)} />{file && <p className="mt-2 text-xs text-slate-600">Selected: <span className="font-semibold text-slate-900">{file.name}</span></p>}</Field>
          <Field label="External link"><Input type="url" disabled={Boolean(file)} value={form.external_url} onChange={(e) => setForm({ ...form, external_url: e.target.value })} placeholder="https://example.com/resource" /></Field>
        </fieldset>
        <Button type="submit" disabled={saving || !categories.length} className="rounded-full"><FileUp />{saving ? "Publishing…" : "Publish resource"}</Button>
      </form>
    </AdminSection>

    <AdminSection title="Categories" description="Categories organize the upload form and the filters visitors use in the public library.">
      <form onSubmit={addCategory} className="grid gap-3 border-b border-slate-200 pb-6 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="Category name"><Input required minLength={2} maxLength={80} value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Add a category" /></Field><Button type="submit" className="mt-6 rounded-full"><Plus /> Add category</Button></form>
      <div>{categories.length ? categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-4 border-b border-slate-200 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-950">{category.name}</p><p className="mt-1 text-xs text-slate-500">{category.resource_count} resource{category.resource_count === 1 ? "" : "s"}</p></div><Button type="button" variant="ghost" size="sm" disabled={Boolean(category.resource_count)} onClick={() => removeCategory(category)} className="shrink-0 text-slate-600 hover:text-red-700" aria-label={`Delete ${category.name}`} title={category.resource_count ? "Categories in use cannot be deleted" : undefined}><Trash2 /> Delete</Button></div>) : <p className="py-8 text-sm text-slate-500">No categories are available.</p>}</div>
    </AdminSection>

    <AdminSection title="Published resources" description={`${resources.length} resource${resources.length === 1 ? " is" : "s are"} currently available in the public library.`}>
      <div>{resources.length ? resources.map((resource) => <div key={resource.id} className="flex items-center gap-2 border-b border-slate-200 py-4 sm:gap-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-950">{resource.title}</p><p className="mt-1 truncate text-xs text-slate-500">{resource.category} · {resource.resource_type}{resource.original_name ? ` · ${resource.original_name}` : ""}</p></div><a href={resource.url} target="_blank" rel="noreferrer" className="grid size-10 shrink-0 place-items-center text-slate-600 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" aria-label={`Open ${resource.title}`}><ExternalLink className="size-4" /></a><Button type="button" variant="ghost" size="sm" onClick={() => remove(resource)} className="shrink-0 text-slate-600 hover:text-red-700" aria-label={`Delete ${resource.title}`}><Trash2 /> <span className="hidden sm:inline">Delete</span></Button></div>) : <div className="py-10"><p className="text-sm font-semibold text-slate-950">Nothing published yet</p><p className="mt-2 text-sm leading-6 text-slate-600">Use the publishing form above to add the first resource.</p></div>}</div>
    </AdminSection>
  </div>;
}
