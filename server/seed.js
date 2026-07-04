import { db } from "./db.js";

// Seed the network list. Edit freely — inserts are idempotent (name is UNIQUE).
const NETWORKS = [
  "Loveworld Inc",
  "Believers' LoveWorld",
  "Christ Embassy",
  "InnerCity Mission",
  "Rhapsody of Realities",
  "LoveWorld Radio",
  "LoveWorld Television Ministry",
];

const insert = db.prepare("INSERT OR IGNORE INTO networks (name) VALUES (?)");
const tx = db.transaction((names) => names.forEach((n) => insert.run(n)));
tx(NETWORKS);

console.log(`Seeded networks. Total: ${db.prepare("SELECT COUNT(*) c FROM networks").get().c}`);
