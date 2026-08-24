export const DIRECT_REPORT_COMMIT_THRESHOLD = 100;

export function portalReportPreview(validated, summary) {
  const commitRequired = validated.length > DIRECT_REPORT_COMMIT_THRESHOLD;
  return {
    ok: true,
    errors: [],
    summary,
    commit_required: commitRequired,
    rows: commitRequired ? [] : validated.map((entry) => ({
      row_number: entry.row_number,
      registration_item_id: entry.item.id,
      event_name: entry.item.event_name,
      event_date: entry.body.crusade.event_date,
      attendance: entry.body.crusade.attendance + entry.body.crusade.online_participation,
      photo_links: entry.body.photo_links,
      video_links: entry.body.video_links,
    })),
  };
}
