export type LeavePolicy = {
  annualLeaveDays: number;
  sickLeaveDaysPerCycle: number;
  cycleMonths: number;
  carryOverDays: number;
  studyLeaveDays: number | null;
  familyResponsibilityDays: number | null;
};

export type LeaveKind = "Annual" | "Sick" | "Study" | "FamilyResponsibility";

export function configuredLeaveAllowance(type: LeaveKind, rules: Partial<LeavePolicy>) {
  if (type === "Annual") return rules.annualLeaveDays ?? 0;
  if (type === "Sick") return rules.sickLeaveDaysPerCycle ?? 0;
  if (type === "Study") return rules.studyLeaveDays ?? null;
  return rules.familyResponsibilityDays ?? null;
}

export function leaveDaysBetween(start: Date, end: Date, holidayDates: Set<string>) {
  let days = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
  while (cursor.getTime() <= last) {
    const day = cursor.getUTCDay();
    const key = cursor.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !holidayDates.has(key)) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function leaveCycleStart(employedAt: Date, now: Date, cycleMonths: number) {
  const cycle = Math.max(1, cycleMonths);
  const anchor = new Date(Date.UTC(employedAt.getUTCFullYear(), employedAt.getUTCMonth(), employedAt.getUTCDate()));
  const monthDifference = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + now.getUTCMonth() - anchor.getUTCMonth();
  let periods = Math.max(0, Math.floor(monthDifference / cycle));
  let start = addMonths(anchor, periods * cycle);
  if (start.getTime() > now.getTime() && periods > 0) {
    periods -= 1;
    start = addMonths(anchor, periods * cycle);
  }
  return start;
}

export function leaveBalance({
  type,
  rules,
  employedAt,
  requests,
  today,
}: {
  type: LeaveKind;
  rules: Partial<LeavePolicy>;
  employedAt: Date;
  requests: { type: LeaveKind; requestedDays: number; startDate: Date; status: string }[];
  today: Date;
}) {
  const configured = configuredLeaveAllowance(type, rules);
  if (configured === null) return { configured: false, allowance: null, used: 0, balance: null };
  const cycleMonths = Math.max(1, rules.cycleMonths ?? 12);
  const cycleStart = leaveCycleStart(employedAt, today, cycleMonths);
  const cycleEnd = addMonths(cycleStart, cycleMonths);
  const approvedOrPending = requests.filter((request) => request.type === type && (request.status === "Approved" || request.status === "Pending"));
  const used = approvedOrPending
    .filter((request) => request.startDate >= cycleStart && request.startDate < cycleEnd)
    .reduce((sum, request) => sum + request.requestedDays, 0);
  let carry = 0;
  if (type === "Annual" && rules.carryOverDays) {
    const previousStart = addMonths(cycleStart, -cycleMonths);
    const previousUsed = approvedOrPending
      .filter((request) => request.startDate >= previousStart && request.startDate < cycleStart)
      .reduce((sum, request) => sum + request.requestedDays, 0);
    carry = Math.min(rules.carryOverDays, Math.max(0, configured - previousUsed));
  }
  const allowance = configured + carry;
  return { configured: true, allowance, used, balance: Math.max(0, allowance - used) };
}
