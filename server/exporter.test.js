import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { sendStreamingExport } from "./routes/exporter.js";

function responseStream() {
  const response = new PassThrough();
  response.headers = {};
  response.setHeader = (name, value) => { response.headers[name] = value; };
  return response;
}

async function render(format) {
  const response = responseStream();
  const chunks = [];
  response.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve, reject) => {
    response.on("finish", resolve);
    response.on("error", reject);
  });
  await sendStreamingExport(response, format, "test-export", [
    { header: "Name", value: (row) => row.name },
    { header: "Count", value: (row) => row.count },
  ], [{ name: "A, B", count: 2 }, { name: "C", count: 3 }][Symbol.iterator]());
  await finished;
  return { body: Buffer.concat(chunks), headers: response.headers };
}

test("streaming CSV escapes cells without buffering a row array", async () => {
  const { body, headers } = await render("csv");
  assert.equal(headers["Content-Type"], "text/csv; charset=utf-8");
  assert.match(body.toString("utf8"), /"A, B",2/);
});

test("streaming XLSX writes a valid workbook response", async () => {
  const { body, headers } = await render("xlsx");
  assert.equal(headers["Content-Type"], "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.equal(body.subarray(0, 2).toString(), "PK");
});

test("streaming exports fail before setting download headers when the iterator fails", async () => {
  const response = responseStream();
  const brokenRows = {
    [Symbol.iterator]() {
      return { next() { throw new Error("database unavailable"); } };
    },
  };
  await assert.rejects(
    () => sendStreamingExport(response, "csv", "test-export", [{ header: "Name", value: (row) => row.name }], brokenRows),
    /database unavailable/
  );
  assert.deepEqual(response.headers, {});
});
