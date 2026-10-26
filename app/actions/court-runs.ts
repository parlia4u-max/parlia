"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord, canAccessTask } from "@/lib/matter-rules";
import { canChangeCourtRun, canConfirmReturn, canUpdateCourtRun, parseCourtRunRows } from "@/lib/court-run-rules";

const PATHS = ["/duties", "/", "/calendar", "/reports"];
const refresh = () => PATHS.forEach((path) => revalidatePath(path));

async function staff() {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !hasPermission(user, "matters")) throw new ActionError("You do not have access to court runs.");
  return user;
}
type Staff = Awaited<ReturnType<typeof staff>>;

async function reportIds(user: Staff) {
  const rows = await getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } });
  return rows.map((row) => row.userId);
}

async function checkPeopleAndMatters(user: Staff, assigneeIds: string[], matterIds: string[]) {
  const db = getDb();
  const reports = await reportIds(user);
  const [people, matters] = await Promise.all([
    db.user.findMany({ where: { firmId: user.firmId, active: true, id: { in: assigneeIds } }, select: { id: true } }),
    matterIds.length ? db.matter.findMany({ where: { firmId: user.firmId, id: { in: matterIds } }, select: { id: true, responsibleId: true } }) : Promise.resolve([]),
  ]);
  for (const id of assigneeIds) {
    if (!people.some((person) => person.id === id) || !canAccessTask({ userId: user.id, owner: user.isOwner, scope: permissionScope(user, "tasks"), assignedUserId: id, directReportIds: reports })) {
      throw new ActionError("Choose people you are allowed to give work to.");
    }
  }
  for (const id of matterIds) {
    const matter = matters.find((item) => item.id === id);
    if (!matter || !canAccessRecord({ userId: user.id, owner: user.isOwner, scope: permissionScope(user, "matters"), assignedUserId: matter.responsibleId, directReportIds: reports })) {
      throw new ActionError("Choose matters you have access to.");
    }
  }
}

/** Signs out one or more court runs at once (Staff Hub "sign documents out in batches"). */
export async function signOutCourtRuns(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await staff();
    if (!hasPermission(user, "matters", "Edit") || !hasPermission(user, "tasks", "Edit")) throw new ActionError("You need edit access to matters and tasks to sign out court runs.");
    let raw: unknown;
    try { raw = JSON.parse(String(formData.get("rows") ?? "[]")); } catch { raw = null; }
    const { rows, errors } = parseCourtRunRows(raw);
    if (errors.length) throw new ActionError(errors.join(" "));
    await checkPeopleAndMatters(user, [...new Set(rows.map((row) => row.assignedToId))], [...new Set(rows.map((row) => row.matterId).filter(Boolean))]);
    const db = getDb();
    await db.$transaction(async (tx) => {
      for (const row of rows) {
        const run = await tx.dutyRecord.create({
          data: {
            firmId: user.firmId, matterId: row.matterId || null, title: row.title, method: row.method, dueAt: new Date(`${row.dueAt}T00:00:00.000Z`),
            jurisdiction: row.jurisdiction || null, location: row.location || null, reason: row.reason || null, department: row.department || null,
            assignedToId: row.assignedToId, createdById: user.id, status: "Assigned",
          },
          select: { id: true },
        });
        if (row.matterId) {
          await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: row.matterId, actorId: user.id, action: "Court run signed out", details: { dutyId: run.id, title: row.title } } });
          await tx.matter.update({ where: { id_firmId: { id: row.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
        }
        await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "court_run.created", entityType: "court-run", entityId: run.id, details: { title: row.title, assignedToId: row.assignedToId } } });
      }
    });
    refresh();
    return `success:${rows.length} court run${rows.length === 1 ? "" : "s"} signed out.`;
  } catch (error) { return actionErrorMessage(error); }
}

async function findRun(user: Staff, id: string) {
  const run = await getDb().dutyRecord.findFirst({
    where: { id, firmId: user.firmId },
    select: { id: true, title: true, createdById: true, assignedToId: true, status: true, completedAt: true, returnedAt: true, dueAt: true, matterId: true, updateNotes: true },
  });
  if (!run) throw new ActionError("Court run not found.");
  return run;
}

/** Changes a court run's details. Only the person who signed it out may do this. */
export async function changeCourtRun(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await staff();
    const run = await findRun(user, String(formData.get("dutyId") ?? ""));
    if (!canChangeCourtRun(run, user.id)) throw new ActionError("Only the person who signed out this court run can change it, and only before it is done.");
    const { rows, errors } = parseCourtRunRows([Object.fromEntries(["dueAt", "matterId", "title", "jurisdiction", "location", "reason", "department", "method", "assignedToId"].map((key) => [key, String(formData.get(key) ?? "")]))]);
    if (errors.length) throw new ActionError(errors.join(" ").replace("Row 1: ", ""));
    const row = rows[0];
    await checkPeopleAndMatters(user, [row.assignedToId], row.matterId ? [row.matterId] : []);
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.dutyRecord.updateMany({
        where: { id: run.id, firmId: user.firmId, createdById: user.id, completedAt: null },
        data: {
          title: row.title, method: row.method, dueAt: new Date(`${row.dueAt}T00:00:00.000Z`), matterId: row.matterId || null,
          jurisdiction: row.jurisdiction || null, location: row.location || null, reason: row.reason || null, department: row.department || null, assignedToId: row.assignedToId,
        },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "court_run.changed", entityType: "court-run", entityId: run.id, details: { title: row.title, assignedToId: row.assignedToId } } });
    });
    refresh();
    return "success:Court run changed.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function removeCourtRun(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await staff();
    const run = await findRun(user, String(formData.get("dutyId") ?? ""));
    if (!canChangeCourtRun(run, user.id)) throw new ActionError("Only the person who signed out this court run can remove it, and only before it is done.");
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.attendanceEvent.updateMany({ where: { firmId: user.firmId, dutyId: run.id }, data: { dutyId: null } });
      await tx.dutyRecord.deleteMany({ where: { id: run.id, firmId: user.firmId, createdById: user.id } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "court_run.removed", entityType: "court-run", entityId: run.id, details: { title: run.title } } });
    });
    refresh();
    return "success:Court run removed.";
  } catch (error) { return actionErrorMessage(error); }
}

/** The assigned person's checklist: an update is always required; ticking "done" needs one too. */
export async function updateCourtRun(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await staff();
    const run = await findRun(user, String(formData.get("dutyId") ?? ""));
    if (!canUpdateCourtRun(run, user.id)) throw new ActionError("Only the person this court run is assigned to can update it.");
    const update = String(formData.get("update") ?? "").trim();
    if (!update) throw new ActionError("Write a short update – what happened at court or the sheriff.");
    if (update.length > 1000) throw new ActionError("Keep the update under 1000 characters.");
    const done = formData.get("intent") === "done";
    const stamp = new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(new Date());
    const notes = run.updateNotes ? `${run.updateNotes}\n${stamp}: ${update}` : `${stamp}: ${update}`;
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.dutyRecord.updateMany({
        where: { id: run.id, firmId: user.firmId, assignedToId: user.id },
        data: { updateNotes: notes.slice(-4000), returnNotes: update, ...(done ? { status: "Completed", completedAt: new Date() } : {}) },
      });
      if (run.matterId) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: run.matterId, actorId: user.id, action: done ? "Court run done" : "Court run update", details: { dutyId: run.id, update } } });
        await tx.matter.update({ where: { id_firmId: { id: run.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: done ? "court_run.completed" : "court_run.updated", entityType: "court-run", entityId: run.id, details: { title: run.title, update } } });
    });
    refresh();
    return done ? "success:Ticked off. Well done." : "success:Update saved.";
  } catch (error) { return actionErrorMessage(error); }
}

/** Confirms the documents are back at the office – stamped with who and when, like Staff Hub. */
export async function confirmCourtRunReturned(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await staff();
    const run = await findRun(user, String(formData.get("dutyId") ?? ""));
    if (!canConfirmReturn(run, user.id, user.isOwner)) throw new ActionError("This court run was already confirmed as returned, or it is not yours to confirm.");
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.dutyRecord.updateMany({ where: { id: run.id, firmId: user.firmId, returnedAt: null }, data: { returnedAt: new Date(), returnedById: user.id } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "court_run.returned", entityType: "court-run", entityId: run.id, details: { title: run.title } } });
    });
    refresh();
    return "success:Documents confirmed as returned.";
  } catch (error) { return actionErrorMessage(error); }
}
