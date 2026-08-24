import test from "node:test";
import assert from "node:assert/strict";
import { responseErrorDetails } from "./api.js";

test("report upload errors distinguish oversized photos from temporary gateway failures", () => {
  assert.deepEqual(responseErrorDetails({ status: 413, isFormData: true }), {
    code: "PHOTOS_TOO_LARGE",
    message: "The server rejected these photos because the upload is too large. Select fewer or smaller photos (50MB total maximum), or add photo links instead.",
  });
  assert.deepEqual(responseErrorDetails({ status: 502, isFormData: true }), {
    code: "UPLOAD_STATUS_UNKNOWN",
    message: "The server connection was interrupted while submitting. Your report may already have been saved. Refresh the dashboard and check for ‘Submitted’ before trying again.",
  });
  assert.deepEqual(responseErrorDetails({ status: 504, isFormData: true }), {
    code: "UPLOAD_STATUS_UNKNOWN",
    message: "The server took too long to confirm the submission. Your report may already have been saved. Refresh the dashboard and check for ‘Submitted’ before trying again.",
  });
});

test("API error details preserve an application ALREADY_REPORTED response", () => {
  assert.deepEqual(responseErrorDetails({
    status: 409,
    isFormData: true,
    body: { error: { code: "ALREADY_REPORTED", message: "A report has already been submitted for this crusade." } },
  }), {
    code: "ALREADY_REPORTED",
    message: "A report has already been submitted for this crusade.",
  });
});
