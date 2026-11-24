import yazl from "yazl";

export function backupArchiveFilename(result) {
  return String(result?.name || "reports-backup.sqlite")
    .replace(/^reports-/, "database-backup-")
    .replace(/\.sqlite$/i, ".zip");
}

export function createBackupArchive(result) {
  if (!result?.path || !result?.name || !result?.registration_path || !result?.registration_name) {
    throw new Error("A complete reports and registrations backup pair is required.");
  }

  const archive = new yazl.ZipFile();
  archive.addFile(result.path, result.name);
  archive.addFile(result.registration_path, result.registration_name);
  archive.end();
  return archive.outputStream;
}
