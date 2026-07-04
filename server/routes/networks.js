import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { wrap, ApiError } from "../logger.js";

export const networks = Router();

networks.get("/", wrap((_req, res) => {
  const rows = db.prepare("SELECT id, name FROM networks ORDER BY name COLLATE NOCASE").all();
  res.json(rows);
}));

const nameSchema = z.object({ name: z.string().trim().min(2).max(120) });

networks.post("/", wrap((req, res) => {
  const parsed = nameSchema.safeParse(req.body);
  if (!parsed.success) throw new ApiError(422, "VALIDATION", "A network name (2+ chars) is required");
  try {
    const info = db.prepare("INSERT INTO networks (name) VALUES (?)").run(parsed.data.name);
    res.status(201).json({ id: info.lastInsertRowid, name: parsed.data.name });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      const existing = db.prepare("SELECT id, name FROM networks WHERE name = ?").get(parsed.data.name);
      return res.status(200).json(existing); // idempotent: return the existing one
    }
    throw err;
  }
}));
