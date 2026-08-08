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
    country: z.string().trim().min(1, "Country is required"),
    city: z.string().trim().min(1, "City is required"),
    city_place_id: z.string().trim().optional().default(""),
    event_date: z.string().trim().min(1, "Event date is required"),
    attendance: nonNegInt,
    crusade_expense: z.coerce.number().finite().min(0, "Expense cannot be negative").default(0),
    minister_name: z.string().trim().min(1, "Minister is required"),
    venue: z.string().trim().min(1, "Venue is required").max(1000),
    ...perCrusadeMetrics,
  })
  .refine((c) => c.event_type !== "other" || c.other_event_type.length > 0, {
    message: "Specify the crusade type for 'Other'",
    path: ["other_event_type"],
  });

const mediaLinkFields = {
  highlights: z.string().trim().max(2000).optional().default(""),
  photo_links: z.string().trim().max(8000).optional().default(""),
  video_links: z.string().trim().max(8000).optional().default(""),
  // Kept for older clients / imports; new UI prefers photo_links + video_links.
  media_links: z.string().trim().max(8000).optional().default(""),
};

export const portalCrusadeReportSchema = z.object({
  crusade,
  ...mediaLinkFields,
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

    // Country is per crusade now; the report row keeps the first crusade's
    // country as its primary (column is NOT NULL, drives report-level grouping).
    country: z.string().trim().optional().default(""),
    ...contactFields,
    crusades: z.array(crusade).min(1, "At least one crusade is required"),

    ...mediaLinkFields,
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
    country: z.string().trim().min(1, "Country is required"),
    city_place_id: z.string().trim().optional().default(""),
    ...collaborationFields,
  });

export const registrationSchema = z
  .object({
    organization_type: z.enum(["zone", "group", "church", "cell", "network"]),
    zone: z.string().trim().optional().default(""),
    group_name: z.string().trim().optional().default(""),
    zone_manual: z.boolean().optional().default(false),
    group_manual: z.boolean().optional().default(false),
    church_name: z.string().trim().optional().default(""),
    cell_name: z.string().trim().optional().default(""),
    network_name: z.string().trim().optional().default(""),
    // country is per crusade now (registrationItem), so a registration can span countries
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

// ---- Loveworld Blue Elite staff registration -------------------------------
// Same per-crusade shape as the public registration, but the org side is fixed:
// Blue Elite staff always identify a zone; group and church are optional because
// staff may serve directly in a zonal or group church. They must supply a
// department and a KingsChat username. Reuses the
// existing contact_name column for the staff member's name.

const blueEliteContactFields = {
  contact_name: z.string().trim().min(2, "Staff name is required").max(200),
  contact_email: z.string().trim().email("Enter a valid email address").max(254),
  phone_country_code: z.string().trim().regex(/^\+\d{1,4}$/, "Use a country code like +234"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
  kingschat_username: z.string().trim().min(2, "KingsChat username is required").max(100),
  department: z.string().trim().min(2, "Department is required").max(200),
};

export const blueEliteRegistrationSchema = z
  .object({
    // Fixed internally; the form does not expose an org-type selector.
    organization_type: z.literal("church").default("church"),
    zone: z.string().trim().min(1, "Zone is required"),
    group_name: z.string().trim().max(200).optional().default(""),
    church_name: z.string().trim().max(200).optional().default(""),
    cell_name: z.string().trim().optional().default(""),
    network_name: z.string().trim().optional().default(""),
    ...blueEliteContactFields,
    items: z.array(registrationItem).min(1, "Register at least one individual crusade"),
  });

// ---- Mission nation selection ----------------------------------------------

export const missionNationSelectionSchema = z.object({
  minister_type: z.enum(["zonal_pastor", "ism_minister", "reon_minister", "rim_minister", "other"]).default("zonal_pastor"),
  pastor_name: z.string().trim().min(2, "Minister name is required").max(200),
  zone_name: z.string().trim().optional().default(""),
  ministry_name: z.string().trim().max(200).optional().default(""),
  home_country_code: z.string().trim().length(2, "Home nation is required").toUpperCase(),
  mission_country_code: z.string().trim().length(2, "Select a mission nation").toUpperCase(),
  contact_email: z.string().trim().email("Enter a valid email address").max(254),
  phone_country_code: z.string().trim().refine((value) => value === "" || /^\+\d{1,4}$/.test(value), "Use a country code like +234").optional().default(""),
  phone_number: z.string().trim().refine((value) => value === "" || /^[\d ()-]{6,24}$/.test(value), "Enter a valid phone number").optional().default(""),
  kingschat_username: z.string().trim().max(100).optional().default(""),
}).superRefine((data, ctx) => {
  if (data.minister_type === "zonal_pastor" && data.zone_name.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["zone_name"], message: "Select a zone" });
  if (data.minister_type === "other" && data.ministry_name.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["ministry_name"], message: "Enter your ministry or network" });
  if (Boolean(data.phone_number) !== Boolean(data.phone_country_code)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [data.phone_number ? "phone_country_code" : "phone_number"], message: "Enter both phone number and country code, or leave both blank" });
  if (data.home_country_code === data.mission_country_code) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["mission_country_code"], message: "Choose a nation outside your home nation" });
});

const mediaTrainingTraineeFields = {
  full_name: z.string().trim().min(2, "Trainee name is required").max(200),
  role: z.enum(["Presenter", "Cameraman", "Technical Personnel", "Other"], { message: "Select the trainee's role" }),
  other_role: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().email("Enter a valid email address").max(254),
  kingschat_username: z.string().trim().refine((value) => !value || /^@?[A-Za-z0-9._-]{2,100}$/.test(value), "Enter a valid KingsChat username").optional().default(""),
  phone_country_code: z.string().trim().regex(/^\+\d{1,4}$/, "Select a phone country code"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
};

export const mediaTrainingRegistrationSchema = z.object({
  zone_name: z.string().trim().min(2, "Select your zone").max(250),
  group_name: z.string().trim().max(250).optional().default(""),
  church_name: z.string().trim().max(250).optional().default(""),
  church_country_code: z.string().trim().length(2, "Select a country").toUpperCase(),
  church_city: z.string().trim().min(1, "Select a city").max(200),
  church_city_place_id: z.string().trim().max(300).optional().default(""),
  languages_spoken: z.array(z.string().trim().min(1).max(80)).min(1, "Add at least one language").max(20),
  ...mediaTrainingTraineeFields,
}).refine((data) => data.role !== "Other" || data.other_role.length >= 2, { path: ["other_role"], message: "Enter your media role" });

export const missionTripVolunteerSchema = z.object({
  designation: z.string().trim().min(1, "Select your designation").max(80),
  first_name: z.string().trim().min(2, "First name is required").max(100),
  last_name: z.string().trim().min(2, "Last name is required").max(100),
  email: z.string().trim().email("Enter a valid email address").max(254),
  phone_country_code: z.string().regex(/^\+\d{1,4}$/, "Select a country code"),
  phone_number: z.string().trim().regex(/^[\d ()-]{6,24}$/, "Enter a valid phone number"),
  kingschat_username: z.string().trim().refine((value) => !value || /^@?[A-Za-z0-9._-]{2,100}$/.test(value), "Enter a valid KingsChat username").optional().default(""),
  zone_name: z.string().trim().max(250).optional().default(""),
  group_name: z.string().trim().max(250).optional().default(""),
  church_name: z.string().trim().max(250).optional().default(""),
  passport_country_code: z.string().length(2, "Select your passport country").toUpperCase(),
  additional_passports: z.array(z.string().length(2)).max(5).optional().default([]),
  passport_expiry: z.string().regex(/^\d{4}-\d{2}$/, "Enter the passport expiry month"),
  preferred_destination_code: z.string().length(2, "Select a preferred destination").toUpperCase(),
  ready_for_any_destination: z.boolean().default(false),
  valid_passport: z.literal(true, { errorMap: () => ({ message: "Confirm that your passport is valid" }) }),
  covers_travel_expenses: z.literal(true, { errorMap: () => ({ message: "Confirm your independent travel access and expenses" }) }),
  medically_fit: z.literal(true, { errorMap: () => ({ message: "Confirm your medical readiness" }) }),
  sponsor_interest: z.boolean().default(false),
  partnership_acknowledged: z.literal(true, { errorMap: () => ({ message: "Acknowledge the partnership information" }) }),
  additional_information: z.string().trim().max(2000).optional().default(""),
});

export const upcomingCrusadeInterestSchema = z.object({
  designation: z.enum(["Regional Pastor", "Zonal Director", "Zonal Pastor", "Group Pastor", "Campus Regional Secretary", "Campus Zonal Secretary", "Campus Group Pastor"], { errorMap: () => ({ message: "Select your designation" }) }),
  full_name: z.string().trim().min(2, "Full name is required").max(200),
  zone_name: z.string().trim().min(2, "Select your zone").max(250),
  group_name: z.string().trim().max(250).optional().default(""),
  passport_country_code: z.string().length(2, "Select your passport country").toUpperCase(),
  opportunity_codes: z.array(z.string().min(2).max(20).toUpperCase()).length(1, "Select one upcoming crusade"),
  additional_information: z.string().trim().max(2000).optional().default(""),
});

// Admin reconciliation of manually-typed org names: map a registration's zone
// and/or group to the real directory entry. Zone is required; group is optional
// (some org types don't have groups). Both clear the manual flags on save.
export const manualOrgUpdateSchema = z.object({
  zone: z.string().trim().min(1, "Select a zone from the directory"),
  group_name: z.string().trim().max(200).optional().default(""),
});
