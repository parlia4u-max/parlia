import { ActionError } from "./errors.ts";
import type { PermissionScope } from "./permissions.ts";

export function employeeVotePeriod(date = new Date()) {
  return date.toISOString().slice(0, 7);
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
