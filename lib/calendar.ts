export type CalendarView = "day" | "three-day" | "week" | "month" | "agenda";
export type CalendarVisibility = "Own" | "Team" | "Firm";

export function effectiveCalendarVisibility(
  permissionScope: CalendarVisibility,
  configuredVisibility: CalendarVisibility,
  isOwner: boolean,
): CalendarVisibility {
  if (isOwner) return "Firm";
  const rank: Record<CalendarVisibility, number> = { Own: 0, Team: 1, Firm: 2 };
  return rank[permissionScope] <= rank[configuredVisibility] ? permissionScope : configuredVisibility;
}

export function parseCalendarDate(value?: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return startOfUtcDay(new Date());
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return startOfUtcDay(new Date());
  }
  return date;
}

export function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addCalendarDays(date: Date, days: number) {
  const result = startOfUtcDay(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function calendarRange(date: Date, view: CalendarView) {
  const day = startOfUtcDay(date);
  if (view === "day" || view === "agenda") return { start: day, end: addCalendarDays(day, view === "day" ? 1 : 31) };
  if (view === "three-day") return { start: day, end: addCalendarDays(day, 3) };
  if (view === "week") {
    const start = addCalendarDays(day, -((day.getUTCDay() + 6) % 7));
    return { start, end: addCalendarDays(start, 7) };
  }
  const first = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const start = addCalendarDays(first, -((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
  const end = addCalendarDays(last, 1 + ((7 - ((last.getUTCDay() + 6) % 7) - 1) % 7));
  return { start, end };
}

export function validCalendarView(value?: string | null): CalendarView {
  return value === "day" || value === "three-day" || value === "week" || value === "month" || value === "agenda"
    ? value
    : "month";
}

export function dateKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
