import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const archive = join(process.env.TMPDIR || "/tmp", "crusade-reports-cities15000.zip");
const sourceUrl = "https://download.geonames.org/export/dump/cities15000.zip";

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`GeoNames download failed: ${response.status}`);
writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
const source = execFileSync("unzip", ["-p", archive, "cities15000.txt"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
unlinkSync(archive);

const cities = source.trim().split("\n").map((line) => {
  const columns = line.split("\t");
  return [
    Number(columns[0]),
    columns[1],
    columns[2],
    columns[8],
    Number(columns[4]),
    Number(columns[5]),
    Number(columns[14]) || 0,
  ];
}).sort((left, right) => right[6] - left[6]);

const output = join(root, "server", "data", "cities15000.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(cities)}\n`);
console.log(`Wrote ${cities.length.toLocaleString()} local cities to ${output}`);
