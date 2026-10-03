import { ActionError } from "./errors.ts";
import { MODULES } from "./permissions.ts";

export const SETUP_SECTIONS = [
  { key: "firmProfile", label: "Firm profile and branding", href: "/settings/firm-profile", ownerOnly: false },
  { key: "countryHolidays", label: "Country, province and holidays", href: "/settings/country-holidays", ownerOnly: false },
  { key: "matterTypes", label: "Matter types and stages", href: "/settings/matter-types-stages", ownerOnly: false },
  { key: "taskTypes", label: "Task types and categories", href: "/settings/task-types-categories", ownerOnly: false },
  { key: "urgencyBands", label: "Urgency bands", href: "/settings/urgency-bands", ownerOnly: false },
  { key: "followUpRules", label: "Follow-up and tracing rules", href: "/settings/follow-up-tracing", ownerOnly: false },
  { key: "permissions", label: "Permissions and role templates", href: "/settings/permissions", ownerOnly: true },
  { key: "calendarVisibility", label: "Calendar visibility", href: "/settings/calendar-visibility", ownerOnly: false },
  { key: "leaveRules", label: "Leave rules and forms", href: "/settings/leave-rules", ownerOnly: false },
  { key: "minutesTemplates", label: "Minutes templates", href: "/settings/minutes-templates", ownerOnly: false },
  { key: "hrChecklist", label: "HR checklist and onboarding", href: "/settings/hr-checklist", ownerOnly: false },
  { key: "filingStructure", label: "Filing structure and locations", href: "/settings/filing-structure", ownerOnly: false },
  { key: "integrations", label: "Integrations", href: "/settings/integrations", ownerOnly: true },
  { key: "setupRights", label: "Supervisor setup rights", href: "/settings/supervisor-setup-rights", ownerOnly: true },
] as const;

export type SetupSectionKey = (typeof SETUP_SECTIONS)[number]["key"];
export type SetupConfig = Record<SetupSectionKey, unknown>;

const southAfricanHolidays2026 = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-03-21", name: "Human Rights Day" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-04-06", name: "Family Day" },
  { date: "2026-04-27", name: "Freedom Day" },
  { date: "2026-05-01", name: "Workers' Day" },
  { date: "2026-06-16", name: "Youth Day" },
  { date: "2026-08-09", name: "National Women's Day" },
  { date: "2026-08-10", name: "National Women's Day observed" },
  { date: "2026-09-24", name: "Heritage Day" },
  { date: "2026-12-16", name: "Day of Reconciliation" },
  { date: "2026-12-25", name: "Christmas Day" },
  { date: "2026-12-26", name: "Day of Goodwill" },
];

export function createInitialSetupConfig(firmName: string): SetupConfig {
  const defaultPermissions = Object.fromEntries(MODULES.map((module) => [module, { level: "None", scope: "Own" }]));
  return {
    firmProfile: { name: firmName, legalName: "", email: "", phone: "", address: "", website: "", logoUrl: "" },
    countryHolidays: {
      country: "South Africa",
      province: "",
      publicHolidays: southAfricanHolidays2026,
      courtRecesses: [],
    },
    matterTypes: [
      { name: "Litigation", stages: ["Instruction", "Pleadings", "Discovery", "Trial", "Closed"] },
      { name: "Conveyancing", stages: ["Instruction", "Transfer", "Registration", "Closed"] },
    ],
    taskTypes: [
      { name: "Legal work", categories: ["Drafting", "Research", "Review"] },
      { name: "Administration", categories: ["Filing", "Client follow-up"] },
    ],
    urgencyBands: [
      { name: "Routine", days: 14, colour: "#bfd3c1" },
      { name: "Soon", days: 7, colour: "#f1d794" },
      { name: "Urgent", days: 2, colour: "#ebc7c0" },
    ],
    followUpRules: { followUpAfterDays: 7, tracingAfterDays: 14, maxTracingAttempts: 3 },
    permissions: {
      roles: [
        { name: "Lawyer", permissions: Object.fromEntries(MODULES.map((module) => [module, { level: ["matters", "tasks", "calendar"].includes(module) ? "Edit" : ["people", "reports"].includes(module) ? "View" : "None", scope: module === "matters" || module === "calendar" ? "Firm" : "Own" }])) },
        { name: "Candidate attorney", permissions: Object.fromEntries(MODULES.map((module) => [module, { level: module === "matters" || module === "tasks" ? "Edit" : module === "calendar" || module === "people" ? "View" : "None", scope: module === "matters" ? "Team" : "Own" }])) },
        { name: "Admin", permissions: Object.fromEntries(MODULES.map((module) => [module, { level: module === "settings" || module === "people" ? "Edit" : module === "accounts" ? "None" : "View", scope: "Firm" }])) },
        { name: "Accounts", permissions: Object.fromEntries(MODULES.map((module) => [module, { level: module === "accounts" ? "Edit" : ["matters", "reports"].includes(module) ? "View" : "None", scope: "Firm" }])) },
        { name: "Custom", permissions: defaultPermissions },
      ],
    },
    calendarVisibility: {
      roles: [
        { role: "Administrator", visibility: "Firm" },
        { role: "Supervisor", visibility: "Team" },
        { role: "Staff", visibility: "Own" },
      ],
    },
    leaveRules: {
      annualLeaveDays: 15,
      sickLeaveDaysPerCycle: 30,
      cycleMonths: 36,
      carryOverDays: 5,
      formFields: ["Leave type", "Start date", "End date", "Reason", "Covering colleague"],
    },
    minutesTemplates: [
      { name: "Client meeting", sections: ["Attendees", "Discussion", "Advice", "Actions", "Next meeting"] },
      { name: "Internal meeting", sections: ["Attendees", "Agenda", "Decisions", "Actions"] },
    ],
    hrChecklist: [
      { name: "Identity and contact details", required: true },
      { name: "Employment agreement", required: true },
      { name: "Emergency contact", required: true },
      { name: "Equipment issued", required: false },
      { name: "Induction completed", required: true },
    ],
    filingStructure: {
      locations: [{ name: "Main office", code: "MAIN" }],
      folders: ["Correspondence", "Pleadings", "Evidence", "Court documents", "Accounts"],
    },
    integrations: {
      calendarSyncEnabled: false,
      accountingEnabled: false,
      emailSyncEnabled: false,
    },
    setupRights: { supervisors: [] },
  };
}

const text = (value: unknown, label: string, max = 300) => {
  if (typeof value !== "string" || value.length > max) throw new ActionError(`${label} must be text of ${max} characters or fewer.`);
};
const array = (value: unknown, label: string, max = 200): unknown[] => {
  if (!Array.isArray(value) || value.length > max) throw new ActionError(`${label} must be a list of no more than ${max} entries.`);
  return value;
};
const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionError(`${label} must be a JSON object.`);
  return value as Record<string, unknown>;
};
const positiveNumber = (value: unknown, label: string, max = 10000) => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > max) throw new ActionError(`${label} must be a whole number between 0 and ${max}.`);
};
const date = (value: unknown, label: string) => {
  text(value, label, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value)) || Number.isNaN(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
    throw new ActionError(`${label} must be a valid date in YYYY-MM-DD format.`);
  }
};
const namedList = (value: unknown, label: string, nested?: string) => {
  for (const [index, item] of array(value, label).entries()) {
    const row = object(item, `${label} entry ${index + 1}`);
    text(row.name, `${label} entry name`, 120);
    if (!String(row.name).trim()) throw new ActionError(`${label} entry names cannot be blank.`);
    if (nested) for (const child of array(row[nested], `${label} ${nested}`, 100)) {
      text(child, `${nested} entry`, 120);
      if (!String(child).trim()) throw new ActionError(`${nested} entries cannot be blank.`);
    }
  }
};

export function validateSetupValue(section: SetupSectionKey, value: unknown): unknown {
  switch (section) {
    case "firmProfile": {
      const data = object(value, section);
      for (const key of ["name", "legalName", "email", "phone", "address", "website", "logoUrl"]) {
        const max = key === "address" ? 500 : key === "logoUrl" || key === "website" ? 2048 : 254;
        text(data[key], key, max);
      }
      if (!String(data.name).trim()) throw new ActionError("Firm name is required.");
      if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email))) throw new ActionError("Enter a valid email address.");
      if (data.website && !isHttpsUrl(String(data.website))) throw new ActionError("Website must be an HTTPS URL.");
      if (data.logoUrl && (!isHttpsUrl(String(data.logoUrl)) || String(data.logoUrl).length > 2048)) {
        throw new ActionError("Logo must be an HTTPS image URL. Uploads are not accepted.");
      }
      break;
    }
    case "countryHolidays": {
      const data = object(value, section);
      text(data.country, "Country", 100);
      text(data.province, "Province", 100);
      for (const item of array(data.publicHolidays, "Public holidays", 300)) {
        const row = object(item, "Holiday");
        date(row.date, "Holiday date"); text(row.name, "Holiday name", 120);
        if (!String(row.name).trim()) throw new ActionError("Holiday names cannot be blank.");
      }
      for (const item of array(data.courtRecesses, "Court recesses", 100)) {
        const row = object(item, "Court recess");
        text(row.name, "Recess name", 120); date(row.start, "Recess start"); date(row.end, "Recess end");
        if (String(row.start) > String(row.end)) throw new ActionError("Court recess start must be on or before its end.");
      }
      break;
    }
    case "matterTypes": namedList(value, "Matter types", "stages"); break;
    case "taskTypes": namedList(value, "Task types", "categories"); break;
    case "minutesTemplates": namedList(value, "Minutes templates", "sections"); break;
    case "urgencyBands": {
      for (const item of array(value, "Urgency bands")) {
        const row = object(item, "Urgency band"); text(row.name, "Urgency band name", 120); positiveNumber(row.days, "Urgency days", 3650);
        if (!String(row.name).trim()) throw new ActionError("Urgency band names cannot be blank.");
        text(row.colour, "Urgency colour", 20);
        if (!/^#[0-9a-f]{6}$/i.test(String(row.colour))) throw new ActionError("Urgency colours must be six-digit hex values.");
      }
      break;
    }
    case "followUpRules": {
      const data = object(value, section);
      for (const key of ["followUpAfterDays", "tracingAfterDays", "maxTracingAttempts"]) positiveNumber(data[key], key, 3650);
      break;
    }
    case "permissions": {
      const data = object(value, section);
      for (const item of array(data.roles, "Roles", 50)) {
        const role = object(item, "Role"); text(role.name, "Role name", 80);
        if (!String(role.name).trim()) throw new ActionError("Role name is required.");
        if (String(role.name).trim().toLowerCase() === "owner") throw new ActionError("Owner permissions are immutable.");
        const permissions = object(role.permissions, `Permissions for ${role.name}`);
        for (const module of MODULES) {
          const permission = object(permissions[module], `${role.name} ${module} permission`);
          if (!["None", "View", "Edit"].includes(String(permission.level)) || !["Own", "Team", "Firm"].includes(String(permission.scope))) {
            throw new ActionError(`Invalid permissions for ${role.name} on ${module}.`);
          }
        }
      }
      {
        const names = array(data.roles, "Roles", 50).map((item) => String(object(item, "Role").name).trim().toLowerCase());
        if (new Set(names).size !== names.length) throw new ActionError("Role names must be unique.");
      }
      break;
    }
    case "calendarVisibility": {
      const data = object(value, section);
      for (const item of array(data.roles, "Calendar roles", 50)) {
        const row = object(item, "Calendar role"); text(row.role, "Role", 80);
        if (!String(row.role).trim()) throw new ActionError("Calendar role name is required.");
        if (!["Own", "Team", "Firm"].includes(String(row.visibility))) throw new ActionError("Calendar visibility must be Own, Team or Firm.");
      }
      break;
    }
    case "leaveRules": {
      const data = object(value, section);
      for (const key of ["annualLeaveDays", "sickLeaveDaysPerCycle", "cycleMonths", "carryOverDays"]) positiveNumber(data[key], key, 1000);
      for (const field of array(data.formFields, "Leave form fields", 50)) {
        text(field, "Leave form field", 120);
        if (!String(field).trim()) throw new ActionError("Leave form fields cannot be blank.");
      }
      break;
    }
    case "hrChecklist":
      for (const item of array(value, "HR checklist")) {
        const row = object(item, "HR checklist item"); text(row.name, "Checklist item", 160);
        if (!String(row.name).trim()) throw new ActionError("Checklist item names cannot be blank.");
        if (typeof row.required !== "boolean") throw new ActionError("Checklist required must be true or false.");
      }
      break;
    case "filingStructure": {
      const data = object(value, section);
      for (const item of array(data.locations, "Filing locations", 100)) {
        const row = object(item, "Filing location"); text(row.name, "Location name", 120); text(row.code, "Location code", 40);
        if (!String(row.name).trim() || !String(row.code).trim()) throw new ActionError("Filing locations require a name and code.");
      }
      for (const folder of array(data.folders, "Folder structure", 100)) {
        text(folder, "Folder name", 120);
        if (!String(folder).trim()) throw new ActionError("Folder names cannot be blank.");
      }
      break;
    }
    case "integrations": {
      const data = object(value, section);
      for (const key of ["calendarSyncEnabled", "accountingEnabled", "emailSyncEnabled"]) {
        if (typeof data[key] !== "boolean") throw new ActionError(`${key} must be enabled or disabled.`);
      }
      break;
    }
    case "setupRights": {
      const data = object(value, section);
      for (const item of array(data.supervisors, "Supervisors with setup rights", 100)) {
        const row = object(item, "Supervisor setup grant"); text(row.userId, "Supervisor user ID", 80);
        if (!String(row.userId).trim()) throw new ActionError("Choose a supervisor for each setup-rights grant.");
        const sections = array(row.sections, "Granted sections", SETUP_SECTIONS.length);
        for (const section of sections) {
          if (!SETUP_SECTIONS.some((allowed) => allowed.key === section && !allowed.ownerOnly) || section === "setupRights") {
            throw new ActionError("Supervisor rights can only grant drafting of non-administrative setup sections.");
          }
        }
        if (new Set(sections).size !== sections.length) throw new ActionError("A setup section can only be selected once per supervisor.");
      }
      {
        const ids = array(data.supervisors, "Supervisors with setup rights", 100).map((item) => String(object(item, "Supervisor setup grant").userId));
        if (new Set(ids).size !== ids.length) throw new ActionError("Each supervisor can have only one setup-rights entry.");
      }
      break;
    }
  }
  return value;
}

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isSetupSectionKey(value: string): value is SetupSectionKey {
  return SETUP_SECTIONS.some((section) => section.key === value);
}
