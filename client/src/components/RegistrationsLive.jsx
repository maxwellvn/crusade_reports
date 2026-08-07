import * as React from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ChevronDown, FileDown, FileText, GripVertical, Maximize2, Minimize2, Plus, Radio, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Skeleton, LoadingRows } from "@/components/ui/skeleton";
import { getJSON, putJSON } from "@/lib/api";
import { GeoMap, BarH, nfull, orgHierarchy, typeLabel, Empty, StatTile } from "@/lib/dashboardWidgets";
import { continentOf, groupByContinent } from "@/lib/continents";

const POLL_MS = 10000;
const LS_KEY = "crusades-live-registrations-v1";
const KPI_TONES = {
  planned: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  zones_count: "bg-violet-50/80 [&_.stat-value]:!text-violet-700",
  groups_count: "bg-fuchsia-50/80 [&_.stat-value]:!text-fuchsia-700",
  churches_count: "bg-purple-50/80 [&_.stat-value]:!text-purple-700",
  cells_count: "bg-pink-50/80 [&_.stat-value]:!text-pink-700",
  networks_count: "bg-rose-50/80 [&_.stat-value]:!text-rose-700",
  cities_count: "bg-sky-50/80 [&_.stat-value]:!text-sky-700",
  expected_attendance: "bg-cyan-50/80 [&_.stat-value]:!text-cyan-700",
  countries_count: "bg-indigo-50/80 [&_.stat-value]:!text-indigo-700",
  continents_count: "bg-blue-50/80 [&_.stat-value]:!text-blue-700",
  confirmed: "bg-teal-50/80 [&_.stat-value]:!text-teal-700",
  reports_submitted: "bg-green-50/80 [&_.stat-value]:!text-green-700",
  awaiting_reports: "bg-amber-50/90 [&_.stat-value]:!text-amber-700",
};
const READINESS_LABELS = {
  confirmed: "Confirmed", pending: "Pending confirmation", preparing: "Preparing", ready: "Ready",
  holding: "Holding as planned", held: "Held", not_holding: "Not holding",
};
const titleCase = (value) => value ? value[0].toUpperCase() + value.slice(1) : "—";
const bars = (rows, label = (value) => value) => (rows || []).map((row) => ({
  key: row.key, label: label(row.key), value: row.planned || 0,
}));
const docDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

const textEncoder = new TextEncoder();
let crcTable;
function crc32(bytes) {
  crcTable ||= Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    return crc >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const bytesOf = (value) => textEncoder.encode(value);
const u16 = (value) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff);
const u32 = (value) => Uint8Array.of(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
const concatBytes = (parts) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

function buildZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = bytesOf(file.name);
    const content = bytesOf(file.content);
    const crc = crc32(content);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length), u16(name.length), u16(0), name, content,
    ]);
    const central = concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(content.length), u32(content.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralDirectory = concatBytes(centrals);
  return concatBytes([
    ...locals,
    centralDirectory,
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralDirectory.length), u32(offset), u16(0),
  ]);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function countryReportData(data) {
  const rows = [...(data.by_country || [])].sort((a, b) => (b.planned || 0) - (a.planned || 0));
  const grouped = new Map();
  for (const row of rows) {
    const continent = continentOf(row.key) || "Other";
    const group = grouped.get(continent) || { name: continent, rows: [], planned: 0, registrations: 0 };
    group.rows.push(row);
    group.planned += row.planned || 0;
    group.registrations += row.registrations || 0;
    grouped.set(continent, group);
  }
  const continents = [...grouped.values()].sort((a, b) => {
    if (a.name === "Other") return 1;
    if (b.name === "Other") return -1;
    return b.planned - a.planned || a.name.localeCompare(b.name);
  });
  return {
    rows,
    continents,
    totalCrusades: rows.reduce((sum, row) => sum + (row.planned || 0), 0),
    totalRegistrations: rows.reduce((sum, row) => sum + (row.registrations || 0), 0),
    generatedAt: docDate.format(new Date()),
  };
}

function buildCountryRegistrationsReportHtml(data) {
  const { rows, continents, totalCrusades, totalRegistrations, generatedAt } = countryReportData(data);
  let countryIndex = 0;
  const tableRows = continents.map((continent) => `
    <tr class="continent-row">
      <td></td>
      <td>${escapeHtml(continent.name)} <span>${continent.rows.length} ${continent.rows.length === 1 ? "country" : "countries"}</span></td>
      <td class="num">${nfull.format(continent.planned)}</td>
      <td class="num">${nfull.format(continent.registrations)}</td>
    </tr>
    ${continent.rows.map((row) => {
      countryIndex += 1;
      return `<tr class="country-row">
        <td>${countryIndex}</td>
        <td>${escapeHtml(row.key || "Unspecified")}</td>
        <td class="num">${nfull.format(row.planned || 0)}</td>
        <td class="num">${nfull.format(row.registrations || 0)}</td>
      </tr>`;
    }).join("")}
  `).join("");
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Registrations by Continent and Country</title>
        <style>
          @page { margin: 0.65in; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.45; }
          .eyebrow { color: #1d4ed8; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
          h1 { margin: 6px 0 4px; font-size: 24px; color: #0f172a; }
          .meta { margin: 0 0 22px; color: #475569; font-size: 12px; }
          .summary { width: 100%; border-collapse: collapse; margin: 0 0 22px; border: 1px solid #475569; border-bottom: 6px solid #1d4ed8; }
          .summary td { width: 33.333%; background: #262626; border-right: 1px solid #475569; padding: 11px 13px 28px; vertical-align: top; }
          .summary td:last-child { border-right: 0; }
          .summary .label { display: block; color: #cbd5e1; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; }
          .summary .value { display: block; margin-top: 1px; font-size: 18px; line-height: 1; font-weight: 700; color: #93c5fd; }
          table.report { width: 100%; border-collapse: collapse; font-size: 12px; }
          .report th { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; padding: 9px 10px; text-align: left; }
          .report td { border: 1px solid #dbe4ef; padding: 8px 10px; }
          .report .continent-row { break-inside: avoid; page-break-inside: avoid; }
          .report .continent-row td { background: #dbeafe; border-color: #bfdbfe; color: #1e3a8a; font-weight: 700; padding-top: 10px; padding-bottom: 10px; }
          .report .continent-row span { margin-left: 6px; color: #475569; font-size: 10px; font-weight: 400; text-transform: uppercase; }
          .report .country-row:nth-child(odd) td { background: #f8fafc; }
          .report .country-row td:nth-child(2) { padding-left: 26px; }
          .num { text-align: right; font-variant-numeric: tabular-nums; }
          .footer { margin-top: 20px; color: #64748b; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="eyebrow">Crusade registrations report</div>
        <h1>Registrations by Continent and Country</h1>
        <p class="meta">Generated ${escapeHtml(generatedAt)} from the live registrations dashboard. ${nfull.format(continents.length)} continents represented.</p>
        <table class="summary">
          <tr>
            <td><span class="label">Countries represented:</span><span class="value">${nfull.format(rows.length)}</span></td>
            <td><span class="label">Registered crusades:</span><span class="value">${nfull.format(totalCrusades)}</span></td>
            <td><span class="label">Registration entries:</span><span class="value">${nfull.format(totalRegistrations)}</span></td>
          </tr>
        </table>
        <table class="report">
          <thead><tr><th style="width: 48px;">#</th><th>Continent / Country</th><th class="num">Registered crusades</th><th class="num">Registration entries</th></tr></thead>
          <tbody>${tableRows || `<tr><td colspan="4">No country registrations available.</td></tr>`}</tbody>
        </table>
        <p class="footer">Prepared for internal campaign tracking and operational reporting.</p>
      </body>
    </html>
  `;
}

const wText = (value, props = "") => `<w:r>${props}<w:t>${escapeHtml(value)}</w:t></w:r>`;
const wParagraph = (runs, props = "") => `<w:p>${props}${runs}</w:p>`;
const wCell = (content, { width = 2400, fill, color, bold, size = 22, align = "left" } = {}) => `
  <w:tc>
    <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:fill="${fill}"/>` : ""}</w:tcPr>
    ${wParagraph(wText(content, `<w:rPr>${bold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/></w:rPr>`), `<w:pPr><w:jc w:val="${align}"/></w:pPr>`)}
  </w:tc>
`;
const wRow = (cells) => `<w:tr>${cells.join("")}</w:tr>`;

function buildCountryRegistrationsDocxXml(data) {
  const { rows, continents, totalCrusades, totalRegistrations, generatedAt } = countryReportData(data);
  let countryIndex = 0;
  const reportRows = continents.length ? continents.map((continent) => [
    wRow([
      wCell("", { width: 700, fill: "DBEAFE" }),
      wCell(`${continent.name} (${continent.rows.length} ${continent.rows.length === 1 ? "country" : "countries"})`, { width: 4600, fill: "DBEAFE", color: "1E3A8A", bold: true }),
      wCell(nfull.format(continent.planned), { width: 2200, fill: "DBEAFE", color: "1E3A8A", bold: true, align: "right" }),
      wCell(nfull.format(continent.registrations), { width: 2200, fill: "DBEAFE", color: "1E3A8A", bold: true, align: "right" }),
    ]),
    ...continent.rows.map((row) => {
      countryIndex += 1;
      return wRow([
        wCell(String(countryIndex), { width: 700 }),
        wCell(`   ${row.key || "Unspecified"}`, { width: 4600 }),
        wCell(nfull.format(row.planned || 0), { width: 2200, align: "right" }),
        wCell(nfull.format(row.registrations || 0), { width: 2200, align: "right" }),
      ]);
    }),
  ]).flat().join("") : wRow([wCell("No country registrations available.", { width: 9700 })]);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${wParagraph(wText("CRUSADE REGISTRATIONS REPORT", '<w:rPr><w:b/><w:color w:val="1D4ED8"/><w:sz w:val="22"/></w:rPr>'))}
        ${wParagraph(wText("Registrations by Continent and Country", '<w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="48"/></w:rPr>'))}
        ${wParagraph(wText(`Generated ${generatedAt} from the live registrations dashboard. ${nfull.format(continents.length)} continents represented.`, '<w:rPr><w:color w:val="475569"/><w:sz w:val="22"/></w:rPr>'))}
        <w:tbl>
          <w:tblPr><w:tblW w:w="9700" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="475569"/><w:left w:val="single" w:sz="4" w:color="475569"/><w:bottom w:val="single" w:sz="18" w:color="1D4ED8"/><w:right w:val="single" w:sz="4" w:color="475569"/><w:insideH w:val="single" w:sz="4" w:color="475569"/><w:insideV w:val="single" w:sz="4" w:color="475569"/></w:tblBorders></w:tblPr>
          ${wRow([
            wCell(`COUNTRIES REPRESENTED:\n${nfull.format(rows.length)}`, { width: 3233, fill: "262626", color: "93C5FD", bold: true, size: 24 }),
            wCell(`REGISTERED CRUSADES:\n${nfull.format(totalCrusades)}`, { width: 3233, fill: "262626", color: "93C5FD", bold: true, size: 24 }),
            wCell(`REGISTRATION ENTRIES:\n${nfull.format(totalRegistrations)}`, { width: 3233, fill: "262626", color: "93C5FD", bold: true, size: 24 }),
          ])}
        </w:tbl>
        ${wParagraph("")}
        <w:tbl>
          <w:tblPr><w:tblW w:w="9700" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="BFDBFE"/><w:left w:val="single" w:sz="4" w:color="BFDBFE"/><w:bottom w:val="single" w:sz="4" w:color="BFDBFE"/><w:right w:val="single" w:sz="4" w:color="BFDBFE"/><w:insideH w:val="single" w:sz="4" w:color="DBE4EF"/><w:insideV w:val="single" w:sz="4" w:color="DBE4EF"/></w:tblBorders></w:tblPr>
          ${wRow([
            wCell("#", { width: 700, fill: "EFF6FF", color: "1E3A8A", bold: true }),
            wCell("Continent / Country", { width: 4600, fill: "EFF6FF", color: "1E3A8A", bold: true }),
            wCell("Registered crusades", { width: 2200, fill: "EFF6FF", color: "1E3A8A", bold: true, align: "right" }),
            wCell("Registration entries", { width: 2200, fill: "EFF6FF", color: "1E3A8A", bold: true, align: "right" }),
          ])}
          ${reportRows}
        </w:tbl>
        ${wParagraph(wText("Prepared for internal campaign tracking and operational reporting.", '<w:rPr><w:color w:val="64748B"/><w:sz w:val="20"/></w:rPr>'))}
        <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="936" w:right="936" w:bottom="936" w:left="936" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>
      </w:body>
    </w:document>`;
}

function downloadCountryRegistrationsDocx(data, filename) {
  const zip = buildZip([
    { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
    { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
    { name: "word/_rels/document.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>` },
    { name: "word/document.xml", content: buildCountryRegistrationsDocxXml(data) },
  ]);
  downloadBlob(filename, new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
}

function downloadCountryRegistrationsReport(data, format = "word") {
  const date = new Date().toISOString().slice(0, 10);
  const html = buildCountryRegistrationsReportHtml(data);
  if (format === "pdf") {
    // Avoid "noopener" in window features — Chrome opens about:blank but returns a
    // window we cannot write into, so the report never appears.
    const printWindow = window.open("", "_blank", "width=960,height=720");
    if (!printWindow) {
      toast.error("Allow pop-ups to export this report as PDF.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.opener = null;
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
    return;
  }
  downloadCountryRegistrationsDocx(data, `registrations-by-continent-and-country-${date}.docx`);
}

async function copyCountriesWithoutRegistrations() {
  try {
    const { countries, total } = await getJSON("/registrations/countries-without-registrations");
    const list = countries.map((c) => c.name).join("\n");
    await navigator.clipboard.writeText(list);
    toast.success(`Copied ${nfull.format(total)} countries without registrations`);
  } catch {
    toast.error("Could not copy countries without registrations");
  }
}

function timeAgo(sqliteUtc) {
  const s = Math.max(0, (Date.now() - new Date(sqliteUtc.replace(" ", "T") + "Z")) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const LIVE_WIDGETS = {
  planned: { title: "Crusades planned", kpi: true, filter: {}, render: (d) => <StatTile label="Crusades planned" value={nfull.format(d.totals.planned)} /> },
  zones_count: { title: "Zone crusades", kpi: true, filter: { organization_type: "zone" }, render: (d) => <StatTile label="Zone crusades" value={nfull.format(d.totals.zone_crusades)} /> },
  groups_count: { title: "Group crusades", kpi: true, filter: { organization_type: "group" }, render: (d) => <StatTile label="Group crusades" value={nfull.format(d.totals.group_crusades)} /> },
  churches_count: { title: "Church crusades", kpi: true, filter: { organization_type: "church" }, render: (d) => <StatTile label="Church crusades" value={nfull.format(d.totals.church_crusades)} /> },
  cells_count: { title: "Cell crusades", kpi: true, filter: { organization_type: "cell" }, render: (d) => <StatTile label="Cell crusades" value={nfull.format(d.totals.cell_crusades)} /> },
  networks_count: { title: "Network crusades", kpi: true, filter: { organization_type: "network" }, render: (d) => <StatTile label="Network crusades" value={nfull.format(d.totals.network_crusades)} /> },
  countries_count: { title: "Countries", kpi: true, filter: {}, render: (d) => <StatTile label="Countries" value={nfull.format(d.totals.countries)} /> },
  continents_count: { title: "Continents", kpi: true, filter: {}, render: (d) => <StatTile label="Continents" value={nfull.format(groupByContinent(d.by_country).length)} /> },
  cities_count: { title: "Cities", kpi: true, filter: {}, render: (d) => <StatTile label="Cities" value={nfull.format(d.totals.cities)} /> },
  expected_attendance: { title: "Expected attendance", kpi: true, filter: {}, render: (d) => <StatTile label="Expected attendance" value={nfull.format(d.totals.expected_attendance)} /> },
  confirmed: { title: "Confirmed crusades", kpi: true, filter: { readiness_status: "confirmed" }, render: (d) => <StatTile label="Confirmed crusades" value={nfull.format(d.totals.confirmed)} /> },
  reports_submitted: { title: "Reports submitted", kpi: true, filter: { report_status: "reported" }, render: (d) => <StatTile label="Reports submitted" value={nfull.format(d.totals.reported)} /> },
  awaiting_reports: { title: "Awaiting reports", kpi: true, filter: { report_status: "unreported" }, render: (d) => <StatTile label="Awaiting reports" value={nfull.format(Math.max(d.totals.awaiting, 0))} /> },
  coverage: {
    title: "Registration coverage", size: 2,
    render: (d, _x, go) => <GeoMap
      rows={d.by_country.map((row) => ({ key: row.key, attendance: row.planned, crusades: row.registrations }))}
      cities={d.geo.map((city) => ({ key: city.key, country: city.country, lat: city.lat, lng: city.lng, attendance: city.planned, crusades: city.planned }))}
      onSelect={(row) => go("country", row.key)} emptyText="The map lights up as registrations arrive." />,
  },
  recent: {
    title: "As they happen", size: 2,
    render: (d, _x, go) => !d.recent.length ? <Empty text="No registrations yet — they’ll appear here live." /> : (
      <ul className="divide-y">
        {d.recent.map((row) => (
          <li key={row.id} onClick={() => go("q", row.org)} className="flex cursor-pointer items-baseline justify-between gap-3 py-2.5 hover:bg-accent/50">
            <div className="min-w-0"><p className="text-sm font-medium">{orgHierarchy(row)}</p><p className="text-xs text-muted-foreground">{row.country} · plan date {row.plan_date}</p></div>
            <div className="shrink-0 text-right"><p className="text-sm font-semibold tabular-nums">{nfull.format(row.planned)}</p><p className="text-xs text-muted-foreground">{timeAgo(row.created_at)}</p></div>
          </li>
        ))}
      </ul>
    ),
  },
  types: { title: "Planned by crusade type", filter: "event_type", render: (d, x, go) => <BarH rows={bars(d.by_type, typeLabel)} expanded={x} onRowClick={(row) => go("event_type", row.key)} /> },
  countries: { title: "Registrations by country", filter: "country", render: (d, x, go) => <BarH rows={bars(d.by_country)} expanded={x} onRowClick={(row) => go("country", row.key)} /> },
  continents: { title: "Crusades by continent", render: (d, x) => <BarH rows={bars(groupByContinent(d.by_country))} expanded={x} /> },
  zones: { title: "Registrations by zone", filter: "zone", render: (d, x, go) => <BarH rows={bars(d.by_zone)} expanded={x} onRowClick={(row) => go("zone", row.key)} /> },
  groups: { title: "Registrations by group", filter: "group_name", render: (d, x, go) => <BarH rows={bars(d.by_group)} expanded={x} onRowClick={(row) => go("group_name", row.key)} /> },
  churches: { title: "Registrations by church", filter: "church_name", render: (d, x, go) => <BarH rows={bars(d.by_church)} expanded={x} onRowClick={(row) => go("church_name", row.key)} /> },
  cells: { title: "Registrations by cell", filter: "cell_name", render: (d, x, go) => <BarH rows={bars(d.by_cell)} expanded={x} onRowClick={(row) => go("cell_name", row.key)} /> },
  networks: { title: "Registrations by network", filter: "network_name", render: (d, x, go) => <BarH rows={bars(d.by_network)} expanded={x} onRowClick={(row) => go("network_name", row.key)} /> },
  cities: { title: "Top registration cities", filter: "city", render: (d, x, go) => <BarH rows={bars(d.by_city)} expanded={x} onRowClick={(row) => go("city", row.key)} /> },
  organization_types: { title: "By registration level", filter: "organization_type", render: (d, x, go) => <BarH rows={bars(d.by_org_type, titleCase)} expanded={x} onRowClick={(row) => go("organization_type", row.key)} /> },
  readiness: { title: "Readiness status", filter: "readiness_status", render: (d, x, go) => <BarH rows={bars(d.by_readiness, (key) => READINESS_LABELS[key] || titleCase(key))} expanded={x} onRowClick={(row) => go("readiness_status", row.key)} /> },
};

const KPI_IDS = new Set(Object.entries(LIVE_WIDGETS).filter(([, widget]) => widget.kpi).map(([id]) => id));
const DEFAULT_LAYOUT = Object.keys(LIVE_WIDGETS).map((id) => ({ id, expanded: false }));

export function RegistrationsLive() {
  const navigate = useNavigate();
  const [data, setData] = React.useState(null);
  const [layout, setLayout] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY));
      if (Array.isArray(saved)) return saved.filter((widget) => LIVE_WIDGETS[widget.id]);
    } catch { /* use default */ }
    return DEFAULT_LAYOUT;
  });
  const loadedFromServer = React.useRef(false);
  const dragId = React.useRef(null);

  React.useEffect(() => {
    let failed = false;
    const load = () => getJSON("/registrations/live").then(setData).catch(() => {
      if (!failed) { failed = true; toast.error("Could not load live registrations"); }
    });
    load();
    const timer = setInterval(load, POLL_MS);
    getJSON("/dashboard-layout?scope=registrations").then(({ layout: saved }) => {
      loadedFromServer.current = true;
      if (Array.isArray(saved) && saved.length) setLayout(saved.filter((widget) => LIVE_WIDGETS[widget.id]));
    }).catch(() => { loadedFromServer.current = true; });
    return () => clearInterval(timer);
  }, []);

  React.useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(layout));
    if (loadedFromServer.current) putJSON("/dashboard-layout?scope=registrations", { layout }).catch(() => toast.error("Could not save live dashboard layout"));
  }, [layout]);

  const hidden = Object.keys(LIVE_WIDGETS).filter((id) => !layout.some((widget) => widget.id === id));
  const patch = (id, values) => setLayout((current) => current.map((widget) => widget.id === id ? { ...widget, ...values } : widget));
  const go = (field, value) => navigate(`/registrations?${new URLSearchParams({ [field]: value }).toString()}`);
  const goFilters = (filters) => navigate(`/registrations?${new URLSearchParams(filters).toString()}`);

  function dropOn(targetId) {
    const sourceId = dragId.current;
    dragId.current = null;
    if (!sourceId || sourceId === targetId) return;
    setLayout((current) => {
      const next = current.filter((widget) => widget.id !== sourceId);
      next.splice(next.findIndex((widget) => widget.id === targetId), 0, current.find((widget) => widget.id === sourceId));
      return next;
    });
  }

  if (!data) return (
    <div className="mx-auto max-w-5xl space-y-4" role="status" aria-label="Loading">
      <Skeleton className="h-24" /><div className="grid gap-4 sm:grid-cols-2"><Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card><Card><CardContent className="pt-6"><LoadingRows rows={5} /></CardContent></Card></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl"><div className="flex flex-wrap items-center gap-3"><h2 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950">Live registrations</h2><span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 print:hidden"><Radio className="size-3.5 animate-pulse" /> Live</span></div><p className="mt-2 text-sm leading-6 text-slate-600">Crusade plans, geographic coverage and readiness as registrations arrive. Updates every 10 seconds.</p></div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {hidden.length > 0 && <details className="relative">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-accent [&::-webkit-details-marker]:hidden"><Plus /> Add widget</summary>
            <div className="absolute right-0 z-20 mt-1 max-h-80 w-64 overflow-y-auto border bg-popover p-1">
              {hidden.map((id) => <button key={id} type="button" className="w-full px-2 py-1.5 text-left text-sm hover:bg-accent" onClick={(event) => { setLayout((current) => [...current, { id, expanded: false }]); event.target.closest("details").open = false; }}>{LIVE_WIDGETS[id].title}</button>)}
            </div>
          </details>}
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()} title="Export this dashboard as a PDF"><FileDown /> Export PDF</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLayout(DEFAULT_LAYOUT)}><RotateCcw /> Reset</Button>
        </div>
      </div>

      {layout.some((widget) => KPI_IDS.has(widget.id)) && <section aria-labelledby="registration-pulse-heading" className="overflow-hidden border-y border-blue-200 bg-white shadow-[0_18px_45px_-34px_rgba(37,99,235,0.35)] print:shadow-none">
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50/70 px-5 py-3"><h3 id="registration-pulse-heading" className="text-xs font-semibold text-blue-900">Registration pulse</h3><p className="text-xs text-slate-500">Live planning totals</p></div>
        <div className="grid grid-cols-2 lg:grid-cols-4">
        {layout.filter((widget) => KPI_IDS.has(widget.id)).map(({ id }, index) => <div key={id} className={`group relative min-h-32 border-blue-100 ${KPI_TONES[id] || "bg-white [&_.stat-value]:!text-blue-700"} ${index % 2 ? "border-l" : ""} ${index >= 2 ? "border-t" : ""} ${index >= 4 ? "lg:border-t" : "lg:border-t-0"} ${index % 4 ? "lg:border-l" : "lg:border-l-0"}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(id)}>
          <button type="button" className="h-full w-full p-5 text-left" onClick={() => goFilters(LIVE_WIDGETS[id].filter)}>{LIVE_WIDGETS[id].render(data)}</button>
          <div className="absolute right-1.5 top-1.5 flex opacity-0 group-hover:opacity-100 print:hidden"><span draggable title="Drag to rearrange" className="cursor-grab p-1 text-muted-foreground" onDragStart={() => { dragId.current = id; }}><GripVertical /></span><button type="button" title="Remove widget" aria-label={`Remove ${LIVE_WIDGETS[id].title}`} className="p-1 text-muted-foreground hover:text-destructive" onClick={() => setLayout((current) => current.filter((widget) => widget.id !== id))}><X /></button></div>
        </div>)}
        </div>
      </section>}

      <section aria-labelledby="registration-breakdowns-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-4"><div><h3 id="registration-breakdowns-heading" className="text-lg font-semibold text-slate-950">Registration breakdowns</h3><p className="mt-1 text-sm text-slate-500">Select a row or location to open matching registrations.</p></div><span className="text-xs tabular-nums text-slate-500">{layout.filter((widget) => !KPI_IDS.has(widget.id)).length} visible</span></div>
      <div className="grid gap-5 sm:grid-cols-2">
        {layout.filter((widget) => !KPI_IDS.has(widget.id)).map(({ id, expanded }) => {
          const widget = LIVE_WIDGETS[id];
          return <Card key={id} className={`rounded-none border-x-0 border-slate-200 shadow-none ${expanded || widget.size === 2 ? "sm:col-span-2" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(id)}>
            <CardHeader className="flex-row items-center justify-between space-y-0 bg-slate-50/70 px-4 py-3">
              <div className="flex min-w-0 items-center gap-1.5"><span draggable title="Drag to rearrange" className="cursor-grab text-muted-foreground print:hidden" onDragStart={() => { dragId.current = id; }}><GripVertical /></span><div><CardTitle className="text-sm">{widget.title}</CardTitle>{id === "coverage" && <CardDescription>Click a location to open matching registrations.</CardDescription>}</div></div>
              <div className="flex items-center gap-1 text-muted-foreground print:hidden">
                {id === "countries" && (
                  <details className="relative inline-flex shrink-0">
                    <summary title="Download report" aria-label="Download registrations by country report" className="flex h-8 cursor-pointer list-none items-center rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 [&::-webkit-details-marker]:hidden">
                      <FileDown className="size-3.5" />
                      <ChevronDown className="ml-1 size-3" />
                    </summary>
                    <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg">
                      <p className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Registered countries</p>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50 hover:text-blue-700" onClick={(event) => { downloadCountryRegistrationsReport(data, "pdf"); event.currentTarget.closest("details").open = false; }}>
                        <FileDown className="size-4" /> PDF
                      </button>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-blue-50 hover:text-blue-700" onClick={(event) => { downloadCountryRegistrationsReport(data, "word"); event.currentTarget.closest("details").open = false; }}>
                        <FileText className="size-4" /> Word
                      </button>
                      <hr className="my-1 border-slate-200" />
                      <p className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wide">Unregistered countries</p>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-amber-50 hover:text-amber-700" onClick={(event) => { copyCountriesWithoutRegistrations(); event.currentTarget.closest("details").open = false; }}>
                        <FileText className="size-4" /> Copy list to clipboard
                      </button>
                    </div>
                  </details>
                )}
                {widget.size !== 2 && <button type="button" title={expanded ? "Collapse widget" : "Expand widget"} aria-label={`${expanded ? "Collapse" : "Expand"} ${widget.title}`} className="flex size-8 items-center justify-center rounded-md hover:bg-accent hover:text-foreground" onClick={() => patch(id, { expanded: !expanded })}>{expanded ? <Minimize2 /> : <Maximize2 />}</button>}
                <button type="button" title="Remove widget" aria-label={`Remove ${widget.title}`} className="flex size-8 items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive" onClick={() => setLayout((current) => current.filter((item) => item.id !== id))}><X /></button>
              </div>
            </CardHeader>
            <CardContent className="px-4 py-5">{widget.render(data, expanded, go)}</CardContent>
          </Card>;
        })}
      </div>
      </section>
    </div>
  );
}
