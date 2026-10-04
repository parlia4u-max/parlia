import { ActionError } from "./errors.ts";

export const PORTAL_NOTIFICATION_KEYS = [
  ["newUpdate", "New update"],
  ["newDocument", "New document"],
  ["documentRequested", "Document requested"],
  ["invoicePublished", "Invoice published"],
  ["meeting", "Meeting booked or starting soon"],
  ["uploadReviewed", "Upload accepted or rejected"],
] as const;

export type PortalNotificationKey = (typeof PORTAL_NOTIFICATION_KEYS)[number][0];

export type PortalSettings = {
  requestAccessEnabled: boolean;
  inviteByDefault: boolean;
  invitationWording: string;
  inviteExpiryDays: number;
  inviteReminderDays: number;
  allowedUploadTypes: string[];
  maxUploadMb: number;
  introVideoUrl: string;
  updateFeeEnabled: boolean;
  updateFeeAmount: number;
  estimatedDatesEnabled: boolean;
  reminderDays: number[];
  reminderMax: number;
  notifications: Record<PortalNotificationKey, { enabled: boolean; wording: string }>;
};

export const DEFAULT_PORTAL_SETTINGS: PortalSettings = {
  requestAccessEnabled: true,
  inviteByDefault: false,
  invitationWording: "We have set up a secure space where you can follow your matter, read updates from us and share documents.",
  inviteExpiryDays: 7,
  inviteReminderDays: 3,
  allowedUploadTypes: ["pdf", "jpg", "jpeg", "png"],
  maxUploadMb: 10,
  introVideoUrl: "",
  updateFeeEnabled: false,
  updateFeeAmount: 0,
  estimatedDatesEnabled: false,
  reminderDays: [3, 7],
  reminderMax: 2,
  notifications: {
    newUpdate: { enabled: true, wording: "There is a new update waiting for you." },
    newDocument: { enabled: true, wording: "There is a new document waiting for you." },
    documentRequested: { enabled: true, wording: "We need a document from you." },
    invoicePublished: { enabled: true, wording: "There is something waiting for you in your portal." },
    meeting: { enabled: true, wording: "There is a meeting waiting for you in your portal." },
    uploadReviewed: { enabled: true, wording: "We have reviewed something you sent." },
  },
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

function wholeNumber(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new ActionError(`${label} must be a whole number between ${min} and ${max}.`);
  }
}

function plainText(value: unknown, label: string, max: number, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) {
    throw new ActionError(`${label} ${required ? "is required and " : ""}must be ${max} characters or fewer.`);
  }
}

export function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function validatePortalSettings(value: unknown) {
  const data = record(value);
  for (const key of ["requestAccessEnabled", "inviteByDefault", "updateFeeEnabled", "estimatedDatesEnabled"]) {
    if (typeof data[key] !== "boolean") throw new ActionError(`${key} must be on or off.`);
  }
  plainText(data.invitationWording, "Invitation wording", 600, true);
  wholeNumber(data.inviteExpiryDays, "Invitation expiry days", 1, 60);
  wholeNumber(data.inviteReminderDays, "Invitation reminder days", 0, 60);
  wholeNumber(data.maxUploadMb, "Largest upload size (MB)", 1, 100);
  wholeNumber(data.updateFeeAmount, "Update fee", 0, 1_000_000);
  wholeNumber(data.reminderMax, "Maximum reminders", 0, 10);
  plainText(data.introVideoUrl, "Intro video link", 2048);
  if (data.introVideoUrl && !isHttpsUrl(String(data.introVideoUrl))) throw new ActionError("The intro video link must be an HTTPS link.");
  if (!Array.isArray(data.allowedUploadTypes) || !data.allowedUploadTypes.length || data.allowedUploadTypes.length > 20
    || data.allowedUploadTypes.some((item) => typeof item !== "string" || !/^[a-z0-9]{1,10}$/.test(item))) {
    throw new ActionError("Allowed upload types must be 1 to 20 file endings such as pdf or jpg, in lower case.");
  }
  if (!Array.isArray(data.reminderDays) || data.reminderDays.length > 10) throw new ActionError("Reminder days must be a list of up to 10 numbers.");
  for (const day of data.reminderDays) wholeNumber(day, "Each reminder day", 1, 90);
  const notifications = record(data.notifications);
  for (const [key, label] of PORTAL_NOTIFICATION_KEYS) {
    const entry = record(notifications[key]);
    if (typeof entry.enabled !== "boolean") throw new ActionError(`${label}: choose on or off.`);
    plainText(entry.wording, `${label} wording`, 300, true);
  }
}

export function portalSettingsFromConfig(published: unknown): PortalSettings {
  const stored = record(record(published).clientPortal);
  const storedNotifications = record(stored.notifications);
  const notifications = Object.fromEntries(PORTAL_NOTIFICATION_KEYS.map(([key]) => {
    const entry = record(storedNotifications[key]);
    const fallback = DEFAULT_PORTAL_SETTINGS.notifications[key];
    return [key, {
      enabled: typeof entry.enabled === "boolean" ? entry.enabled : fallback.enabled,
      wording: typeof entry.wording === "string" && entry.wording.trim() ? entry.wording : fallback.wording,
    }];
  })) as PortalSettings["notifications"];
  return { ...DEFAULT_PORTAL_SETTINGS, ...stored, notifications } as PortalSettings;
}

export function slugFromName(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  return base || "firm";
}

export function normalizeBrandColour(value: unknown, fallback = "#B8913F") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}
