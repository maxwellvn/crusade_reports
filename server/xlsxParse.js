import { Worker } from "node:worker_threads";
import { ApiError, logger } from "./logger.js";

const PARSE_TIMEOUT_MS = 2 * 60 * 1000;

// Minimal stand-in for the ExcelJS worksheet API the importers use
// (getWorksheet / rowCount / getRow / getCell / eachCell) over plain arrays.
function worksheet({ rowCount, rows }) {
  const getRow = (r) => {
    const values = rows[r] || [];
    return {
      getCell: (c) => ({ value: values[c] ?? null }),
      eachCell: (fn) => values.forEach((value, c) => { if (value !== undefined && value !== "") fn({ value }, c); }),
    };
  };
  return { rowCount, getRow };
}

// Parses an uploaded workbook in a worker thread and returns { getWorksheet }.
// Throws ApiError 422 BAD_FILE when the file cannot be read.
export function parseWorkbookOffThread(buffer) {
  return new Promise((resolve, reject) => {
    const copy = new Uint8Array(buffer).buffer.slice(0);
    const worker = new Worker(new URL("./xlsxParseWorker.js", import.meta.url), {
      workerData: { buffer: copy },
      transferList: [copy],
      execArgv: [],
      resourceLimits: { maxOldGenerationSizeMb: 700 },
    });
    let settled = false;
    const finish = (callback) => { if (!settled) { settled = true; clearTimeout(timer); callback(); } };
    const timer = setTimeout(() => finish(() => {
      worker.terminate();
      reject(new ApiError(408, "IMPORT_TIMEOUT", "This spreadsheet took too long to read. Upload fewer rows at a time."));
    }), PARSE_TIMEOUT_MS);
    worker.once("message", (message) => finish(() => {
      if (!message.ok) return reject(new ApiError(422, "BAD_FILE", "Could not read that file — use the .xlsx template"));
      const sheets = Object.fromEntries(Object.entries(message.sheets).map(([name, sheet]) => [name, worksheet(sheet)]));
      resolve({ getWorksheet: (name) => sheets[name] || null });
    }));
    worker.once("error", (error) => finish(() => {
      logger.error({ err: error }, "xlsx parse worker failed");
      reject(new ApiError(422, "BAD_FILE", "Could not read that file — use the .xlsx template"));
    }));
    worker.once("exit", (code) => {
      if (code !== 0) finish(() => reject(new ApiError(413, "FILE_TOO_LARGE", "That spreadsheet is too large to process. Upload fewer rows at a time.")));
    });
  });
}
