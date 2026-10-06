import { ActionError } from "./errors.ts";
import type { PermissionScope } from "./permissions.ts";

export function employeeVotePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

export function employeeVoteDeadline(period: string, dueDay: number, dueTime: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match || !Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) {
    throw new Error("Invalid monthly employee vote deadline settings.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("Invalid monthly employee vote period.");
  const [hour, minute] = dueTime.split(":").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(dueDay, lastDay), hour, minute));
}

export function parseMeetingActionItems(value: string | null) {
  const titles = (value ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (titles.length > 20 || titles.some((title) => title.length > 240)) {
    throw new ActionError("Enter up to 20 action items, each no longer than 240 characters.");
  }
  return titles;
}

export function meetingVisibleInPeopleScope(input: {
  scope: PermissionScope;
  userId: string;
  directReportIds: string[];
  createdById: string;
  participantIds: string[];
}) {
  if (input.scope === "Firm") return true;
  const visibleUserIds = new Set([input.userId, ...(input.scope === "Team" ? input.directReportIds : [])]);
  return visibleUserIds.has(input.createdById) || input.participantIds.some((id) => visibleUserIds.has(id));
}
