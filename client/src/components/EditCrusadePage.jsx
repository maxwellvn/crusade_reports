import React from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getJSON, putJSON } from "@/lib/api";
import {
  CRUSADE_TYPES, FORMATS, CORE_OUTCOMES, EXTENDED_OUTCOMES, RABAH_OUTCOMES, METRIC_KEYS,
} from "@/lib/constants";

const ORG_TYPES = [
  ["zone", "Zone"], ["group", "Group"], ["church", "Church"], ["cell", "Cell"], ["network", "Network"],
];

const ALL_METRICS = [...CORE_OUTCOMES, ...EXTENDED_OUTCOMES, ...RABAH_OUTCOMES];

export function EditCrusadePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [data, setData] = React.useState(null);

  React.useEffect(() => {
    getJSON(`/crusades/${id}/edit`)
      .then((row) => { setData(row); setLoading(false); })
      .catch((err) => { toast.error(err.message); setLoading(false); });
  }, [id]);

  if (loading) return <div className="p-6 text-muted-foreground">Loading…</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Crusade not found.</div>;

  const set = (field, value) => setData((d) => ({ ...d, [field]: value }));

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {};
      // Crusade fields
      for (const f of ["format", "event_type", "other_event_type", "event_name", "city", "city_place_id",
        "country", "event_date", "attendance", "crusade_expense", "minister_name", "venue",
        "organization_type", "zone", "group_name", "church_name", "cell_name", "network_name"]) {
        payload[f] = data[f] ?? "";
      }
      // Numeric metrics
      for (const [key] of ALL_METRICS) payload[key] = parseInt(data[key] || 0, 10) || 0;
      payload.attendance = parseInt(data.attendance || 0, 10) || 0;
      payload.crusade_expense = Number(data.crusade_expense || 0) || 0;
      // Report fields
      for (const f of ["contact_name", "contact_email", "phone_country_code", "phone_number",
        "kingschat_username", "highlights", "media_links", "photo_links", "video_links"]) {
        payload[f] = data[f] ?? "";
      }
      await putJSON(`/crusades/${id}`, payload);
      toast.success("Crusade updated.");
      navigate("/crusades");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const isRabah = data.event_type === "rabah";

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link to="/crusades" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to reports
      </Link>
      <h1 className="mb-6 text-2xl font-bold">Edit crusade #{id}</h1>

      <form onSubmit={save} className="space-y-6">
        {/* Crusade details */}
        <Card>
          <CardHeader><CardTitle>Crusade details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Crusade type" required>
              <Select value={data.event_type || ""} onChange={(e) => set("event_type", e.target.value)}>
                {CRUSADE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Format">
              <Select value={data.format || "physical"} onChange={(e) => set("format", e.target.value)}>
                {FORMATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            {data.event_type === "other" && (
              <Field label="Specify type">
                <Input value={data.other_event_type || ""} onChange={(e) => set("other_event_type", e.target.value)} />
              </Field>
            )}
            <Field label="Event name" required>
              <Input value={data.event_name || ""} onChange={(e) => set("event_name", e.target.value)} />
            </Field>
            <Field label="Date" required>
              <Input type="date" value={data.event_date || ""} onChange={(e) => set("event_date", e.target.value)} />
            </Field>
            <Field label="Country" required>
              <Input value={data.country || ""} onChange={(e) => set("country", e.target.value)} />
            </Field>
            <Field label="City" required>
              <Input value={data.city || ""} onChange={(e) => set("city", e.target.value)} />
            </Field>
            <Field label="Venue" required>
              <Input value={data.venue || ""} onChange={(e) => set("venue", e.target.value)} />
            </Field>
            <Field label="Minister" required>
              <Input value={data.minister_name || ""} onChange={(e) => set("minister_name", e.target.value)} />
            </Field>
            <Field label="Onsite attendance">
              <Input type="number" min="0" value={data.attendance ?? 0} onChange={(e) => set("attendance", e.target.value)} />
            </Field>
            <Field label="Crusade expense">
              <Input type="number" min="0" step="0.01" value={data.crusade_expense ?? 0} onChange={(e) => set("crusade_expense", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {/* Organization hierarchy */}
        <Card>
          <CardHeader><CardTitle>Organization hierarchy</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Reporting level">
              <Select value={data.organization_type || ""} onChange={(e) => set("organization_type", e.target.value)}>
                {ORG_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </Field>
            <Field label="Zone">
              <Input value={data.zone || ""} onChange={(e) => set("zone", e.target.value)} />
            </Field>
            <Field label="Group">
              <Input value={data.group_name || ""} onChange={(e) => set("group_name", e.target.value)} />
            </Field>
            <Field label="Church">
              <Input value={data.church_name || ""} onChange={(e) => set("church_name", e.target.value)} />
            </Field>
            <Field label="Cell">
              <Input value={data.cell_name || ""} onChange={(e) => set("cell_name", e.target.value)} />
            </Field>
            <Field label="Network">
              <Input value={data.network_name || ""} onChange={(e) => set("network_name", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {/* Outcome metrics */}
        <Card>
          <CardHeader><CardTitle>Outcome metrics</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {CORE_OUTCOMES.map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input type="number" min="0" value={data[key] ?? 0} onChange={(e) => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {EXTENDED_OUTCOMES.map(([key, label]) => (
                <Field key={key} label={label}>
                  <Input type="number" min="0" value={data[key] ?? 0} onChange={(e) => set(key, e.target.value)} />
                </Field>
              ))}
            </div>
            {isRabah && (
              <div className="grid gap-4 sm:grid-cols-3">
                {RABAH_OUTCOMES.map(([key, label]) => (
                  <Field key={key} label={label}>
                    <Input type="number" min="0" value={data[key] ?? 0} onChange={(e) => set(key, e.target.value)} />
                  </Field>
                ))}
              </div>
            )}
            <Field label="Online participation">
              <Input type="number" min="0" value={data.online_participation ?? 0} onChange={(e) => set("online_participation", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {/* Reporter contact */}
        <Card>
          <CardHeader><CardTitle>Reporter contact</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Contact name">
              <Input value={data.contact_name || ""} onChange={(e) => set("contact_name", e.target.value)} />
            </Field>
            <Field label="Contact email">
              <Input value={data.contact_email || ""} onChange={(e) => set("contact_email", e.target.value)} />
            </Field>
            <Field label="Phone country code">
              <Input value={data.phone_country_code || ""} onChange={(e) => set("phone_country_code", e.target.value)} />
            </Field>
            <Field label="Phone number">
              <Input value={data.phone_number || ""} onChange={(e) => set("phone_number", e.target.value)} />
            </Field>
            <Field label="KingsChat username">
              <Input value={data.kingschat_username || ""} onChange={(e) => set("kingschat_username", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        {/* Highlights & media */}
        <Card>
          <CardHeader><CardTitle>Highlights & media</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <Field label="Highlights">
              <Input value={data.highlights || ""} onChange={(e) => set("highlights", e.target.value)} />
            </Field>
            <Field label="Photo links">
              <Input value={data.photo_links || ""} onChange={(e) => set("photo_links", e.target.value)} placeholder="One link per line" />
            </Field>
            <Field label="Video links">
              <Input value={data.video_links || ""} onChange={(e) => set("video_links", e.target.value)} placeholder="One link per line" />
            </Field>
            {(data.photos || []).length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium">Uploaded photos</p>
                <ul className="divide-y rounded-md border">
                  {data.photos.map((photo) => (
                    <li key={photo.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <a href={photo.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-blue-700 hover:underline">
                        {photo.original_name}
                      </a>
                      <span className="shrink-0 text-xs text-muted-foreground">{Math.round((photo.size_bytes || 0) / 1024)} KB</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate("/crusades")}>Cancel</Button>
          <Button type="submit" disabled={saving}>
            <Save className="size-4" /> {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
