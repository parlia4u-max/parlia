"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord, canAccessTask } from "@/lib/matter-rules";
import { taskCategoriesFromConfig } from "@/lib/matter-config";
import { DUTY_METHODS, isDutyMethod, tracingPolicy } from "@/lib/module-e-rules";
import type { Prisma } from "@prisma/client";

const E_PATHS = ["/service-tracing", "/duties", "/physical-files", "/matters", "/tasks", "/calendar"];

async function authorizedEUser(level: "View" | "Edit" = "View") {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } }, firm: { select: { name: true } } },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  if (!hasPermission(user, "matters", level)) throw new ActionError(`You do not have ${level.toLowerCase()} access to matters.`);
  return user;
}

async function reportIds(userId: string, firmId: string) {
  const rows = await getDb().supervisorLink.findMany({
    where: { firmId, supervisorId: userId, user: { firmId, active: true } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

function canReadMatter(user: Awaited<ReturnType<typeof authorizedEUser>>, responsibleId: string, reports: string[]) {
  return canAccessRecord({
    userId: user.id,
    owner: user.isOwner,
    scope: permissionScope(user, "matters"),
    assignedUserId: responsibleId,
    directReportIds: reports,
  });
}

async function requireMatter(user: Awaited<ReturnType<typeof authorizedEUser>>, matterId: string) {
  const matter = await getDb().matter.findFirst({
    where: { id: matterId, firmId: user.firmId },
    select: { id: true, responsibleId: true, stage: true, matterNumber: true },
  });
  if (!matter || !canReadMatter(user, matter.responsibleId, await reportIds(user.id, user.firmId))) {
    throw new ActionError("Matter not found or outside your permitted matter scope.");
  }
  return matter;
}

async function requireTaskAssignee(user: Awaited<ReturnType<typeof authorizedEUser>>, id: string) {
  if (!hasPermission(user, "tasks", "Edit")) throw new ActionError("Task edit permission is required to assign this work.");
  const reports = await reportIds(user.id, user.firmId);
  const candidate = await getDb().user.findFirst({
    where: { id, firmId: user.firmId, active: true },
    select: { id: true },
  });
  if (!candidate || !canAccessTask({
    userId: user.id,
    owner: user.isOwner,
    scope: permissionScope(user, "tasks"),
    assignedUserId: candidate.id,
    directReportIds: reports,
  })) throw new ActionError("Choose an active assignee within your permitted task scope.");
  return candidate.id;
}

function requiredText(formData: FormData, key: string, label: string, max = 240) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

function optionalText(formData: FormData, key: string, label: string, max = 1000) {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new ActionError(`${label} must be ${max} characters or fewer.`);
  return value.trim() || null;
}

function optionalDate(formData: FormData, key: string, label: string) {
  const value = formData.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ActionError(`${label} must be a valid date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new ActionError(`${label} must be a valid date.`);
  return date;
}

async function activeSetup(tx: Prisma.TransactionClient, firmId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${firmId} FOR SHARE`;
  const row = await tx.setupConfiguration.findFirst({ where: { firmId }, select: { published: true, publishedAt: true } });
  if (!row?.publishedAt) throw new ActionError("The firm must publish Setup Centre settings before using this feature.");
  return row.published as Record<string, unknown>;
}

function configuredFilingValues(published: Record<string, unknown>) {
  const structure = published.filingStructure as { locations?: { name?: string }[]; folders?: string[] } | undefined;
  const locations = (structure?.locations ?? []).map((entry) => entry.name).filter((name): name is string => typeof name === "string");
  const folders = (structure?.folders ?? []).filter((folder): folder is string => typeof folder === "string");
  return { locations, folders };
}

export async function createServiceRecord(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const matter = await requireMatter(user, requiredText(formData, "matterId", "Matter", 80));
    const recipient = requiredText(formData, "recipient", "Recipient", 240);
    const serviceType = requiredText(formData, "serviceType", "Service type", 120);
    const details = optionalText(formData, "details", "Details");
    const serviceDate = optionalDate(formData, "serviceDate", "Service date");
    const db = getDb();
    await db.$transaction(async (tx) => {
      await activeSetup(tx, user.firmId);
      const record = await tx.serviceRecord.create({
        data: { firmId: user.firmId, matterId: matter.id, recipient, serviceType, details, serviceDate, createdById: user.id },
      });
      await tx.matterActivity.create({
        data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Service recorded", details: { serviceId: record.id, recipient, serviceType } },
      });
      await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "service.created", entityType: "service", entityId: record.id } });
    });
    revalidate();
    return "success:Service record added.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function updateServiceOutcome(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const serviceId = requiredText(formData, "serviceId", "Service record", 80);
    const status = requiredText(formData, "status", "Outcome status", 40);
    if (!["Pending", "Needs tracing", "Served", "Closed"].includes(status)) throw new ActionError("Choose a valid service status.");
    const outcome = optionalText(formData, "outcome", "Outcome", 500);
    const serviceDate = optionalDate(formData, "serviceDate", "Service date");
    const db = getDb();
    const service = await db.serviceRecord.findFirst({ where: { id: serviceId, firmId: user.firmId }, select: { id: true, matterId: true } });
    if (!service) throw new ActionError("Service record not found in this firm.");
    await requireMatter(user, service.matterId);
    await db.$transaction(async (tx) => {
      const updated = await tx.serviceRecord.updateMany({
        where: { id: service.id, firmId: user.firmId },
        data: { status, outcome, serviceDate },
      });
      if (updated.count !== 1) throw new ActionError("Service record changed. Reload and try again.");
      await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: service.matterId, actorId: user.id, action: "Service outcome updated", details: { serviceId, status, outcome } } });
      await tx.matter.update({ where: { id_firmId: { id: service.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "service.outcome_updated", entityType: "service", entityId: serviceId, details: { status } } });
    });
    revalidate();
    return "success:Service outcome saved.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function addServiceTrace(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const serviceId = requiredText(formData, "serviceId", "Service record", 80);
    const note = requiredText(formData, "note", "Tracing note", 1000);
    const db = getDb();
    const service = await db.serviceRecord.findFirst({ where: { id: serviceId, firmId: user.firmId }, select: { id: true, matterId: true } });
    if (!service) throw new ActionError("Service record not found in this firm.");
    await requireMatter(user, service.matterId);
    await db.$transaction(async (tx) => {
      const published = await activeSetup(tx, user.firmId);
      const rules = published.followUpRules as { tracingAfterDays?: number; maxTracingAttempts?: number } | undefined;
      const waitDays = rules?.tracingAfterDays;
      const maxAttempts = rules?.maxTracingAttempts;
      if (!Number.isInteger(waitDays) || Number(waitDays) < 0 || !Number.isInteger(maxAttempts) || Number(maxAttempts) < 0) {
        throw new ActionError("Configure valid tracing wait and maximum attempts in Setup Centre before tracing.");
      }
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ServiceRecord" WHERE "id" = ${service.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const record = await tx.serviceRecord.findFirst({
        where: { id: service.id, firmId: user.firmId },
        select: { id: true, status: true, serviceDate: true, createdAt: true, traces: { orderBy: { attempt: "desc" }, take: 1, select: { attempt: true, attemptedAt: true } } },
      });
      if (!record || record.status !== "Needs tracing") throw new ActionError("Only a service marked “Needs tracing” can be retraced.");
      const attemptCount = record.traces[0]?.attempt ?? 0;
      const policy = tracingPolicy({
        attemptCount,
        maxAttempts: Number(maxAttempts),
        waitDays: Number(waitDays),
        lastAttemptAt: record.traces[0]?.attemptedAt ?? null,
        startedAt: record.serviceDate ?? record.createdAt,
      });
      if (!policy.allowed) {
        if (policy.reason === "maximum-attempts") throw new ActionError("The configured maximum tracing attempts has been reached.");
        throw new ActionError(`The next tracing attempt is available on ${policy.nextAllowedAt?.toLocaleDateString()}.`);
      }
      await tx.serviceTrace.create({ data: { firmId: user.firmId, serviceId: record.id, attempt: attemptCount + 1, note, createdById: user.id } });
      await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: service.matterId, actorId: user.id, action: "Service tracing attempt", details: { serviceId, attempt: attemptCount + 1, note } } });
      await tx.matter.update({ where: { id_firmId: { id: service.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "service.traced", entityType: "service", entityId: serviceId, details: { attempt: attemptCount + 1 } } });
    });
    revalidate();
    return "success:Tracing attempt recorded.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function createDuty(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const title = requiredText(formData, "title", "Duty", 240);
    const method = requiredText(formData, "method", "Method", 40);
    if (!isDutyMethod(method)) throw new ActionError(`Choose one of: ${DUTY_METHODS.join(", ")}.`);
    const matterId = optionalText(formData, "matterId", "Matter", 80);
    const matter = matterId ? await requireMatter(user, matterId) : null;
    const assignedToId = await requireTaskAssignee(user, requiredText(formData, "assignedToId", "Assignee", 80));
    const dueAt = optionalDate(formData, "dueAt", "Due date");
    const db = getDb();
    await db.$transaction(async (tx) => {
      const duty = await tx.dutyRecord.create({
        data: { firmId: user.firmId, matterId: matter?.id ?? null, title, method, dueAt, assignedToId, createdById: user.id },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "duty.created", entityType: "duty", entityId: duty.id, details: { method, matterId: matter?.id ?? null } } });
    });
    revalidate();
    return "success:Duty created.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function returnDuty(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    if (!hasPermission(user, "tasks", "Edit")) throw new ActionError("Task edit permission is required to return a duty and create its update tasks.");
    const dutyId = requiredText(formData, "dutyId", "Duty", 80);
    const internalAssigneeId = await requireTaskAssignee(user, requiredText(formData, "internalAssigneeId", "Internal update assignee", 80));
    const externalAssigneeId = await requireTaskAssignee(user, requiredText(formData, "externalAssigneeId", "External update assignee", 80));
    const returnNotes = optionalText(formData, "returnNotes", "Return notes", 1000);
    const internalDueAt = optionalDate(formData, "internalDueAt", "Internal update due date");
    const externalDueAt = optionalDate(formData, "externalDueAt", "External update due date");
    const db = getDb();
    const duty = await db.dutyRecord.findFirst({ where: { id: dutyId, firmId: user.firmId }, select: { id: true, matterId: true, title: true, method: true, assignedToId: true, status: true } });
    if (!duty) throw new ActionError("Duty not found in this firm.");
    if (duty.matterId) await requireMatter(user, duty.matterId);
    else if (!canAccessTask({ userId: user.id, owner: user.isOwner, scope: permissionScope(user, "tasks"), assignedUserId: duty.assignedToId, directReportIds: await reportIds(user.id, user.firmId) })) {
      throw new ActionError("This duty is outside your permitted assignment scope.");
    }
    await db.$transaction(async (tx) => {
      const changed = await tx.dutyRecord.updateMany({
        where: { id: duty.id, firmId: user.firmId, status: "Scheduled" },
        data: { status: "Returned", returnedAt: new Date(), returnNotes },
      });
      if (changed.count !== 1) throw new ActionError("This duty was already returned. Reload the page.");
      const published = await activeSetup(tx, user.firmId);
      const categories = taskCategoriesFromConfig(published);
      if (!categories.includes("Updates internal") || !categories.includes("Updates external")) {
        throw new ActionError("The firm must activate both Updates internal and Updates external task categories before recording a duty return.");
      }
      const tasks = [
        { category: "Updates internal", title: `Internal update: ${duty.title}`, assignedToId: internalAssigneeId, dueAt: internalDueAt },
        { category: "Updates external", title: `External update: ${duty.title}`, assignedToId: externalAssigneeId, dueAt: externalDueAt },
      ];
      for (const task of tasks) {
        await tx.task.create({
          data: { firmId: user.firmId, matterId: duty.matterId, title: task.title, category: task.category, assignedToId: task.assignedToId, createdById: user.id, dueAt: task.dueAt },
        });
      }
      if (duty.matterId) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: duty.matterId, actorId: user.id, action: "Duty return recorded", details: { dutyId, method: duty.method, returnNotes } } });
        await tx.matter.update({ where: { id_firmId: { id: duty.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "duty.returned", entityType: "duty", entityId: duty.id, details: { method: duty.method, returnNotes, taskCategories: ["Updates internal", "Updates external"] } } });
    });
    revalidate();
    return "success:Duty return recorded and both update tasks created.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function createPhysicalFile(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const matter = await requireMatter(user, requiredText(formData, "matterId", "Matter", 80));
    const location = requiredText(formData, "location", "Storage location", 120);
    const folder = requiredText(formData, "folder", "Folder", 120);
    const db = getDb();
    await db.$transaction(async (tx) => {
      const published = await activeSetup(tx, user.firmId);
      const choices = configuredFilingValues(published);
      if (!choices.locations.includes(location) || !choices.folders.includes(folder)) throw new ActionError("Choose a location and folder from the firm’s published filing structure.");
      if (await tx.physicalFile.findFirst({ where: { firmId: user.firmId, matterId: matter.id }, select: { id: true } })) {
        throw new ActionError("A physical file is already registered for this matter.");
      }
      try {
        await tx.physicalFile.create({ data: { firmId: user.firmId, matterId: matter.id, location, folder } });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
          throw new ActionError("A physical file is already registered for this matter.");
        }
        throw error;
      }
      await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Physical file location recorded", details: { location, folder } } });
      await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "physical_file.created", entityType: "physical_file", entityId: matter.id, details: { location, folder } } });
    });
    revalidate();
    return "success:Physical file record created.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function updatePhysicalFile(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedEUser("Edit");
    const fileId = requiredText(formData, "fileId", "Physical file", 80);
    const statusValue = requiredText(formData, "status", "File status", 30);
    const status = statusValue as "InStorage" | "OutOfStorage" | "Closed";
    if (!["InStorage", "OutOfStorage", "Closed"].includes(status)) throw new ActionError("Choose a valid file status.");
    const borrowerId = status === "OutOfStorage" ? requiredText(formData, "borrowerId", "Borrower", 80) : null;
    const boxNumber = optionalText(formData, "boxNumber", "Box number", 120);
    const dateSent = optionalDate(formData, "dateSent", "Date sent");
    const storageCompany = optionalText(formData, "storageCompany", "Storage company", 240);
    const barcodeReference = optionalText(formData, "barcodeReference", "Barcode or reference", 160);
    if (status === "Closed" && (!boxNumber || !dateSent || !storageCompany || !barcodeReference)) {
      throw new ActionError("Closed files require a box number, date sent, storage company, and barcode or reference.");
    }
    const db = getDb();
    const file = await db.physicalFile.findFirst({ where: { id: fileId, firmId: user.firmId }, select: { id: true, matterId: true, status: true } });
    if (!file) throw new ActionError("Physical file not found in this firm.");
    const matter = await requireMatter(user, file.matterId);
    if (borrowerId) {
      const reports = permissionScope(user, "matters") === "Team" ? await reportIds(user.id, user.firmId) : [];
      const borrower = await db.user.findFirst({ where: { id: borrowerId, firmId: user.firmId, active: true }, select: { id: true } });
      if (!borrower || !canReadMatter(user, borrower.id, reports)) throw new ActionError("Choose an active borrower within your permitted matter scope.");
    }
    await db.$transaction(async (tx) => {
      const update = await tx.physicalFile.updateMany({
        where: {
          id: file.id, firmId: user.firmId, status: file.status,
        },
        data: {
          status,
          borrowerId,
          checkedOutAt: status === "OutOfStorage" ? new Date() : null,
          boxNumber,
          dateSent,
          storageCompany,
          barcodeReference,
        },
      });
      if (update.count !== 1) throw new ActionError("The physical file status changed or it is already checked out. Reload before trying again.");
      await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: status === "OutOfStorage" ? "Physical file checked out" : status === "InStorage" ? "Physical file checked in" : "Physical file sent to closed storage", details: { status, borrowerId, boxNumber, dateSent: dateSent?.toISOString() ?? null, storageCompany, barcodeReference } } });
      await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: `physical_file.${status.toLowerCase()}`, entityType: "physical_file", entityId: file.id } });
    });
    revalidate();
    return "success:Physical file status updated.";
  } catch (error) { return actionErrorMessage(error); }
}

function revalidate() {
  for (const path of E_PATHS) revalidatePath(path);
}
