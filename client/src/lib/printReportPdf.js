import { toast } from "sonner";

const docDate = new Intl.DateTimeFormat("en", { dateStyle: "long", timeStyle: "short" });

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]));
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    table[i] = value;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const bytesOf = (value) => new TextEncoder().encode(value);
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

const wText = (value, props = "") => `<w:r>${props}<w:t xml:space="preserve">${escapeHtml(value)}</w:t></w:r>`;
const wParagraph = (runs, props = "") => `<w:p>${props}${runs}</w:p>`;
const wCell = (content, { width = 2400, fill, color, bold, size = 20, align = "left" } = {}) => `
  <w:tc>
    <w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}</w:tcPr>
    ${wParagraph(wText(String(content ?? "—"), `<w:rPr>${bold ? "<w:b/>" : ""}${color ? `<w:color w:val="${color}"/>` : ""}<w:sz w:val="${size}"/></w:rPr>`), `<w:pPr><w:jc w:val="${align}"/></w:pPr>`)}
  </w:tc>
`;
const wRow = (cells) => `<w:tr>${cells.join("")}</w:tr>`;

function cellValue(col, row) {
  const value = typeof col.value === "function" ? col.value(row) : row[col.key];
  return value == null || value === "" ? "—" : value;
}

function tableBorders(color = "BFDBFE") {
  return `<w:tblBorders>
    <w:top w:val="single" w:sz="4" w:color="${color}"/>
    <w:left w:val="single" w:sz="4" w:color="${color}"/>
    <w:bottom w:val="single" w:sz="4" w:color="${color}"/>
    <w:right w:val="single" w:sz="4" w:color="${color}"/>
    <w:insideH w:val="single" w:sz="4" w:color="DBE4EF"/>
    <w:insideV w:val="single" w:sz="4" w:color="DBE4EF"/>
  </w:tblBorders>`;
}

function buildTableXml(columns, rows, { sectionRow = false } = {}) {
  if (!columns?.length) return "";
  const widths = columns.map((col) => col.width || Math.floor(9700 / columns.length));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);
  const head = wRow(columns.map((col, index) => wCell(col.header, {
    width: widths[index],
    fill: "EFF6FF",
    color: "1E3A8A",
    bold: true,
    align: col.align === "right" ? "right" : "left",
  })));
  const body = (rows?.length ? rows : [{ __empty: true }]).map((row) => {
    if (row.__empty) {
      return wRow([wCell("No rows available.", { width: totalWidth })]);
    }
    const highlight = sectionRow && row._section;
    return wRow(columns.map((col, index) => wCell(cellValue(col, row), {
      width: widths[index],
      fill: highlight ? "DBEAFE" : undefined,
      color: highlight ? "1E3A8A" : undefined,
      bold: highlight,
      align: col.align === "right" ? "right" : "left",
    })));
  }).join("");

  return `<w:tbl>
    <w:tblPr><w:tblW w:w="${totalWidth}" w:type="dxa"/>${tableBorders()}</w:tblPr>
    ${head}${body}
  </w:tbl>`;
}

function buildNotcReportDocxXml({
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
  const summaryWidth = summary.length ? Math.floor(9700 / summary.length) : 9700;
  const summaryTable = summary.length ? `<w:tbl>
    <w:tblPr><w:tblW w:w="9700" w:type="dxa"/><w:tblBorders>
      <w:top w:val="single" w:sz="4" w:color="475569"/>
      <w:left w:val="single" w:sz="4" w:color="475569"/>
      <w:bottom w:val="single" w:sz="18" w:color="1D4ED8"/>
      <w:right w:val="single" w:sz="4" w:color="475569"/>
      <w:insideH w:val="single" w:sz="4" w:color="475569"/>
      <w:insideV w:val="single" w:sz="4" w:color="475569"/>
    </w:tblBorders></w:tblPr>
    ${wRow(summary.map((item) => wCell(`${String(item.label).toUpperCase()}:\n${item.value}`, {
      width: summaryWidth,
      fill: "0F172A",
      color: "93C5FD",
      bold: true,
      size: 22,
    })))}
  </w:tbl>${wParagraph("")}` : "";

  const mainTable = columns?.length ? `${buildTableXml(columns, rows)}${wParagraph("")}` : "";
  const sectionBlocks = sections.map((section) => `
    ${wParagraph(wText(section.title, '<w:rPr><w:b/><w:color w:val="1E3A8A"/><w:sz w:val="28"/></w:rPr>'))}
    ${section.intro ? wParagraph(wText(section.intro, '<w:rPr><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr>')) : ""}
    ${buildTableXml(section.columns, section.rows, { sectionRow: true })}
    ${wParagraph("")}
  `).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        ${wParagraph(wText(eyebrow, '<w:rPr><w:b/><w:color w:val="1D4ED8"/><w:sz w:val="20"/></w:rPr>'))}
        ${wParagraph(wText(title, '<w:rPr><w:b/><w:color w:val="0F172A"/><w:sz w:val="44"/></w:rPr>'))}
        ${wParagraph(wText(`Generated ${generatedAt}${meta ? `. ${meta}` : ""}`, '<w:rPr><w:color w:val="475569"/><w:sz w:val="20"/></w:rPr>'))}
        ${summaryTable}
        ${mainTable}
        ${sectionBlocks}
        ${wParagraph(wText(footer, '<w:rPr><w:color w:val="64748B"/><w:sz w:val="18"/></w:rPr>'))}
        <w:sectPr>
          <w:pgSz w:w="12240" w:h="15840"/>
          <w:pgMar w:top="936" w:right="720" w:bottom="936" w:left="720" w:header="720" w:footer="720" w:gutter="0"/>
        </w:sectPr>
      </w:body>
    </w:document>`;
}

/** Download a NOTC-styled Word report (.docx). Reliable alternative to print-to-PDF popups. */
export function downloadNotcReportDocx(options) {
  const filename = options.filename || `notc-report-${new Date().toISOString().slice(0, 10)}.docx`;
  try {
    const zip = buildZip([
      { name: "[Content_Types].xml", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>` },
      { name: "_rels/.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>` },
      { name: "word/_rels/document.xml.rels", content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>` },
      { name: "word/document.xml", content: buildNotcReportDocxXml(options) },
    ]);
    downloadBlob(filename, new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
    toast.success("Word report downloaded.");
    return true;
  } catch (error) {
    toast.error(error?.message || "Could not export Word report.");
    return false;
  }
}
