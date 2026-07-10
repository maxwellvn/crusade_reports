import { z } from "zod";
import { METRIC_FIELDS } from "./db.js";

const nonNegInt = z.coerce.number().int().min(0);

// Outcome metrics are per-crusade now.
const perCrusadeMetrics = Object.fromEntries(METRIC_FIELDS.map((f) => [f, nonNegInt.default(0)]));

const crusade = z
  .object({
    format: z.enum(["physical", "online"]).default("physical"),
    event_type: z.string().trim().min(1, "Crusade type is required"),
    other_event_type: z.string().trim().optional().default(""),
    event_name: z.string().trim().min(1, "Event name is required"),
    city: z.string().trim().min(1, "City is required"),
    city_place_id: z.string().trim().optional().default(""),
    event_date: z.string().trim().min(1, "Event date is required"),
    attendance: nonNegInt,
    minister_name: z.string().trim().min(1, "Minister is required"),
    venue: z.string().trim().min(1, "Venue is required").max(1000),
    ...perCrusadeMetrics,
  })
  .refine((c) => c.event_type !== "other" || c.other_event_type.length > 0, {
    message: "Specify the crusade type for 'Other'",
    path: ["other_event_type"],
  });

export const reportSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "network"]),

    // reporting hierarchy: zone ▸ group ▸ church
    zone: z.string().trim().optional().default(""),
    group_name: z.string().trim().optional().default(""),
    church_name: z.string().trim().optional().default(""),

    // network ("" = not a network report; coerce to undefined before the enum check)
    network_name: z.string().trim().optional().default(""),
    network_type: z.preprocess((v) => v || undefined, z.enum(["predefined", "other"]).optional()),

    country: z.string().trim().min(1, "Country is required"),
    crusades: z.array(crusade).min(1, "At least one crusade is required"),

    highlights: z.string().trim().max(2000).optional().default(""),
    media_links: z.string().trim().max(4000).optional().default(""),
  })
  .superRefine((d, ctx) => {
    const t = d.organization_type;
    if (["zone", "group", "church"].includes(t) && !d.zone) issue(ctx, ["zone"], "Zone is required");
    if (["group", "church"].includes(t) && !d.group_name) issue(ctx, ["group_name"], "Group is required");
    if (t === "church" && !d.church_name) issue(ctx, ["church_name"], "Church name is required");
    if (t === "network" && !d.network_name) issue(ctx, ["network_name"], "Network is required");
  });

function issue(ctx, path, message) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

// ---- Crusade registration (pre-crusade intent) ------------------------------

const registrationItem = z
  .object({
    event_type: z.string().trim().min(1, "Crusade type is required"),
    planned_count: z.coerce.number().int().min(1, "How many of this type?"),
    minister_name: z.string().trim().optional().default(""),
    city: z.string().trim().optional().default(""),
    city_place_id: z.string().trim().optional().default(""),
  })
  .refine((i) => i.event_type !== "mega" || i.minister_name.length > 0, {
    message: "Minister name is required for mega crusades",
    path: ["minister_name"],
  });

export const registrationSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"]),
    zone: z.string().trim().optional().default(""),
    group_name: z.string().trim().optional().default(""),
    church_name: z.string().trim().optional().default(""),
    cell_name: z.string().trim().optional().default(""),
    network_name: z.string().trim().optional().default(""),
    country: z.string().trim().min(1, "Country is required"),
    plan_date: z.string().trim().min(1, "Plan date is required"),
    items: z.array(registrationItem).min(1, "Add at least one crusade type"),
  })
  .superRefine((d, ctx) => {
    const t = d.organization_type;
    if (["zone", "group", "church", "cell"].includes(t) && !d.zone) issue(ctx, ["zone"], "Zone is required");
    if (["group", "church", "cell"].includes(t) && !d.group_name) issue(ctx, ["group_name"], "Group is required");
    if (["church", "cell"].includes(t) && !d.church_name) issue(ctx, ["church_name"], "Church name is required");
    if (t === "cell" && !d.cell_name) issue(ctx, ["cell_name"], "Cell name is required");
    if (t === "network" && !d.network_name) issue(ctx, ["network_name"], "Network is required");
  });
