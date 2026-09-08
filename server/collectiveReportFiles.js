import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { METRIC_LABELS, ORG_TYPE_LABELS } from "./labels.js";

const BLUE = "#173B8F";
const NAVY = "#0B1739";
const GOLD = "#D9A514";
const PALE_BLUE = "#EEF4FF";
const PALE_GOLD = "#FFF8E5";
const INK = "#172033";
const MUTED = "#5E6B82";
const BORDER = "#D8E0EC";
const number = new Intl.NumberFormat("en-US");

const n = (value) => number.format(Number(value) || 0);
const titleCase = (value) => String(value || "Not specified")
  .replaceAll("_", " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const metricLabel = (key) => METRIC_LABELS[key] || titleCase(key);
const orgLabel = (key) => ORG_TYPE_LABELS[key] || titleCase(key);
const reportDate = (iso) => new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso));

function collectPdf(document) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

export async function buildCollectiveReportPdf(data) {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 52, right: 44, bottom: 52, left: 44 },
    bufferPages: true,
    info: {
      Title: "Comprehensive Crusade Report",
      Author: "Night of a Thousand Crusades",
      Subject: "Collective registration and report summary",
    },
  });
  const complete = collectPdf(document);
  const left = document.page.margins.left;
  const width = document.page.width - left - document.page.margins.right;
  const bottom = () => document.page.height - document.page.margins.bottom - 8;

  const pageHeader = () => {
    document.fillColor(NAVY).font("Helvetica-Bold").fontSize(8)
      .text("NIGHT OF A THOUSAND CRUSADES", left, 25, { characterSpacing: 1.1 });
    document.strokeColor(GOLD).lineWidth(1).moveTo(left, 40).lineTo(left + width, 40).stroke();
    document.y = 52;
  };
  const addPage = () => { document.addPage(); pageHeader(); };
  const ensure = (height) => { if (document.y + height > bottom()) addPage(); };
  const sectionTitle = (title, note = "") => {
    ensure(note ? 64 : 46);
    document.fillColor(NAVY).font("Helvetica-Bold").fontSize(16).text(title, left, document.y);
    if (note) document.moveDown(0.25).fillColor(MUTED).font("Helvetica").fontSize(8.5).text(note, { width });
    document.moveDown(0.7);
    document.strokeColor(GOLD).lineWidth(1.5).moveTo(left, document.y).lineTo(left + width, document.y).stroke();
    document.moveDown(0.65);
  };
  const summaryGrid = (items, columns = 3) => {
    const gap = 8;
    const cellWidth = (width - gap * (columns - 1)) / columns;
    const rows = Math.ceil(items.length / columns);
    ensure(rows * 66 + (rows - 1) * gap);
    const startY = document.y;
    items.forEach((item, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = left + column * (cellWidth + gap);
      const y = startY + row * 74;
      document.save().roundedRect(x, y, cellWidth, 66, 3).fill(index % 2 ? PALE_BLUE : PALE_GOLD).restore();
      document.fillColor(MUTED).font("Helvetica-Bold").fontSize(7.5).text(item.label.toUpperCase(), x + 10, y + 10, { width: cellWidth - 20 });
      document.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(n(item.value), x + 10, y + 31, { width: cellWidth - 20 });
    });
    document.y = startY + rows * 74 + 4;
  };
  const table = (columns, rows, { empty = "No records available." } = {}) => {
    const columnWidths = columns.map((column) => column.width * width);
    const rowHeight = (row, header = false) => Math.max(25, ...columns.map((column, index) => {
      const text = header ? column.label : column.value(row);
      return document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 7.5 : 8)
        .heightOfString(String(text ?? ""), { width: columnWidths[index] - 12, lineGap: 1 }) + 12;
    }));
    const drawHeader = () => {
      ensure(26);
      const y = document.y;
      let x = left;
      const height = rowHeight({}, true);
      document.save().rect(left, y, width, height).fill(PALE_BLUE).restore();
      columns.forEach((column, index) => {
        document.fillColor(BLUE).font("Helvetica-Bold").fontSize(7.5)
          .text(column.label, x + 6, y + 7, { width: columnWidths[index] - 12, align: column.align || "left" });
        x += columnWidths[index];
      });
      document.y = y + height;
    };
    drawHeader();
    if (!rows.length) {
      document.fillColor(MUTED).font("Helvetica").fontSize(8.5).text(empty, left + 6, document.y + 10);
      document.y += 30;
      return;
    }
    rows.forEach((row, rowIndex) => {
      const height = rowHeight(row);
      if (document.y + height > bottom()) { addPage(); drawHeader(); }
      const y = document.y;
      if (rowIndex % 2) document.save().rect(left, y, width, height).fill("#F8FAFC").restore();
      document.strokeColor(BORDER).lineWidth(0.4).moveTo(left, y + height).lineTo(left + width, y + height).stroke();
      let x = left;
      columns.forEach((column, index) => {
        document.fillColor(INK).font("Helvetica").fontSize(8)
          .text(String(column.value(row) ?? ""), x + 6, y + 7, { width: columnWidths[index] - 12, align: column.align || "left" });
        x += columnWidths[index];
      });
      document.y = y + height;
    });
    document.moveDown(1);
  };

  document.save().rect(0, 0, document.page.width, document.page.height).fill("#F8FAFF").restore();
  document.save().rect(0, 0, document.page.width, 238).fill(NAVY).restore();
  document.fillColor(GOLD).font("Helvetica-Bold").fontSize(10)
    .text("NATIONS & CONTINENTS EDITION", left, 68, { characterSpacing: 1.6 });
  document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(31)
    .text("Comprehensive\nCrusade Report", left, 98, { width, lineGap: 3 });
  document.fillColor("#D8E5FF").font("Helvetica").fontSize(11)
    .text(`Collective registration and ministry outcomes summary  |  ${reportDate(data.generated_at)}`, left, 190, { width });
  document.y = 274;
  summaryGrid([
    { label: "Crusades registered", value: data.headline.total_crusades_registered },
    { label: "Crusades reported held", value: data.headline.crusades_reported_as_held },
    { label: "Report submissions", value: data.headline.report_submissions_received },
    { label: "Combined attendance", value: data.reports.combined_attendance },
    { label: "Souls won", value: data.reports.salvation },
    { label: "Countries registered", value: data.public_registration.countries },
  ]);
  document.fillColor(MUTED).font("Helvetica").fontSize(9)
    .text("Registration figures represent planned crusades. Held crusades and ministry outcomes come from submitted reports.", left, document.y + 8, { width });

  addPage();
  sectionTitle("Executive summary", "Registration progress and completed crusade reporting are presented separately for a clear operational view.");
  summaryGrid([
    { label: "Public registrations", value: data.headline.public_crusades_registered },
    { label: "Blue Elite registrations", value: data.headline.blue_elite_crusades_registered },
    { label: "Online registered", value: data.headline.online_crusades_registered },
    { label: "Onsite registered", value: data.headline.onsite_crusades_registered },
    { label: "Linked reports", value: data.registration_progress.linked_reports },
    { label: "Awaiting reports", value: data.registration_progress.awaiting_reports },
  ]);
  sectionTitle("Public registration profile");
  table([
    { label: "Coverage", width: 0.46, value: (row) => row.label },
    { label: "Total", width: 0.27, align: "right", value: (row) => n(row.value) },
    { label: "Status", width: 0.27, value: (row) => row.status },
  ], [
    { label: "Registered crusades", value: data.public_registration.crusades, status: `${n(data.public_registration.confirmed)} confirmed` },
    { label: "Registration submissions", value: data.public_registration.submissions, status: `${n(data.public_registration.items)} entries` },
    { label: "Countries represented", value: data.public_registration.countries, status: `${n(data.public_registration.cities)} cities` },
    { label: "Zones represented", value: data.public_registration.zones, status: `${n(data.public_registration.networks)} networks` },
    { label: "Groups represented", value: data.public_registration.groups, status: `${n(data.public_registration.churches)} churches` },
    { label: "Cells represented", value: data.public_registration.cells, status: "Registered structures" },
  ]);

  addPage();
  sectionTitle("Registration breakdown", "Planned crusades by registering organisation and crusade initiative.");
  table([
    { label: "Registered as", width: 0.4, value: (row) => orgLabel(row.level) },
    { label: "Onsite", width: 0.2, align: "right", value: (row) => n(row.onsite) },
    { label: "Online", width: 0.2, align: "right", value: (row) => n(row.online) },
    { label: "Total", width: 0.2, align: "right", value: (row) => n(row.total) },
  ], data.organization_registration);
  sectionTitle("Crusade initiatives");
  table([
    { label: "Initiative", width: 0.7, value: (row) => row.label },
    { label: "Registered", width: 0.3, align: "right", value: (row) => n(row.registered_crusades) },
  ], data.registration_initiatives);

  addPage();
  sectionTitle("Submitted report outcomes", "Figures below are calculated from crusades reported as held, including the configured MyStreamSpace adjustment.");
  summaryGrid([
    { label: "Onsite attendance", value: data.reports.onsite_attendance },
    { label: "Online participation", value: data.reports.online_participation },
    { label: "Combined attendance", value: data.reports.combined_attendance },
  ]);
  table([
    { label: "Outcome", width: 0.72, value: (row) => metricLabel(row.key) },
    { label: "Total", width: 0.28, align: "right", value: (row) => n(row.value) },
  ], data.outcomes);

  addPage();
  sectionTitle("Reports by crusade initiative");
  table([
    { label: "Initiative", width: 0.34, value: (row) => row.label },
    { label: "Held", width: 0.13, align: "right", value: (row) => n(row.crusades) },
    { label: "Onsite", width: 0.17, align: "right", value: (row) => n(row.onsite_attendance) },
    { label: "Online", width: 0.17, align: "right", value: (row) => n(row.online_participation) },
    { label: "Souls won", width: 0.19, align: "right", value: (row) => n(row.salvations) },
  ], data.report_initiatives);
  sectionTitle("Cellular crusades");
  table([
    { label: "Measure", width: 0.65, value: (row) => row.label },
    { label: "Total", width: 0.35, align: "right", value: (row) => n(row.value) },
  ], [
    { label: "Registered cellular crusades", value: data.cellular.registration.crusades },
    { label: "Countries represented", value: data.cellular.registration.countries },
    { label: "Cellular crusades reported held", value: data.cellular.reports.crusades },
    { label: "Combined attendance", value: data.cellular.reports.combined_attendance },
    { label: "Souls won", value: data.cellular.reports.salvations },
    { label: "Holy Spirit baptisms", value: data.cellular.reports.holy_spirit_filled },
    { label: "Water baptisms", value: data.cellular.reports.water_baptisms },
  ]);

  addPage();
  sectionTitle("Zone and network performance");
  table([
    { label: "Structure", width: 0.28, value: (row) => row.label },
    { label: "Registered", width: 0.18, align: "right", value: (row) => n(row.registered) },
    { label: "Held", width: 0.16, align: "right", value: (row) => n(row.held) },
    { label: "Attendance", width: 0.2, align: "right", value: (row) => n(row.attendance) },
    { label: "Souls won", width: 0.18, align: "right", value: (row) => n(row.salvations) },
  ], [
    { label: "Zones (direct)", registered: data.performance.zone.direct_registrations.total, held: data.performance.zone.direct_reports.crusades, attendance: data.performance.zone.direct_reports.combined_attendance, salvations: data.performance.zone.direct_reports.salvations },
    { label: "Zones (all attributed)", registered: data.performance.zone.attributed_registrations.total, held: data.performance.zone.attributed_reports.crusades, attendance: data.performance.zone.attributed_reports.combined_attendance, salvations: data.performance.zone.attributed_reports.salvations },
    { label: "Networks (direct)", registered: data.performance.network.direct_registrations.total, held: data.performance.network.direct_reports.crusades, attendance: data.performance.network.direct_reports.combined_attendance, salvations: data.performance.network.direct_reports.salvations },
    { label: "Networks (all attributed)", registered: data.performance.network.attributed_registrations.total, held: data.performance.network.attributed_reports.crusades, attendance: data.performance.network.attributed_reports.combined_attendance, salvations: data.performance.network.attributed_reports.salvations },
  ]);
  sectionTitle("Blue Elite");
  table([
    { label: "Measure", width: 0.68, value: (row) => row.label },
    { label: "Total", width: 0.32, align: "right", value: (row) => n(row.value) },
  ], [
    { label: "Crusades registered", value: data.blue_elite.crusades },
    { label: "Countries represented", value: data.blue_elite.countries },
    { label: "Departments represented", value: data.blue_elite.departments },
    { label: "Cellular crusades", value: data.blue_elite.cellular },
    { label: "Reports received", value: data.blue_elite.reports_received },
  ]);

  addPage();
  sectionTitle("Country coverage", `${n(data.geography.report_country_count)} countries have submitted crusade reports. The leading countries are shown below.`);
  table([
    { label: "Country", width: 0.34, value: (row) => row.country },
    { label: "Held", width: 0.14, align: "right", value: (row) => n(row.crusades_reported) },
    { label: "Attendance", width: 0.2, align: "right", value: (row) => n(row.combined_attendance) },
    { label: "Souls won", width: 0.17, align: "right", value: (row) => n(row.salvations) },
    { label: "Continent", width: 0.15, value: (row) => row.continent },
  ], data.geography.report_countries.slice(0, 30));

  addPage();
  sectionTitle("Continent breakdown");
  table([
    { label: "Continent", width: 0.28, value: (row) => row.continent },
    { label: "Countries", width: 0.15, align: "right", value: (row) => n(row.countries) },
    { label: "Held", width: 0.15, align: "right", value: (row) => n(row.crusades_reported) },
    { label: "Attendance", width: 0.22, align: "right", value: (row) => n(row.combined_attendance) },
    { label: "Souls won", width: 0.2, align: "right", value: (row) => n(row.salvations) },
  ], data.geography.report_continents);
  sectionTitle("Special initiatives");
  table([
    { label: "Initiative", width: 0.7, value: (row) => row.label },
    { label: "Total", width: 0.3, align: "right", value: (row) => n(row.value) },
  ], [
    { label: "Mission nation selections", value: data.special_initiatives.mission_nations },
    { label: "Media training registrations", value: data.special_initiatives.media_training.registrations },
    { label: "Media training trainees", value: data.special_initiatives.media_training.trainees },
    { label: "Upcoming crusade interests", value: data.special_initiatives.upcoming_crusades },
    { label: "Mission trip volunteers", value: data.special_initiatives.mission_trips },
  ]);

  const pages = document.bufferedPageRange();
  for (let index = pages.start; index < pages.start + pages.count; index += 1) {
    document.switchToPage(index);
    const footerY = document.page.height - document.page.margins.bottom - 12;
    document.fillColor(MUTED).font("Helvetica").fontSize(7.5)
      .text(`Generated ${reportDate(data.generated_at)}`, left, footerY, { width: width / 2, lineBreak: false });
    document.text(`Page ${index - pages.start + 1} of ${pages.count}`, left + width / 2, footerY, { width: width / 2, align: "right", lineBreak: false });
  }
  document.end();
  return complete;
}

const ARGB = { navy: "FF0B1739", blue: "FF173B8F", gold: "FFD9A514", paleBlue: "FFEEF4FF", border: "FFD8E0EC", white: "FFFFFFFF" };

function addSheet(workbook, name, title, columns, rows) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 3 }] });
  sheet.mergeCells(1, 1, 1, columns.length);
  const heading = sheet.getCell(1, 1);
  heading.value = title;
  heading.font = { bold: true, size: 16, color: { argb: ARGB.white } };
  heading.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.navy } };
  heading.alignment = { vertical: "middle" };
  sheet.getRow(1).height = 28;
  sheet.getRow(2).values = columns.map((column) => column.header);
  sheet.getRow(2).font = { bold: true, color: { argb: ARGB.blue } };
  sheet.getRow(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARGB.paleBlue } };
  sheet.columns = columns.map((column) => ({ key: column.key, width: column.width || 20 }));
  for (const row of rows) sheet.addRow(Object.fromEntries(columns.map((column) => [column.key, column.value ? column.value(row) : row[column.key]])));
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: columns.length } };
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.alignment = { vertical: "top", wrapText: true };
    if (rowNumber > 2 && rowNumber % 2) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    row.eachCell((cell) => { cell.border = { bottom: { style: "thin", color: { argb: ARGB.border } } }; });
  });
  return sheet;
}

const metricRows = (data) => [
  ["Crusades registered", data.headline.total_crusades_registered, "Registration"],
  ["Public crusades registered", data.headline.public_crusades_registered, "Registration"],
  ["Blue Elite crusades registered", data.headline.blue_elite_crusades_registered, "Registration"],
  ["Online crusades registered", data.headline.online_crusades_registered, "Registration"],
  ["Onsite crusades registered", data.headline.onsite_crusades_registered, "Registration"],
  ["Report submissions received", data.headline.report_submissions_received, "Reports"],
  ["Crusades reported as held", data.headline.crusades_reported_as_held, "Reports"],
  ["Onsite attendance", data.reports.onsite_attendance, "Outcomes"],
  ["Online participation", data.reports.online_participation, "Outcomes"],
  ["Combined attendance", data.reports.combined_attendance, "Outcomes"],
  ...data.outcomes.map((row) => [metricLabel(row.key), row.value, "Outcomes"]),
  ["Registered countries", data.public_registration.countries, "Coverage"],
  ["Report countries", data.geography.report_country_count, "Coverage"],
  ["Report cities", data.geography.report_city_count, "Coverage"],
].map(([metric, value, section]) => ({ section, metric, value }));

export async function buildCollectiveReportWorkbook(data) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Night of a Thousand Crusades";
  workbook.created = new Date(data.generated_at);
  workbook.subject = "Collective registration and report summary";
  addSheet(workbook, "E-card Figures", "E-card figures", [
    { header: "Section", key: "section", width: 18 },
    { header: "Figure", key: "metric", width: 38 },
    { header: "Total", key: "value", width: 18 },
  ], metricRows(data));
  addSheet(workbook, "Registration Profile", "Public registration profile", [
    { header: "Measure", key: "measure", width: 34 }, { header: "Total", key: "value", width: 18 },
  ], Object.entries(data.public_registration).map(([key, value]) => ({ measure: titleCase(key), value })));
  addSheet(workbook, "Organisation", "Registration by organisation", [
    { header: "Registered as", key: "level", width: 24, value: (row) => orgLabel(row.level) },
    { header: "Onsite", key: "onsite", width: 16 }, { header: "Online", key: "online", width: 16 }, { header: "Total", key: "total", width: 16 },
  ], data.organization_registration);
  addSheet(workbook, "Registration Initiatives", "Registration by crusade initiative", [
    { header: "Initiative", key: "label", width: 42 }, { header: "Registered Crusades", key: "registered_crusades", width: 22 },
  ], data.registration_initiatives);
  addSheet(workbook, "Report Initiatives", "Submitted reports by crusade initiative", [
    { header: "Initiative", key: "label", width: 38 }, { header: "Held", key: "crusades", width: 14 },
    { header: "Onsite Attendance", key: "onsite_attendance", width: 20 }, { header: "Online Participation", key: "online_participation", width: 20 },
    { header: "Combined Reach", key: "combined_reach", width: 20 }, { header: "Souls Won", key: "salvations", width: 18 },
  ], data.report_initiatives);
  addSheet(workbook, "Outcomes", "Ministry outcomes", [
    { header: "Outcome", key: "label", width: 42 }, { header: "Total", key: "value", width: 20 },
  ], data.outcomes.map((row) => ({ label: metricLabel(row.key), value: row.value })));
  addSheet(workbook, "Registered Countries", "Registered crusades by country", [
    { header: "Country", key: "country", width: 28 }, { header: "Continent", key: "continent", width: 20 },
    { header: "Registered Crusades", key: "registered_crusades", width: 22 }, { header: "Registration Submissions", key: "registration_submissions", width: 24 },
  ], data.geography.registration_countries);
  addSheet(workbook, "Report Countries", "Submitted reports by country", [
    { header: "Country", key: "country", width: 28 }, { header: "Continent", key: "continent", width: 20 },
    { header: "Crusades Reported", key: "crusades_reported", width: 20 }, { header: "Combined Attendance", key: "combined_attendance", width: 22 },
    { header: "Souls Won", key: "salvations", width: 18 },
  ], data.geography.report_countries);
  addSheet(workbook, "Cities", "Leading cities by submitted reports", [
    { header: "City", key: "city", width: 28 }, { header: "Country", key: "country", width: 26 },
    { header: "Reports", key: "reports", width: 16 }, { header: "Combined Attendance", key: "combined_attendance", width: 22 },
  ], data.geography.report_cities);
  addSheet(workbook, "Registered Continents", "Registered crusades by continent", [
    { header: "Continent", key: "continent", width: 22 }, { header: "Countries", key: "countries", width: 16 },
    { header: "Registered Crusades", key: "registered_crusades", width: 22 }, { header: "Registration Submissions", key: "registration_submissions", width: 24 },
  ], data.geography.registration_continents);
  addSheet(workbook, "Report Continents", "Submitted reports by continent", [
    { header: "Continent", key: "continent", width: 22 }, { header: "Countries", key: "countries", width: 16 },
    { header: "Crusades Reported", key: "crusades_reported", width: 20 }, { header: "Combined Attendance", key: "combined_attendance", width: 22 },
    { header: "Souls Won", key: "salvations", width: 18 },
  ], data.geography.report_continents);
  addSheet(workbook, "Blue Elite", "Blue Elite summary", [
    { header: "Measure", key: "measure", width: 36 }, { header: "Total", key: "value", width: 18 },
  ], ["crusades", "countries", "departments", "cellular", "reports_received"].map((key) => ({ measure: titleCase(key), value: data.blue_elite[key] })));
  addSheet(workbook, "Special Initiatives", "Special initiatives", [
    { header: "Initiative", key: "initiative", width: 40 }, { header: "Total", key: "value", width: 18 },
  ], [
    { initiative: "Mission nation selections", value: data.special_initiatives.mission_nations },
    { initiative: "Media training registrations", value: data.special_initiatives.media_training.registrations },
    { initiative: "Media training trainees", value: data.special_initiatives.media_training.trainees },
    { initiative: "Upcoming crusade interests", value: data.special_initiatives.upcoming_crusades },
    { initiative: "Mission trip volunteers", value: data.special_initiatives.mission_trips },
  ]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
