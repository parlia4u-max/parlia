// Court runs ("duties"): rules taken from how the firm runs them in Staff Hub.
// - The person who signs a run out (the creator) is the only one who may change or remove it.
// - The person it is assigned to works through it as a checklist item and must give an update to tick it off.
// - Returning the documents to the office is stamped with who confirmed it and when.

export const COURT_RUN_DEPARTMENTS = ["Civil", "Labour", "Admin", "Accounts", "Other"] as const;
export const COURT_RUN_METHODS = ["In person", "Sheriff", "E-filing", "Courier", "Post", "Email"] as const;

export type CourtRunLike = { createdById: string; assignedToId: string; status: string; completedAt: Date | null; returnedAt: Date | null; dueAt: Date | null };
export type CourtRunState = "To do" | "Overdue" | "Done" | "Returned";

export const isDone = (run: Pick<CourtRunLike, "status" | "completedAt">) => run.status === "Completed" || run.status === "Returned" || run.completedAt !== null;

export function courtRunState(run: CourtRunLike, now = new Date()): CourtRunState {
  if (run.returnedAt) return "Returned";
  if (isDone(run)) return "Done";
  if (run.dueAt && run.dueAt.toISOString().slice(0, 10) < now.toISOString().slice(0, 10)) return "Overdue";
  return "To do";
}

/** Only the person who signed the run out may change its details or remove it, and only before it is done. */
export const canChangeCourtRun = (run: CourtRunLike, userId: string) => run.createdById === userId && !isDone(run) && !run.returnedAt;
/** Only the assigned person ticks it off or adds updates. */
export const canUpdateCourtRun = (run: CourtRunLike, userId: string) => run.assignedToId === userId && !run.returnedAt;
/** The documents can be confirmed as back by the creator, the assigned person or the firm owner. */
export const canConfirmReturn = (run: CourtRunLike, userId: string, isFirmOwner: boolean) => !run.returnedAt && (run.createdById === userId || run.assignedToId === userId || isFirmOwner);

export type CourtRunRow = { dueAt: string; matterId: string; title: string; jurisdiction: string; location: string; reason: string; department: string; method: string; assignedToId: string };

/** Cleans the rows of a "sign out court runs" batch. Empty rows are skipped; anything invalid is reported by row number. */
export function parseCourtRunRows(raw: unknown): { rows: CourtRunRow[]; errors: string[] } {
  const errors: string[] = [];
  const rows: CourtRunRow[] = [];
  if (!Array.isArray(raw)) return { rows, errors: ["The court runs could not be read. Reload the page and try again."] };
  raw.slice(0, 50).forEach((item, index) => {
    const row = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const text = (key: string, max: number) => typeof row[key] === "string" ? (row[key] as string).trim().slice(0, max) : "";
    const value: CourtRunRow = {
      dueAt: text("dueAt", 10), matterId: text("matterId", 80), title: text("title", 240), jurisdiction: text("jurisdiction", 160),
      location: text("location", 160), reason: text("reason", 500), department: text("department", 40), method: text("method", 40), assignedToId: text("assignedToId", 80),
    };
    if (!value.title && !value.assignedToId && !value.jurisdiction && !value.reason) return;
    const label = `Row ${index + 1}`;
    if (!value.title) errors.push(`${label}: say what must be done (e.g. "Issue summons").`);
    if (!value.assignedToId) errors.push(`${label}: choose who is doing it.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.dueAt) || Number.isNaN(Date.parse(`${value.dueAt}T00:00:00Z`))) errors.push(`${label}: choose a date.`);
    if (value.department && !(COURT_RUN_DEPARTMENTS as readonly string[]).includes(value.department)) errors.push(`${label}: choose a department from the list.`);
    if (!(COURT_RUN_METHODS as readonly string[]).includes(value.method)) value.method = "In person";
    rows.push(value);
  });
  if (!rows.length && !errors.length) errors.push("Fill in at least one court run.");
  return { rows, errors };
}
