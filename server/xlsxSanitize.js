import JSZip from "jszip";
import { logger } from "./logger.js";

// exceljs 4.x chokes (internal TypeError in worksheet reconciliation) on valid
// .xlsx files whose comments live in the `xl/comments/` subdirectory layout
// (produced by LibreOffice, WPS, and other re-savers) instead of the legacy
// flat `xl/comments1.xml` it understands. The template ships header notes, so
// a filled-in template saved by such a tool hits this crash on upload.
//
// Import only needs the cell values — notes are irrelevant. When a normal load
// fails, we strip every comment / threaded-comment / comment-vml part and its
// worksheet relationships from the zip and retry. Legacy flat comments parts
// are left alone (they parse fine and are never the crash source).
export async function loadWorkbook(wb, buffer) {
  try {
    await wb.xlsx.load(buffer);
    return false; // no sanitization needed
  } catch (err) {
    logger.warn({ err: err.message }, "xlsx parse failed — retrying without comment parts");
  }

  const fixed = await stripCommentParts(buffer);
  if (!fixed) throw new Error("could not rebuild xlsx without comment parts");
  await wb.xlsx.load(fixed);
  return true;
}

async function stripCommentParts(buffer) {
  try {
    const zip = await JSZip.loadAsync(buffer);
    let changed = false;

    // Parts only ever consumed for comment display — safe to drop.
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/(comments\/|threadedComments\/)/.test(name)
        || /^xl\/drawings\/commentsDrawing\d+\.vml$/.test(name)) {
        zip.remove(name);
        changed = true;
      }
    }

    // Drop the relationships pointing at those parts so exceljs never looks them up.
    for (const name of Object.keys(zip.files)) {
      if (!/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/.test(name)) continue;
      let rels = await zip.file(name).async("string");
      const next = rels.replace(/<Relationship[^>]*?(comments|threadedComment|vmlDrawing)[^>]*?\/>/g, "");
      if (next.length !== rels.length) {
        zip.file(name, next);
        changed = true;
      }
    }

    if (!changed) return null;
    return await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  } catch (err) {
    logger.warn({ err: err.message }, "xlsx comment-strip failed");
    return null;
  }
}