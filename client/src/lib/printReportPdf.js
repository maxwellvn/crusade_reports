import { toast } from "sonner";

const docDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" });

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

export function openPrintReport(html, title = "Report") {
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=960,height=720");
  if (!printWindow) {
    toast.error("Allow pop-ups to export this report as PDF.");
    return false;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.title = title;
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 300);
  return true;
}

/** Shared NOTC-styled print report shell (blue / slate portal colours). */
export function buildNotcReportHtml({
  eyebrow,
  title,
  meta,
  summary = [],
  columns,
  rows,
  sections = [],
  footer = "Prepared for Night of a Thousand Crusades (NOTC) operational reporting.",
}) {
  const generatedAt = docDate.format(new Date());
  const summaryCells = summary.map((item) => `
    <td><span class="label">${escapeHtml(item.label)}</span><span class="value">${escapeHtml(item.value)}</span></td>
  `).join("");

  const tableHead = columns?.length
    ? `<thead><tr>${columns.map((col) => `<th class="${col.align === "right" ? "num" : ""}">${escapeHtml(col.header)}</th>`).join("")}</tr></thead>`
    : "";

  const tableBody = rows?.length
    ? `<tbody>${rows.map((row) => `
        <tr>${columns.map((col) => {
          const value = typeof col.value === "function" ? col.value(row) : row[col.key];
          return `<td class="${col.align === "right" ? "num" : ""}">${escapeHtml(value ?? "—")}</td>`;
        }).join("")}</tr>
      `).join("")}</tbody>`
    : "";

  const sectionHtml = sections.map((section) => `
    <h2 class="section-title">${escapeHtml(section.title)}</h2>
    ${section.intro ? `<p class="meta">${escapeHtml(section.intro)}</p>` : ""}
    <table class="report">
      <thead><tr>${section.columns.map((col) => `<th class="${col.align === "right" ? "num" : ""}">${escapeHtml(col.header)}</th>`).join("")}</tr></thead>
      <tbody>${(section.rows || []).map((row) => `
        <tr class="${row._section ? "section-row" : ""}">${section.columns.map((col) => {
          const value = typeof col.value === "function" ? col.value(row) : row[col.key];
          return `<td class="${col.align === "right" ? "num" : ""}">${escapeHtml(value ?? "—")}</td>`;
        }).join("")}</tr>
      `).join("") || `<tr><td colspan="${section.columns.length}">No rows available.</td></tr>`}</tbody>
    </table>
  `).join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { margin: 0.65in; }
      body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.45; }
      .eyebrow { color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { margin: 6px 0 4px; font-size: 24px; color: #0f172a; }
      .section-title { margin: 28px 0 8px; font-size: 16px; color: #1e3a8a; }
      .meta { margin: 0 0 18px; color: #475569; font-size: 12px; }
      .summary { width: 100%; border-collapse: collapse; margin: 0 0 22px; border: 1px solid #475569; border-bottom: 6px solid #1d4ed8; }
      .summary td { background: #0f172a; border-right: 1px solid #475569; padding: 11px 13px 24px; vertical-align: top; }
      .summary td:last-child { border-right: 0; }
      .summary .label { display: block; color: #cbd5e1; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
      .summary .value { display: block; margin-top: 2px; font-size: 18px; line-height: 1.1; font-weight: 700; color: #93c5fd; }
      table.report { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
      .report th { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 9px 10px; text-align: left; }
      .report td { border: 1px solid #dbe4ef; padding: 8px 10px; }
      .report tr:nth-child(even) td { background: #f8fafc; }
      .report .section-row td { background: #dbeafe; border-color: #bfdbfe; color: #1e3a8a; font-weight: 700; }
      .num { text-align: right; font-variant-numeric: tabular-nums; }
      .footer { margin-top: 20px; color: #64748b; font-size: 11px; }
    </style>
  </head>
  <body>
    <div class="eyebrow">${escapeHtml(eyebrow)}</div>
    <h1>${escapeHtml(title)}</h1>
    <p class="meta">Generated ${escapeHtml(generatedAt)}${meta ? `. ${escapeHtml(meta)}` : ""}</p>
    ${summary.length ? `<table class="summary"><tr>${summaryCells}</tr></table>` : ""}
    ${columns?.length ? `<table class="report">${tableHead}${tableBody || `<tbody><tr><td colspan="${columns.length}">No rows available.</td></tr></tbody>`}</table>` : ""}
    ${sectionHtml}
    <p class="footer">${escapeHtml(footer)}</p>
  </body>
</html>`;
}
