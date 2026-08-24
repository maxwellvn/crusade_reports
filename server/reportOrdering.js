export const ADMIN_REPORT_ORDER = "c.created_at DESC, c.id DESC";
export const PORTAL_UNREGISTERED_REPORT_ORDER = "created_at DESC, id DESC";

export function portalItemOrder(view) {
  if (view === "reports") {
    return `CASE WHEN crusades.report_id IS NULL THEN 1 ELSE 0 END ASC,
            crusades.created_at DESC,
            COALESCE(registration_items.event_date, registration_items.plan_date) DESC,
            registration_items.id DESC`;
  }
  return "COALESCE(registration_items.event_date, registration_items.plan_date), registration_items.id";
}
