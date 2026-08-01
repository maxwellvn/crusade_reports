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
    country: z.string().min(1, "Country is required"),
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

    // Country is per crusade now; the report row keeps the first crusade's country.
    country: z.string().optional().default(""),
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
    minister_name: z.string().trim().min(1, "Minister name is required"),
    country: z.string().min(1, "Country is required"),
    city: z.string().min(1, "City is required"),
    city_place_id: z.string().optional().default(""),
    // Network-only planning (gated in the UI); optional for every org type.
    crusade_collaborators: z.array(z.string()).optional().default([]),
    zone_contribution: z.array(z.string()).optional().default([]),
    estimated_budget: z.string().optional().default(""),
    rhapsody_copies_confirmed: z.string().optional().default(""),
    permits_obtained: z.string().optional().default(""),
    media_coverage_plan: z.string().optional().default(""),
  });

export const registrationSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"], { message: "Select an option" }),
    zone: z.string().optional().default(""),
    group_name: z.string().optional().default(""),
    zone_manual: z.boolean().optional().default(false),
    group_manual: z.boolean().optional().default(false),
    church_name: z.string().optional().default(""),
    cell_name: z.string().optional().default(""),
    network_name: z.string().optional().default(""),
    // country is now per crusade (see registrationItem), so a registration can span countries
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
  zone_manual: false,
  group_manual: false,
  church_name: "",
  cell_name: "",
  network_name: "",
  contact_name: "",
  contact_email: "",
  phone_country_code: "",
  phone_number: "",
  kingschat_username: "",
  items: [],
};

export const missionNationSelectionSchema = z.object({
  pastor_name: z.string().trim().min(2, "Enter the Zonal Pastor's name"),
  zone_name: z.string().trim().min(2, "Select a zone"),
  home_country_code: z.string().length(2, "Select the zone's home nation"),
  mission_country_code: z.string().length(2, "Select one available mission nation"),
  contact_email: z.string().trim().email("Enter a valid email address"),
  phone_country_code: z.string().regex(/^\+\d{1,4}$/, "Select a phone country code"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
  kingschat_username: z.string().trim().max(100).optional().default(""),
}).refine((data) => data.home_country_code !== data.mission_country_code, {
  path: ["mission_country_code"], message: "Your zone cannot select its home nation",
});

export const mediaTrainingRegistrationSchema = z.object({
  zone_name: z.string().trim().min(2, "Select your zone").max(250),
  group_name: z.string().trim().max(250).optional().default(""),
  church_name: z.string().trim().max(250).optional().default(""),
  church_country_code: z.string().length(2, "Select a country"),
  church_city: z.string().trim().min(1, "Select a city").max(200),
  church_city_place_id: z.string().trim().max(300).optional().default(""),
  languages_spoken: z.array(z.string().trim().min(1).max(80)).min(1, "Add at least one language").max(20),
  full_name: z.string().trim().min(2, "Full name is required").max(200),
  role: z.enum(["Presenter", "Cameraman", "Technical Personnel", "Other"], { message: "Select a role" }),
  other_role: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().email("Enter a valid email address").max(254),
  kingschat_username: z.string().trim().refine((value) => !value || /^@?[A-Za-z0-9._-]{2,100}$/.test(value), "Enter a valid KingsChat username").optional().default(""),
  phone_country_code: z.string().regex(/^\+\d{1,4}$/, "Select a country code"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
}).refine((data) => data.role !== "Other" || data.other_role.length >= 2, { path: ["other_role"], message: "Enter your media role" });

export const missionTripVolunteerSchema = z.object({
  designation: z.string().min(1, "Select your designation"), first_name: z.string().trim().min(2, "First name is required"), last_name: z.string().trim().min(2, "Last name is required"),
  email: z.string().trim().email("Enter a valid email address"), phone_country_code: z.string().regex(/^\+\d{1,4}$/, "Select a country code"), phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"), kingschat_username: z.string().trim().max(100).optional().default(""),
  zone_name: z.string().optional().default(""), group_name: z.string().optional().default(""), church_name: z.string().optional().default(""), passport_country_code: z.string().length(2, "Select your passport country"), additional_passports: z.array(z.string()).max(5).default([]), passport_expiry: z.string().min(1, "Enter the passport expiry month"), preferred_destination_code: z.string().length(2, "Select a preferred destination"), ready_for_any_destination: z.boolean().default(false),
  valid_passport: z.literal(true, { errorMap: () => ({ message: "Confirm that your passport is valid" }) }), covers_travel_expenses: z.literal(true, { errorMap: () => ({ message: "Confirm your independent travel access and expenses" }) }), medically_fit: z.literal(true, { errorMap: () => ({ message: "Confirm your medical readiness" }) }), sponsor_interest: z.boolean().default(false), partnership_acknowledged: z.literal(true, { errorMap: () => ({ message: "Acknowledge the partnership information" }) }), additional_information: z.string().max(2000).optional().default(""),
});

// ---- Loveworld Blue Elite staff registration ------------------------------
// Mirrors server/validation.js#blueEliteRegistrationSchema. Org side is fixed
// (zone with optional group/church, no cell/network selector), KingsChat username and
// department are required, and the per-crusade shape is identical to the public
// registration. Server is the source of truth; this is UX.
export const blueEliteRegistrationSchema = z
  .object({
    organization_type: z.literal("church").default("church"),
    zone: z.string().min(1, "Zone is required"),
    group_name: z.string().trim().max(200).optional().default(""),
    church_name: z.string().trim().max(200).optional().default(""),
    cell_name: z.string().optional().default(""),
    network_name: z.string().optional().default(""),
    contact_name: z.string().trim().min(2, "Staff name is required").max(200),
    contact_email: z.string().trim().email("Enter a valid email address").max(254),
    phone_country_code: z.string().trim().regex(/^\+\d{1,4}$/, "Use a country code like +234"),
    phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
    kingschat_username: z.string().trim().max(100).optional().default(""),
    department: z.string().trim().min(2, "Department is required").max(200),
    items: z.array(registrationItem).min(1, "Register at least one individual crusade"),
  });

export const blueEliteRegistrationDefaults = {
  organization_type: "church",
  zone: "",
  group_name: "",
  church_name: "",
  cell_name: "",
  network_name: "",
  contact_name: "",
  contact_email: "",
  phone_country_code: "",
  phone_number: "",
  kingschat_username: "",
  department: "",
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
