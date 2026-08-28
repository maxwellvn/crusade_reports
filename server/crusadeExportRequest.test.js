import test from "node:test";
import assert from "node:assert/strict";
import { crusadeExportRequest } from "./routes/crusades.js";

test("legacy CSV/XLSX format selects the file type without filtering out report rows", () => {
  const csv = crusadeExportRequest({ format: "csv" });
  assert.equal(csv.fileFormat, "csv");
  assert.doesNotMatch(csv.clause, /c\.format/);

  const xlsx = crusadeExportRequest({ format: "xlsx" });
  assert.equal(xlsx.fileFormat, "xlsx");
  assert.doesNotMatch(xlsx.clause, /c\.format/);
});

test("export_format keeps the physical/online report filter independent", () => {
  const request = crusadeExportRequest({ export_format: "xlsx", format: "physical" });
  assert.equal(request.fileFormat, "xlsx");
  assert.match(request.clause, /c\.format = @format/);
  assert.equal(request.params.format, "physical");
});
