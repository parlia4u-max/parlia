import { ActionError } from "./errors.ts";

export const SAST_OFFSET_HOURS = 2;

export type AvailabilitySettings = {
  enabled: boolean;
  weekdays: number[];
  startTime: string;
  endTime: string;
  slotMinutes: number;
  bufferMinutes: number;
  noticeHours: number;
  maxDaysAhead: number;
};

export const DEFAULT_AVAILABILITY: AvailabilitySettings = {
  enabled: false,
  weekdays: [1, 2, 3, 4, 5],
  startTime: "09:00",
  endTime: "16:00",
  slotMinutes: 30,
  bufferMinutes: 0,
  noticeHours: 24,
  maxDaysAhead: 30,
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function minutesOf(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function validateAvailability(value: unknown): AvailabilitySettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ActionError("Availability settings are invalid.");
  const data = value as Record<string, unknown>;
  if (typeof data.enabled !== "boolean") throw new ActionError("Choose whether client booking is on or off.");
  if (!Array.isArray(data.weekdays) || data.weekdays.length > 7 || data.weekdays.some((day) => !Number.isInteger(day) || (day as number) < 0 || (day as number) > 6)) {
    throw new ActionError("Choose the days clients can book (0 = Sunday to 6 = Saturday).");
  }
  if (typeof data.startTime !== "string" || typeof data.endTime !== "string" || !TIME.test(data.startTime) || !TIME.test(data.endTime)) {
    throw new ActionError("Enter start and end times like 09:00.");
  }
  if (minutesOf(data.endTime) <= minutesOf(data.startTime)) throw new ActionError("The end time must be after the start time.");
  const int = (key: string, label: string, min: number, max: number) => {
    const number = data[key];
    if (typeof number !== "number" || !Number.isInteger(number) || number < min || number > max) throw new ActionError(`${label} must be a whole number from ${min} to ${max}.`);
    return number;
  };
  return {
    enabled: data.enabled,
    weekdays: [...new Set(data.weekdays as number[])].sort(),
    startTime: data.startTime,
    endTime: data.endTime,
    slotMinutes: int("slotMinutes", "Meeting length", 15, 240),
    bufferMinutes: int("bufferMinutes", "Gap between meetings", 0, 120),
    noticeHours: int("noticeHours", "Minimum notice", 0, 336),
    maxDaysAhead: int("maxDaysAhead", "Days ahead", 1, 180),
  };
}

export function availabilityFromConfig(published: unknown): AvailabilitySettings {
  const raw = published && typeof published === "object" ? (published as Record<string, unknown>).availability : undefined;
  try {
    return validateAvailability(raw);
  } catch {
    return { ...DEFAULT_AVAILABILITY };
  }
}

export type Busy = { startAt: Date; endAt: Date };

// Slots are generated in South African time (UTC+2, no daylight saving).
export function computeSlots(settings: AvailabilitySettings, busy: Busy[], now: Date, limit = 60): Date[] {
  if (!settings.enabled) return [];
  const slots: Date[] = [];
  const earliest = now.getTime() + settings.noticeHours * 3_600_000;
  const latest = now.getTime() + settings.maxDaysAhead * 86_400_000;
  const offsetMs = SAST_OFFSET_HOURS * 3_600_000;
  const localMidnightToday = Math.floor((now.getTime() + offsetMs) / 86_400_000) * 86_400_000 - offsetMs;
  const slotMs = settings.slotMinutes * 60_000;
  const gapMs = settings.bufferMinutes * 60_000;
  for (let dayIndex = 0; dayIndex <= settings.maxDaysAhead && slots.length < limit; dayIndex += 1) {
    const dayStart = localMidnightToday + dayIndex * 86_400_000;
    const weekday = new Date(dayStart + offsetMs).getUTCDay();
    if (!settings.weekdays.includes(weekday)) continue;
    const open = dayStart + minutesOf(settings.startTime) * 60_000;
    const close = dayStart + minutesOf(settings.endTime) * 60_000;
    for (let start = open; start + slotMs <= close && slots.length < limit; start += slotMs + gapMs) {
      if (start < earliest || start > latest) continue;
      const end = start + slotMs;
      const clash = busy.some((item) => item.startAt.getTime() < end + gapMs && item.endAt.getTime() > start - gapMs);
      if (!clash) slots.push(new Date(start));
    }
  }
  return slots;
}

export function formatSlot(date: Date) {
  const local = new Date(date.getTime() + SAST_OFFSET_HOURS * 3_600_000);
  return `${local.toISOString().slice(0, 10)} ${local.toISOString().slice(11, 16)}`;
}

export function minutesBetween(start: Date, end: Date) {
  return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 60_000));
}