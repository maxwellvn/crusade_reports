import { z } from "zod";
import { METRIC_KEYS } from "./constants";

// ponytail: mirrors server/validation.js — separate copy because that one runs in
// Node and imports server modules. Server is the source of truth; this is UX.
const nonNegInt = z.coerce.number().int().min(0);
const contactFields = {
  contact_name: z.string().trim().min(2, "Full name is required").max(200),
  contact_email: z.string().trim().email("Enter a valid email address").max(254),
  phone_country_code: z.string().trim().regex(/^\+\d{1,4}$/, "Use a country code like +234"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
  kingschat_username: z.string().trim().max(100).optional().default(""),
};
const perCrusadeMetrics = Object.fromEntries(METRIC_KEYS.map((k) => [k, nonNegInt]));

const crusade = z
  .object({
    format: z.enum(["physical", "online"], { message: "Select physical or online" }),
    event_type: z.string().min(1, "Type is required"),
    other_event_type: z.string().optional().default(""),
    event_name: z.string().min(1, "Event name is required"),
    city: z.string().min(1, "City is required"),
    city_place_id: z.string().optional().default(""),
    event_date: z.string().min(1, "Date is required"),
    attendance: nonNegInt,
    minister_name: z.string().min(1, "Minister is required"),
    venue: z.string().min(1, "Venue is required"),
    ...perCrusadeMetrics,
  })
  .refine((c) => c.event_type !== "other" || c.other_event_type.trim().length > 0, {
    message: "Specify the type",
    path: ["other_event_type"],
  });
// Plausibility (salvations ≤ attendance, mega size) is surfaced as soft inline
// warnings in the UI, not hard blocks — reporters can still submit an outlier.

export const reportSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"], { message: "Select an option" }),
    zone: z.string().optional().default(""),
    group_name: z.string().optional().default(""),
    church_name: z.string().optional().default(""),
    cell_name: z.string().optional().default(""),
    network_name: z.string().optional().default(""),
    network_type: z.string().optional().default(""),

    country: z.string().min(1, "Country is required"),
    ...contactFields,
    crusades: z.array(crusade).min(1, "Add at least one crusade"),

    highlights: z.string().max(2000).optional().default(""),
    media_links: z.string().max(4000).optional().default(""),
  })
  .superRefine((d, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const t = d.organization_type;
    if (["zone", "group", "church", "cell"].includes(t) && !d.zone) add(["zone"], "Zone is required");
    if (["group", "church", "cell"].includes(t) && !d.group_name) add(["group_name"], "Group is required");
    if (["church", "cell"].includes(t) && !d.church_name) add(["church_name"], "Church name is required");
    if (t === "cell" && !d.cell_name) add(["cell_name"], "Cell name is required");
    if (t === "network" && !d.network_name) add(["network_name"], "Network is required");
  });

// ---- Crusade registration (pre-crusade intent) ------------------------------

const registrationItem = z
  .object({
    event_type: z.string().min(1, "Select a crusade type"),
    event_name: z.string().trim().min(2, "Crusade name is required").max(300),
    event_date: z.string().min(1, "Select the crusade date"),
    venue: z.string().trim().min(2, "Venue is required").max(1000),
    expected_attendance: z.coerce.number({ message: "Expected attendance is required" }).int().min(1, "Expected attendance is required"),
    minister_name: z.string().optional().default(""),
    city: z.string().min(1, "City is required"),
    city_place_id: z.string().optional().default(""),
  })
  .refine((i) => i.event_type !== "mega" || i.minister_name.trim().length > 0, {
    message: "Minister name is required for mega crusades",
    path: ["minister_name"],
  });

export const registrationSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"], { message: "Select an option" }),
    zone: z.string().optional().default(""),
    group_name: z.string().optional().default(""),
    church_name: z.string().optional().default(""),
    cell_name: z.string().optional().default(""),
    network_name: z.string().optional().default(""),
    country: z.string().min(1, "Country is required"),
    ...contactFields,
    items: z.array(registrationItem).min(1, "Register at least one individual crusade"),
  })
  .superRefine((d, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
    const t = d.organization_type;
    if (["zone", "group", "church", "cell"].includes(t) && !d.zone) add(["zone"], "Zone is required");
    if (["group", "church", "cell"].includes(t) && !d.group_name) add(["group_name"], "Group is required");
    if (["church", "cell"].includes(t) && !d.church_name) add(["church_name"], "Church name is required");
    if (t === "cell" && !d.cell_name) add(["cell_name"], "Cell name is required");
    if (t === "network" && !d.network_name) add(["network_name"], "Network is required");
  });

export const registrationDefaults = {
  organization_type: "",
  zone: "",
  group_name: "",
  church_name: "",
  cell_name: "",
  network_name: "",
  country: "",
  contact_name: "",
  contact_email: "",
  phone_country_code: "",
  phone_number: "",
  kingschat_username: "",
  items: [],
};

export const defaultValues = {
  organization_type: "",
  zone: "",
  group_name: "",
  church_name: "",
  cell_name: "",
  network_name: "",
  network_type: "",
  country: "",
  contact_name: "",
  contact_email: "",
  phone_country_code: "",
  phone_number: "",
  kingschat_username: "",
  crusades: [],
  highlights: "",
  media_links: "",
};
