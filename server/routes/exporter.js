import ExcelJS from "exceljs";

// Shared CSV / XLSX writer for table exports. `columns` is an array of
// { header, value(row) } — value() lets each column format its own cell (labels,
// Yes/No, joined lists), so the sheet reads intelligently rather than as raw keys.

const cellOf = (col, row) => {
  const value = col.value(row);
  return value === null || value === undefined ? "" : value;
};

export async function sendExport(res, format, baseName, columns, rows) {
  if (format === "xlsx") return sendXlsx(res, baseName, columns, rows);
  return sendCsv(res, baseName, columns, rows);
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
  await workbook.xlsx.write(res);
  res.end();
}
