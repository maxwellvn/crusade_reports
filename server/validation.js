import { z } from "zod";
import { METRIC_FIELDS } from "./db.js";

const nonNegInt = z.coerce.number().int().min(0);
const contactFields = {
  contact_name: z.string().trim().min(2, "Full name is required").max(200),
  contact_email: z.string().trim().email("Enter a valid email address").max(254),
  phone_country_code: z.string().trim().regex(/^\+\d{1,4}$/, "Use a country code like +234"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
  kingschat_username: z.string().trim().max(100).optional().default(""),
};

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

export const portalCrusadeReportSchema = z.object({
  crusade,
  highlights: z.string().trim().max(2000).optional().default(""),
  media_links: z.string().trim().max(4000).optional().default(""),
});

export const reportSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"]),

    // reporting hierarchy: zone ▸ group ▸ church
    zone: z.string().trim().optional().default(""),
    group_name: z.string().trim().optional().default(""),
    church_name: z.string().trim().optional().default(""),
    cell_name: z.string().trim().optional().default(""),

    // network ("" = not a network report; coerce to undefined before the enum check)
    network_name: z.string().trim().optional().default(""),
    network_type: z.preprocess((v) => v || undefined, z.enum(["predefined", "other"]).optional()),

    country: z.string().trim().min(1, "Country is required"),
    ...contactFields,
    crusades: z.array(crusade).min(1, "At least one crusade is required"),

    highlights: z.string().trim().max(2000).optional().default(""),
    media_links: z.string().trim().max(4000).optional().default(""),
  })
  .superRefine((d, ctx) => {
    const t = d.organization_type;
    if (["zone", "group", "church", "cell"].includes(t) && !d.zone) issue(ctx, ["zone"], "Zone is required");
    if (["group", "church", "cell"].includes(t) && !d.group_name) issue(ctx, ["group_name"], "Group is required");
    if (["church", "cell"].includes(t) && !d.church_name) issue(ctx, ["church_name"], "Church name is required");
    if (t === "cell" && !d.cell_name) issue(ctx, ["cell_name"], "Cell name is required");
    if (t === "network" && !d.network_name) issue(ctx, ["network_name"], "Network is required");
  });

function issue(ctx, path, message) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

// ---- Crusade registration (pre-crusade intent) ------------------------------

const registrationDetails = {
    event_type: z.string().trim().min(1, "Crusade type is required"),
    event_name: z.string().trim().min(2, "Crusade name is required").max(300),
    event_date: z.string().trim().min(1, "Crusade date is required"),
    venue: z.string().trim().min(2, "Venue is required").max(1000),
    expected_attendance: z.coerce.number().int().min(1, "Expected attendance is required"),
    minister_name: z.string().trim().min(1, "Minister name is required"),
    city: z.string().trim().min(1, "City is required"),
};

// Network-only per-crusade planning. Gated in the UI to network registrants;
// harmless (and empty) for every other org type, so the server just accepts them.
// Collaboration is multi-select (stored comma-joined); the rest are free scalars.
const collaborationFields = {
  crusade_collaborators: z.array(z.string().trim().min(1)).max(200).optional().default([]),
  zone_contribution: z.array(z.string().trim().min(1)).max(20).optional().default([]),
  estimated_budget: z.string().trim().max(120).optional().default(""),
  rhapsody_copies_confirmed: z.string().trim().max(60).optional().default(""),
  permits_obtained: z.string().trim().max(40).optional().default(""),
  media_coverage_plan: z.string().trim().max(2000).optional().default(""),
};

const registrationItem = z
  .object({
    ...registrationDetails,
    city_place_id: z.string().trim().optional().default(""),
    ...collaborationFields,
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
    ...contactFields,
    items: z.array(registrationItem).min(1, "Register at least one individual crusade"),
  })
  .superRefine((d, ctx) => {
    const t = d.organization_type;
    if (["zone", "group", "church", "cell"].includes(t) && !d.zone) issue(ctx, ["zone"], "Zone is required");
    if (["group", "church", "cell"].includes(t) && !d.group_name) issue(ctx, ["group_name"], "Group is required");
    if (["church", "cell"].includes(t) && !d.church_name) issue(ctx, ["church_name"], "Church name is required");
    if (t === "cell" && !d.cell_name) issue(ctx, ["cell_name"], "Cell name is required");
    if (t === "network" && !d.network_name) issue(ctx, ["network_name"], "Network is required");
  });

export const confirmationSchema = z
  .object({
    status: z.enum(["confirmed", "pending", "preparing", "ready", "holding", "not_holding"]),
    feedback: z.string().trim().max(2000, "Feedback must be 2,000 characters or fewer.").optional().default(""),
  })
  .refine((d) => d.status !== "not_holding" || d.feedback.length >= 3, {
    path: ["feedback"],
    message: "Tell us why the crusade is not holding, including any challenges.",
  });

export const registrationCrusadeEditSchema = z
  .object({
    ...registrationDetails,
    city_place_id: z.string().trim().optional().default(""),
    ...collaborationFields,
    status: z.enum(["confirmed", "pending", "preparing", "ready", "holding", "not_holding"]),
    feedback: z.string().trim().max(2000, "Feedback must be 2,000 characters or fewer.").optional().default(""),
  })
  .superRefine((d, ctx) => {
    if (d.status === "not_holding" && d.feedback.length < 3) issue(ctx, ["feedback"], "Tell us why the crusade is not holding, including any challenges.");
  });
