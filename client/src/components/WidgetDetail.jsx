import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { LoadingRows } from "@/components/ui/skeleton";
import { getJSON } from "@/lib/api";
import { WIDGETS, DRILL_MAP, BarH, asBars, Empty } from "@/lib/dashboardWidgets";

// Full-page breakdown for one drillable widget — everything the dashboard card
// truncates, plus a click-through into the filtered crusade rows. Only
// breakdown widgets (DRILL_MAP) have this; single-number tiles and widgets
// like "Outcomes breakdown" have no crusade-level dimension to drill into.
export function WidgetDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [stats, setStats] = React.useState(null);

  React.useEffect(() => {
    getJSON("/stats").then(setStats).catch(() => toast.error("Could not load stats"));
  }, []);

  const drill = DRILL_MAP[id];
  const widget = WIDGETS[id];
  if (!drill || !widget) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: "Not available" }]} />
        <p className="text-sm text-muted-foreground">This widget has no full-page breakdown.</p>
      </div>
    );
  }

  const rows = stats ? asBars(stats[drill.statKey], drill.labelFn) : [];

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Breadcrumbs items={[{ label: "Reports dashboard", to: "/dashboard" }, { label: widget.title }]} />
      <Card>
        <CardHeader>
          <CardTitle>{widget.title}</CardTitle>
          <CardDescription>Every value, ranked — click a row to see its matching crusades.</CardDescription>
        </CardHeader>
        <CardContent>
          {!stats ? <LoadingRows rows={8} />
            : rows.length ? (
              <BarH rows={rows} expanded onRowClick={(row) => navigate(`/crusades?${drill.filterField}=${encodeURIComponent(row.key ?? row.label)}`)} />
            ) : <Empty />}
        </CardContent>
      </Card>
    </div>
  );
}
