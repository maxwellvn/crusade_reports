import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import AdmZip from "adm-zip";
import { backupArchiveFilename, createBackupArchive } from "./backupDownload.js";

const collect = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
};

test("split database downloads contain the matching reports and registrations backups", async () => {
  const directory = await mkdtemp(join(tmpdir(), "notc-backup-download-"));
  const reportsName = "reports-2026-11-24T10-00-00-000Z-a1b2c3.sqlite";
  const registrationsName = "registrations-2026-11-24T10-00-00-000Z-a1b2c3.sqlite";
  const reportsPath = join(directory, reportsName);
  const registrationsPath = join(directory, registrationsName);

  try {
    await writeFile(reportsPath, "reports database");
    await writeFile(registrationsPath, "registrations database");

    const result = {
      path: reportsPath,
      name: reportsName,
      registration_path: registrationsPath,
      registration_name: registrationsName,
    };
    const zip = new AdmZip(await collect(createBackupArchive(result)));
    const entries = zip.getEntries();

    assert.equal(backupArchiveFilename(result), "database-backup-2026-11-24T10-00-00-000Z-a1b2c3.zip");
    assert.deepEqual(entries.map((entry) => entry.entryName), [reportsName, registrationsName]);
    assert.equal(entries[0].getData().toString(), "reports database");
    assert.equal(entries[1].getData().toString(), "registrations database");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("split database archive creation rejects incomplete backup results", () => {
  assert.throws(
    () => createBackupArchive({ path: "reports.sqlite", name: "reports.sqlite" }),
    /complete reports and registrations backup pair/,
  );
});
