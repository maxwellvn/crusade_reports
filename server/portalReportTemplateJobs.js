import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { db, REGISTRATION_DB_PATH } from "./db.js";
import { ApiError, logger } from "./logger.js";

const MAX_QUEUED_GENERATIONS = 4;
let active = null;
const queue = [];

function runNext() {
  if (active || !queue.length) return;
  const job = queue.shift();
  if (job.signal?.aborted) {
    job.reject(new ApiError(499, "REQUEST_CANCELLED", "Template generation was cancelled."));
    runNext();
    return;
  }
  active = job;
  const outputPath = join(tmpdir(), `notc-report-template-${randomUUID()}.xlsx`);
  const worker = new Worker(new URL("./portalReportTemplateWorker.js", import.meta.url), {
    workerData: {
      ...job.scope,
      reportsPath: db.name,
      registrationPath: REGISTRATION_DB_PATH,
      outputPath,
    },
    resourceLimits: { maxOldGenerationSizeMb: 1400 },
  });
  job.worker = worker;
  let settled = false;
  const finish = () => {
    job.signal?.removeEventListener("abort", cancel);
    active = null;
    runNext();
  };
  const cancel = () => {
    if (settled) return;
    settled = true;
    worker.terminate();
    unlink(outputPath).catch(() => {});
    job.reject(new ApiError(499, "REQUEST_CANCELLED", "Template generation was cancelled."));
    finish();
  };
  job.signal?.addEventListener("abort", cancel, { once: true });
  worker.once("message", (message) => {
    settled = true;
    if (message.ok) job.resolve(outputPath);
    else {
      unlink(outputPath).catch(() => {});
      job.reject(new ApiError(500, "TEMPLATE_FAILED", message.message || "Could not generate the report template."));
    }
    finish();
  });
  worker.once("error", (error) => {
    if (settled) return;
    settled = true;
    unlink(outputPath).catch(() => {});
    logger.error({ err: error }, "report template worker failed");
    job.reject(new ApiError(500, "TEMPLATE_FAILED", "Could not generate the report template. Please try again."));
    finish();
  });
  worker.once("exit", (code) => {
    if (settled || code === 0) return;
    settled = true;
    unlink(outputPath).catch(() => {});
    job.reject(new ApiError(500, "TEMPLATE_FAILED", "The report template was too large to generate safely."));
    finish();
  });
}

export function generatePortalReportTemplate(scope, { signal } = {}) {
  if (queue.length >= MAX_QUEUED_GENERATIONS) {
    throw new ApiError(429, "TEMPLATE_BUSY", "Several large templates are already being prepared. Please wait a moment and try again.");
  }
  return new Promise((resolve, reject) => {
    const job = { scope, signal, resolve, reject, worker: null };
    if (signal?.aborted) {
      reject(new ApiError(499, "REQUEST_CANCELLED", "Template generation was cancelled."));
      return;
    }
    const cancelQueued = () => {
      const index = queue.indexOf(job);
      if (index < 0) return;
      queue.splice(index, 1);
      reject(new ApiError(499, "REQUEST_CANCELLED", "Template generation was cancelled."));
    };
    signal?.addEventListener("abort", cancelQueued, { once: true });
    const originalResolve = job.resolve;
    const originalReject = job.reject;
    job.resolve = (value) => { signal?.removeEventListener("abort", cancelQueued); originalResolve(value); };
    job.reject = (error) => { signal?.removeEventListener("abort", cancelQueued); originalReject(error); };
    queue.push(job);
    runNext();
  });
}

export function removeGeneratedTemplate(path) {
  return unlink(path).catch(() => {});
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
