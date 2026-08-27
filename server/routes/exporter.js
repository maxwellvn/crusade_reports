import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { once } from "node:events";

// Shared CSV / XLSX / PDF writer for table exports. `columns` is an array of
// { header, value(row) } — value() lets each column format its own cell (labels,
// Yes/No, joined lists), so the sheet reads intelligently rather than as raw keys.

const cellOf = (col, row) => {
  const value = col.value(row);
  return value === null || value === undefined ? "" : value;
};

export async function sendExport(res, format, baseName, columns, rows, options = {}) {
  if (format === "xlsx") return sendXlsx(res, baseName, columns, rows);
  if (format === "pdf") return sendPdf(res, baseName, columns, rows, options);
  return sendCsv(res, baseName, columns, rows);
}

// Stream database iterators directly to the response. This keeps exports safe
// when a filtered result contains millions of rows: neither SQLite results nor
// the generated file are accumulated in the Node process.
export async function sendStreamingExport(res, format, baseName, columns, rows) {
  if (format === "xlsx") return sendStreamingXlsx(res, baseName, columns, rows);
  return sendStreamingCsv(res, baseName, columns, rows);
}

const exportTitle = (baseName) => String(baseName || "report")
  .replace(/[-_]+/g, " ")
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

export function buildPdfBuffer(baseName, columns, rows, options = {}) {
  return new Promise((resolve, reject) => {
    const landscape = columns.length > 4;
    const document = new PDFDocument({
      size: "A4",
      layout: landscape ? "landscape" : "portrait",
      margins: { top: 42, right: 42, bottom: 48, left: 42 },
      bufferPages: true,
      info: {
        Title: options.title || exportTitle(baseName),
        Author: "Night of a Thousand Crusades",
        Subject: options.subtitle || "Administrative report",
      },
    });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(Buffer.concat(chunks)));

    const pageWidth = document.page.width;
    const contentWidth = pageWidth - document.page.margins.left - document.page.margins.right;
    const columnWeights = columns.map((column) => Number(column.pdfWidth) > 0 ? Number(column.pdfWidth) : 1);
    const totalColumnWeight = columnWeights.reduce((sum, width) => sum + width, 0) || 1;
    const columnWidths = columnWeights.map((weight) => contentWidth * (weight / totalColumnWeight));
    const left = document.page.margins.left;
    const bottom = () => document.page.height - document.page.margins.bottom - 18;

    const drawReportHeader = () => {
      const top = document.page.margins.top;
      document.save().roundedRect(left, top, contentWidth, 86, 4).fill("#0F172A").restore();
      document.fillColor("#93C5FD").font("Helvetica-Bold").fontSize(9)
        .text("NIGHT OF A THOUSAND CRUSADES", left + 18, top + 15, { characterSpacing: 1.2 });
      document.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(19)
        .text(options.title || exportTitle(baseName), left + 18, top + 32, { width: contentWidth - 36 });
      document.fillColor("#CBD5E1").font("Helvetica").fontSize(9)
        .text(options.subtitle || `${rows.length} record${rows.length === 1 ? "" : "s"}`, left + 18, top + 62, { width: contentWidth - 36 });
      document.y = top + 104;
    };

    const rowHeight = (row, header = false) => {
      const { x, y } = document;
      const height = Math.max(28, ...columns.map((column, index) => {
        const value = header ? column.header : cellOf(column, row);
        return document.font(header ? "Helvetica-Bold" : "Helvetica").fontSize(header ? 8 : 8.5)
          .heightOfString(String(value), { width: columnWidths[index] - 16, lineGap: 1 }) + 12;
      }));
      document.x = x;
      document.y = y;
      return height;
    };

    const drawRow = (row, y, { header = false, shaded = false } = {}) => {
      const height = rowHeight(row, header);
      document.save().rect(left, y, contentWidth, height).fill(header ? "#EFF6FF" : shaded ? "#F8FAFC" : "#FFFFFF").restore();
      let x = left;
      columns.forEach((column, index) => {
        const width = columnWidths[index];
        document.save().rect(x, y, width, height).strokeColor("#CBD5E1").lineWidth(0.5).stroke().restore();
        document.fillColor(header ? "#1E3A8A" : "#0F172A")
          .font(header ? "Helvetica-Bold" : "Helvetica")
          .fontSize(header ? 8 : 8.5)
          .text(String(header ? column.header : cellOf(column, row)), x + 8, y + 7, {
            width: width - 16,
            height: height - 10,
            align: column.align === "right" ? "right" : "left",
            lineGap: 1,
          });
        x += width;
      });
      document.x = left;
      document.y = y;
      return height;
    };

    const drawTableHeader = () => {
      const height = drawRow({}, document.y, { header: true });
      document.y += height;
    };

    drawReportHeader();
    drawTableHeader();
    if (!rows.length) {
      document.fillColor("#64748B").font("Helvetica").fontSize(10).text("No records available.", left, document.y + 18);
    } else {
      rows.forEach((row, index) => {
        const height = rowHeight(row);
        if (document.y + height > bottom()) {
          document.addPage();
          drawReportHeader();
          drawTableHeader();
        }
        document.y += drawRow(row, document.y, { shaded: index % 2 === 1 });
      });
    }

    const range = document.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      document.switchToPage(index);
      document.fillColor("#64748B").font("Helvetica").fontSize(8)
        .text(`Page ${index - range.start + 1} of ${range.count}`, left, document.page.height - document.page.margins.bottom - 12, {
          width: contentWidth, align: "right", lineBreak: false,
        });
    }
    document.end();
  });
}

async function sendPdf(res, baseName, columns, rows, options) {
  const buffer = await buildPdfBuffer(baseName, columns, rows, options);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.pdf"`);
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}

export function sendTextDownload(res, baseName, lines) {
  const body = `\uFEFF${lines.join("\r\n")}\r\n`;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.txt"`);
  res.send(body);
}

function sendCsv(res, baseName, columns, rows) {
  const escape = (value) => {
    const text = String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escape(c.header)).join(",")];
  for (const row of rows) lines.push(columns.map((c) => escape(cellOf(c, row))).join(","));
  // Leading BOM so Excel opens the UTF-8 file without mangling accents.
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
  res.send("﻿" + lines.join("\r\n"));
}


const csvEscape = (value) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

async function writeResponse(res, chunk) {
  if (!res.write(chunk)) await once(res, "drain");
}

// SQLite iterators evaluate lazily. Advance one row before sending headers so
// a malformed query or unavailable table reaches the normal JSON error handler
// instead of becoming a downloaded, header-only CSV/XLSX file.
function preflightRows(rows) {
  const iterator = rows?.[Symbol.iterator]?.();
  if (!iterator) throw new TypeError("Export rows must be iterable.");
  const first = iterator.next();
  return {
    *[Symbol.iterator]() {
      if (!first.done) yield first.value;
      yield* iterator;
    },
  };
}

async function sendStreamingCsv(res, baseName, columns, rows) {
  const checkedRows = preflightRows(rows);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.csv"`);
  await writeResponse(res, `\uFEFF${columns.map((column) => csvEscape(column.header)).join(",")}\r\n`);
  for (const row of checkedRows) {
    await writeResponse(res, `${columns.map((column) => csvEscape(cellOf(column, row))).join(",")}\r\n`);
  }
  res.end();
}

async function sendStreamingXlsx(res, baseName, columns, rows) {
  const checkedRows = preflightRows(rows);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  let sheetNumber = 0;
  let rowsInSheet = 0;
  let sheet;
  const addSheet = () => {
    sheetNumber += 1;
    rowsInSheet = 0;
    sheet = workbook.addWorksheet(sheetNumber === 1 ? "Export" : `Export ${sheetNumber}`, { views: [{ state: "frozen", ySplit: 1 }] });
    sheet.columns = columns.map((column) => ({ header: column.header, key: column.header, width: Math.min(Math.max(column.header.length + 2, 12), 42) }));
    const header = sheet.getRow(1);
    header.font = { bold: true };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3FF" } };
    header.commit();
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  };
  addSheet();
  for (const row of checkedRows) {
    // Excel supports 1,048,576 rows per worksheet; reserve row 1 for headers.
    if (rowsInSheet >= 1_048_575) {
      sheet.commit();
      addSheet();
    }
    sheet.addRow(Object.fromEntries(columns.map((column) => [column.header, cellOf(column, row)]))).commit();
    rowsInSheet += 1;
  }
  sheet.commit();
  await workbook.commit();
}

async function sendXlsx(res, baseName, columns, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Export");
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.header,
    width: Math.min(Math.max(c.header.length + 2, 12, ...rows.map((row) => String(cellOf(c, row)).length + 2)), 42),
  }));
  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF3FF" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  for (const row of rows) {
    sheet.addRow(Object.fromEntries(columns.map((c) => [c.header, cellOf(c, row)])));
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${baseName}.xlsx"`);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  res.setHeader("Content-Length", buffer.length);
  res.end(buffer);
}
