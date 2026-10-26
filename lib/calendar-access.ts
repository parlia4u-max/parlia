// Who may see, add to and manage a shared calendar.
// The person who creates a calendar manages it: they rename it, choose its colour
// and decide who may view or edit it. Everyone else gets the access they were given.

export type CalendarAccessLevel = "View" | "Edit";
export type CalendarRight = "Manage" | "Edit" | "View";
export type CalendarLike = {
  createdById: string;
  firmAccess: CalendarAccessLevel | null;
  shares: { userId: string; access: CalendarAccessLevel }[];
};

const rank = { View: 1, Edit: 2, Manage: 3 } as const;

export function calendarRight(calendar: CalendarLike, userId: string, isFirmOwner = false): CalendarRight | null {
  if (calendar.createdById === userId) return "Manage";
  const personal = calendar.shares.find((share) => share.userId === userId)?.access ?? null;
  const best = [personal, calendar.firmAccess].filter(Boolean).sort((a, b) => rank[b!] - rank[a!])[0] ?? null;
  // The firm owner can always see every calendar, but only edits where they were given access.
  if (!best && isFirmOwner) return "View";
  return best;
}

export const canViewCalendar = (calendar: CalendarLike, userId: string, isFirmOwner = false) => calendarRight(calendar, userId, isFirmOwner) !== null;
export const canAddToCalendar = (calendar: CalendarLike, userId: string, isFirmOwner = false) => {
  const right = calendarRight(calendar, userId, isFirmOwner);
  return right === "Edit" || right === "Manage";
};
export const canManageCalendar = (calendar: CalendarLike, userId: string) => calendar.createdById === userId;

export const CALENDAR_COLOURS = ["#B8913F", "#5B8A72", "#C0605A", "#4F7CAC", "#8A6FB0", "#D08A3C", "#3E8E8E", "#7A7A7A"] as const;

export function cleanColour(value: unknown) {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : CALENDAR_COLOURS[0];
}

/** Parses the sharing list sent by the calendar settings form: one entry per colleague. */
export function parseShares(raw: unknown, allowedUserIds: string[], creatorId: string): { userId: string; access: CalendarAccessLevel }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const shares: { userId: string; access: CalendarAccessLevel }[] = [];
  for (const item of raw.slice(0, 500)) {
    if (!item || typeof item !== "object") continue;
    const { userId, access } = item as { userId?: unknown; access?: unknown };
    if (typeof userId !== "string" || userId === creatorId || seen.has(userId) || !allowedUserIds.includes(userId)) continue;
    if (access !== "View" && access !== "Edit") continue;
    seen.add(userId);
    shares.push({ userId, access });
  }
  return shares;
}
