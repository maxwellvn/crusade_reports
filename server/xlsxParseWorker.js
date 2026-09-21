// Reads an uploaded .xlsx off the request thread. ExcelJS parses a 40k-row
// workbook in seconds of pure CPU; doing that on the main thread froze every
// dashboard request for the duration of each bulk upload.
import { parentPort, workerData } from "node:worker_threads";
import ExcelJS from "exceljs";
import { loadWorkbook } from "./xlsxSanitize.js";

// Same normalisation the importers apply per cell: rich text / hyperlinks →
// text, formulas → result, dates stay Date (structured clone preserves them).
function cellValue(cell) {
  const v = cell?.value;
  if (v == null) return "";
  if (typeof v === "object") {
    if (v instanceof Date) return v;
    if (v.text) return v.text;
    if (v.result != null) return v.result;
    return "";
  }
  return v;
}

try {
  const wb = new ExcelJS.Workbook();
  await loadWorkbook(wb, Buffer.from(workerData.buffer));
  const sheets = {};
  wb.eachSheet((ws) => {
    const rows = [];
    ws.eachRow((row, r) => {
      const values = [];
      row.eachCell((cell, c) => { values[c] = cellValue(cell); });
      rows[r] = values;
    });
    sheets[ws.name] = { rowCount: ws.rowCount, rows };
  });
  parentPort.postMessage({ ok: true, sheets });
} catch (error) {
  parentPort.postMessage({ ok: false, message: error.message });
}
