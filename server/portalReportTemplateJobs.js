// Portal-template generation. Rows are computed by the caller (main thread —
// see portalReportTemplateRows in routes/zonePortal.js and the find-my-crusade
// bulk flow). Generation runs inline: ExcelJS's stream writer flushes in small
// chunks so the event loop stays responsive, and the previous worker-thread
// approach hard-crashed Node 22 on file-handle teardown.

import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import AdmZip from "adm-zip";
import yazl from "yazl";
import { Worker } from "node:worker_threads";
import { ApiError, logger } from "./logger.js";
import { writePortalReportWorkbookStream } from "./portalReportWorkbookWriter.js";

export function removeGeneratedTemplate(path) {
  return unlink(path).catch(() => {});
}

// The ExcelJS streaming writer produces a zip with data-descriptor entries
// (general-purpose flag 0x8) and buries [Content_Types].xml mid-archive.
// Excel — macOS Excel in particular — treats that package layout as corrupt
// and offers to "recover" the workbook even though every XML part is valid.
// Repack the same entries as a buffered zip: [Content_Types].xml first, known
// sizes (no descriptors). Same bytes inside, package wrapper Excel accepts.
function repackForExcel(path) {
  const inZip = new AdmZip(path);
  const entries = inZip.getEntries().filter((entry) => !entry.isDirectory);
  const isContentTypes = (entry) => entry.entryName.replace(/^\//, "") === "[Content_Types].xml";
  entries.sort((a, b) => {
    if (isContentTypes(a)) return -1;
    if (isContentTypes(b)) return 1;
    return 0;
  });
  const outZip = new yazl.ZipFile();
  for (const entry of entries) {
    const entryName = entry.entryName.replace(/^\//, "");
    let contents = entry.getData();
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(entryName)) {
      const xml = contents.toString("utf8");
      const protection = xml.match(/<sheetProtection\b[^>]*(?:\/>|>[\s\S]*?<\/sheetProtection>)/)?.[0];
      if (protection) {
        // ExcelJS 4's streaming writer serializes sheetProtection after
        // dataValidations. OOXML requires it immediately after sheetData (and
        // before autoFilter), so desktop Excel repairs otherwise-valid files.
        contents = Buffer.from(xml.replace(protection, "").replace("</sheetData>", `</sheetData>${protection}`));
      }
    }
    outZip.addBuffer(contents, entryName, { compress: true });
  }
  outZip.end();
  return new Promise((resolve, reject) => {
    outZip.outputStream
      .pipe(createWriteStream(path))
      .on("finish", resolve)
      .on("error", reject);
  });
}

export async function generatePortalReportTemplate({ rows, dashboardName }) {
  if (!Array.isArray(rows)) throw new ApiError(500, "TEMPLATE_FAILED", "Template rows must be provided.");
  const outputPath = join(tmpdir(), `notc-report-template-${randomUUID()}.xlsx`);
  try {
    await writePortalReportWorkbookStream(rows, dashboardName, createWriteStream(outputPath));
    await repackForExcel(outputPath);
    return outputPath;
  } catch (error) {
    await unlink(outputPath).catch(() => {});
    if (error instanceof ApiError) throw error;
    logger.error({ err: error }, "report template generation failed");
    throw new ApiError(500, "TEMPLATE_FAILED", "Could not generate the report template. Please try again.");
  }
}

export function parsePortalReportTemplateInWorker(path, { timeoutMs = 2 * 60 * 1000, signal } = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./portalReportParseWorker.js", import.meta.url), {
      workerData: { path },
      resourceLimits: { maxOldGenerationSizeMb: 700 },
    });
    let settled = false;
    let timer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      callback();
    };
    const cancel = () => finish(() => {
      worker.terminate();
      reject(new ApiError(499, "REQUEST_CANCELLED", "Template processing was cancelled."));
    });
    signal?.addEventListener("abort", cancel, { once: true });
    timer = setTimeout(() => finish(() => {
      worker.terminate();
      reject(new ApiError(408, "TEMPLATE_TIMEOUT", "This workbook took too long to read. Download a fresh template and upload only the completed report rows."));
    }), timeoutMs);
    worker.once("message", (message) => finish(() => message.ok
      ? resolve(message.result)
      : reject(new ApiError(422, "BAD_TEMPLATE", message.message || "Could not read the report template."))));
    worker.once("error", (error) => finish(() => {
      logger.error({ err: error }, "report template parser worker failed");
      reject(new ApiError(500, "TEMPLATE_FAILED", "Could not process the report template safely."));
    }));
    worker.once("exit", (code) => {
      if (code !== 0) finish(() => reject(new ApiError(500, "TEMPLATE_FAILED", "The report template was too large to process safely.")));
    });
  });
}
