"use server";

import { createPortalInvitation } from "@/lib/portal-invites";
import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { matterTypesFromConfig, taskCategoriesFromConfig, addCalendarDays } from "@/lib/matter-config";
import { canAccessRecord, canAccessTask, parseMatterCsv, type CsvMatterRow } from "@/lib/matter-rules";
import { TASK_CATEGORIES } from "@/lib/setup-config";

const MODULE_PATHS = ["/", "/matters", "/matters/board", "/tasks"];
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;

async function authorizedUser(module: "matters" | "tasks", level: "View" | "Edit" = "View") {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  if (!hasPermission(user, module, level)) throw new ActionError(`You do not have ${level.toLowerCase()} access to ${module}.`);
  return user;
}

async function directReports(userId: string, firmId: string) {
  const rows = await getDb().supervisorLink.findMany({
    where: { firmId, supervisorId: userId, user: { firmId, active: true } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

function recordIsAccessible(user: Awaited<ReturnType<typeof authorizedUser>>, module: "matters" | "tasks", ownerId: string, reports: string[]) {
  return canAccessRecord({
    userId: user.id,
    owner: user.isOwner,
    scope: permissionScope(user, module),
    assignedUserId: ownerId,
    directReportIds: reports,
  });
}

async function getMatterForUser(user: Awaited<ReturnType<typeof authorizedUser>>, matterId: string, level: "View" | "Edit" = "View") {
  const db = getDb();
  if (!hasPermission(user, "matters", "View")) throw new ActionError("You do not have view access to matters.");
  const matterUser = level === "Edit" ? await authorizedUser("matters", "Edit") : user;
  const matter = await db.matter.findFirst({
    where: { id: matterId, firmId: matterUser.firmId },
    select: { id: true, firmId: true, responsibleId: true, matterType: true, stage: true, stageKind: true, status: true },
  });
  if (!matter) throw new ActionError("Matter not found in this firm.");
  const reports = permissionScope(matterUser, "matters") === "Team" ? await directReports(matterUser.id, matterUser.firmId) : [];
  if (!recordIsAccessible(matterUser, "matters", matter.responsibleId, reports)) throw new ActionError("You do not have access to this matter.");
  return matter;
}

async function getTaskForUser(user: Awaited<ReturnType<typeof authorizedUser>>, taskId: string, level: "View" | "Edit" = "View") {
  const task = await getDb().task.findFirst({
    where: { id: taskId, firmId: user.firmId },
    select: { id: true, firmId: true, matterId: true, assignedToId: true, status: true, dueAt: true, title: true },
  });
  if (!task) throw new ActionError("Task not found in this firm.");
  const reports = await directReports(user.id, user.firmId);
  if (!canAccessTask({
    userId: user.id,
    owner: user.isOwner,
    scope: permissionScope(user, "tasks"),
    assignedUserId: task.assignedToId,
    directReportIds: reports,
  })) {
    throw new ActionError("You can only access tasks assigned to you or to your direct reports.");
  }
  if (level === "Edit" && !hasPermission(user, "tasks", "Edit")) throw new ActionError("You do not have edit access to tasks.");
  return task;
}

async function lockActiveSetup(tx: Prisma.TransactionClient, firmId: string) {
  await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${firmId} FOR SHARE`;
  const config = await tx.setupConfiguration.findFirst({
    where: { firmId },
    select: { published: true, publishedAt: true },
  });
  if (!config?.publishedAt) throw new ActionError("The firm has not published its Setup Centre configuration yet.");
  return config.published;
}

function followUpDaysFromConfig(published: unknown) {
  const rules = published && typeof published === "object" ? (published as Record<string, unknown>).followUpRules : undefined;
  const days = rules && typeof rules === "object" ? (rules as Record<string, unknown>).followUpAfterDays : undefined;
  if (!Number.isInteger(days) || Number(days) < 0 || Number(days) > 3650) throw new ActionError("Configure the follow-up interval in Setup Centre before using a waiting stage.");
  return Number(days);
}

function requireText(value: FormDataEntryValue | null, label: string, maxLength: number) {
  if (typeof value !== "string") throw new ActionError(`${label} is required.`);
  const text = value.trim();
  if (!text || text.length > maxLength) throw new ActionError(`${label} is required and must be ${maxLength} characters or fewer.`);
  return text;
}

function optionalText(value: FormDataEntryValue | null, label: string, maxLength: number) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > maxLength) throw new ActionError(`${label} must be ${maxLength} characters or fewer.`);
  return value.trim() || null;
}

function optionalDate(value: FormDataEntryValue | null, label: string) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ActionError(`${label} must be a valid date.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ActionError(`${label} must be a valid date.`);
  return parsed;
}

async function ensureAssignee(user: Awaited<ReturnType<typeof authorizedUser>>, assigneeId: string, module: "matters" | "tasks") {
  const scope = permissionScope(user, module);
  const reports = module === "tasks" || scope === "Team" ? await directReports(user.id, user.firmId) : [];
  const candidate = await getDb().user.findFirst({
    where: { id: assigneeId, firmId: user.firmId, active: true },
    select: { id: true },
  });
  const permitted = module === "tasks"
    ? Boolean(candidate && canAccessTask({
        userId: user.id,
        owner: user.isOwner,
        scope,
        assignedUserId: candidate.id,
        directReportIds: reports,
      }))
    : Boolean(candidate && recordIsAccessible(user, module, candidate.id, reports));
  if (!candidate || !permitted) {
    throw new ActionError("Choose an active person within your permitted assignment scope.");
  }
  return candidate.id;
}

export async function createMatter(_state: string | null, formData: FormData): Promise<string | null> {
  let createdMatterId = "";
  try {
    const user = await authorizedUser("matters", "Edit");
    const matterNumber = requireText(formData.get("matterNumber"), "Matter number", 80);
    const clientName = requireText(formData.get("clientName"), "Client name", 120);
    const clientSurname = requireText(formData.get("clientSurname"), "Client surname", 120);
    const clientEmail = optionalText(formData.get("clientEmail"), "Client email", 254);
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) throw new ActionError("Enter a valid client email address.");
    const matterType = requireText(formData.get("matterType"), "Matter type", 120);
    const stageName = requireText(formData.get("stage"), "Stage", 120);
    const responsibleId = await ensureAssignee(user, requireText(formData.get("responsibleId"), "Responsible person", 80), "matters");
    const statusText = String(formData.get("status") ?? "Active");
    if (!["Active", "OnHold", "Closed"].includes(statusText)) throw new ActionError("Choose an available matter status.");
    const selectedOnHoldReason = optionalText(formData.get("onHoldReason"), "On-hold reason", 500);
    const selectedReviewDate = optionalDate(formData.get("reviewDate"), "Review date");
    const db = getDb();
    const matter = await db.$transaction(async (tx) => {
      const published = await lockActiveSetup(tx, user.firmId);
      const configuredType = matterTypesFromConfig(published).find((type) => type.name === matterType);
      const stage = configuredType?.stages.find((item) => item.name === stageName);
      if (!stage) throw new ActionError("Choose a matter type and stage from the currently published firm setup.");
      const followUpDays = stage.kind === "W" ? followUpDaysFromConfig(published) : null;
      const status = stage.kind === "C" || stage.kind === "X" ? "Closed" : statusText as "Active" | "OnHold" | "Closed";
      const onHoldReason = status === "OnHold" ? requireText(selectedOnHoldReason, "On-hold reason", 500) : null;
      const reviewDate = status === "OnHold" ? selectedReviewDate : null;
      if (status === "OnHold" && !reviewDate) throw new ActionError("A review date is required while a matter is on hold.");
      const created = await tx.matter.create({
        data: {
          firmId: user.firmId,
          matterNumber,
          clientName,
          clientSurname,
          clientEmail,
          matterType,
          stage: stage.name,
          stageKind: stage.kind,
          responsibleId,
          createdById: user.id,
          clientNumber: optionalText(formData.get("clientNumber"), "Client number", 120),
          otherReferences: optionalText(formData.get("otherReferences"), "Other references", 500),
          caseNumber: optionalText(formData.get("caseNumber"), "Case number", 120),
          status,
          onHoldReason,
          reviewDate,
        },
        select: { id: true },
      });
      await tx.matterActivity.create({
        data: { firmId: user.firmId, matterId: created.id, actorId: user.id, action: "Matter opened", details: { stage: stage.name } },
      });
      if (stage.tasks.length) {
        await tx.task.createMany({
          data: stage.tasks.map((configuredTask) => ({
            firmId: user.firmId,
            matterId: created.id,
            title: configuredTask.title,
            category: configuredTask.category,
            stage: stage.name,
            assignedToId: responsibleId,
            createdById: user.id,
            dueAt: configuredTask.dueInDays === undefined ? null : addCalendarDays(new Date(), configuredTask.dueInDays),
          })),
        });
      }
      if (stage.kind === "W") {
        await tx.task.create({
          data: {
            firmId: user.firmId,
            matterId: created.id,
            title: `Follow up: ${stage.name}`,
            category: "Follow up",
            stage: stage.name,
            assignedToId: responsibleId,
            createdById: user.id,
            dueAt: addCalendarDays(new Date(), followUpDays!),
          },
        });
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.created", entityType: "matter", entityId: created.id },
      });
      return created;
    });
    createdMatterId = matter.id;
    revalidateAll();
    if (formData.get("sendPortalInvitation") === "on" && clientEmail) {
      try {
        const invitation = await createPortalInvitation(db, { firmId: user.firmId, matterId: matter.id, senderId: user.id, email: clientEmail.toLowerCase(), name: `${clientName} ${clientSurname}`.trim(), replacePending: true });
        await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "client_portal.invitation_sent", entityType: "client-portal-invitation", entityId: invitation?.id, details: { matterId: matter.id, viaNewMatter: true } } });
      } catch {
        await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "client_portal.invitation_failed", entityType: "matter", entityId: matter.id } });
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return "A matter with that number already exists in this firm.";
    }
    return actionErrorMessage(error);
  }
  if (createdMatterId) redirect(`/matters/${createdMatterId}`);
  return "Matter was not created.";
}

export async function changeMatterStage(_state: string | null, formData: FormData): Promise<string | null> {
  let matterId = "";
  try {
    const user = await authorizedUser("matters", "Edit");
    matterId = requireText(formData.get("matterId"), "Matter", 80);
    const matter = await getMatterForUser(user, matterId, "Edit");
    const newStageName = requireText(formData.get("stage"), "Stage", 120);
    const db = getDb();
    let unchanged = false;
    await db.$transaction(async (tx) => {
      const published = await lockActiveSetup(tx, user.firmId);
      const type = matterTypesFromConfig(published).find((item) => item.name === matter.matterType);
      const stage = type?.stages.find((item) => item.name === newStageName);
      if (!stage) throw new ActionError("Choose a stage configured for this matter type.");
      const followUpDays = stage.kind === "W" ? followUpDaysFromConfig(published) : null;
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Matter" WHERE "id" = ${matter.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const currentMatter = await tx.matter.findFirst({
        where: { id: matter.id, firmId: user.firmId },
        select: { stage: true, status: true, responsibleId: true },
      });
      if (!currentMatter || currentMatter.stage !== matter.stage) throw new ActionError("This matter’s stage changed. Reload the page and try again.");
      if (stage.name === currentMatter.stage) {
        unchanged = true;
        return;
      }
      const now = new Date();
      await tx.matter.update({
        where: { id_firmId: { id: matter.id, firmId: user.firmId } },
        data: {
          stage: stage.name,
          stageKind: stage.kind,
          status: stage.kind === "C" || stage.kind === "X" ? "Closed" : currentMatter.status === "Closed" ? "Active" : currentMatter.status,
          onHoldReason: stage.kind === "C" || stage.kind === "X" ? null : undefined,
          reviewDate: stage.kind === "C" || stage.kind === "X" ? null : undefined,
          lastActivityAt: now,
        },
      });
      const taskData = stage.tasks.map((configuredTask) => ({
        firmId: user.firmId,
        matterId: matter.id,
        title: configuredTask.title,
        category: configuredTask.category,
        stage: stage.name,
        assignedToId: currentMatter.responsibleId,
        createdById: user.id,
        dueAt: configuredTask.dueInDays === undefined ? null : addCalendarDays(now, configuredTask.dueInDays),
      }));
      if (taskData.length) await tx.task.createMany({ data: taskData });
      if (stage.kind === "W") {
        await tx.task.create({
          data: {
            firmId: user.firmId,
            matterId: matter.id,
            title: `Follow up: ${stage.name}`,
            category: "Follow up",
            stage: stage.name,
            assignedToId: currentMatter.responsibleId,
            createdById: user.id,
            dueAt: addCalendarDays(now, followUpDays!),
          },
        });
        if (unchanged) return "success:This matter is already in that stage.";
      }
      await tx.matterActivity.create({
        data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Stage changed", details: { from: matter.stage, to: stage.name, kind: stage.kind } },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.stage_changed", entityType: "matter", entityId: matter.id, details: { from: matter.stage, to: stage.name } },
      });
    });
    revalidateAll();
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/matters/${matterId}`);
}

export async function updateMatterStatus(_state: string | null, formData: FormData): Promise<string | null> {
  let matterId = "";
  try {
    const user = await authorizedUser("matters", "Edit");
    matterId = requireText(formData.get("matterId"), "Matter", 80);
    const matter = await getMatterForUser(user, matterId, "Edit");
    const statusText = requireText(formData.get("status"), "Matter status", 20);
    if (!["Active", "OnHold", "Closed"].includes(statusText)) throw new ActionError("Choose an available matter status.");
    const status = statusText as "Active" | "OnHold" | "Closed";
    if ((matter.stageKind === "C" || matter.stageKind === "X") && status !== "Closed") {
      throw new ActionError("Move this matter to an active or waiting stage before reopening it.");
    }
    const onHoldReason = status === "OnHold" ? requireText(formData.get("onHoldReason"), "On-hold reason", 500) : null;
    const reviewDate = status === "OnHold" ? optionalDate(formData.get("reviewDate"), "Review date") : null;
    if (status === "OnHold" && !reviewDate) throw new ActionError("A review date is required while a matter is on hold.");
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.matter.update({
        where: { id_firmId: { id: matter.id, firmId: user.firmId } },
        data: { status, onHoldReason, reviewDate },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.status_changed", entityType: "matter", entityId: matter.id, details: { from: matter.status, to: status } },
      });
    });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/matters/${matterId}`);
}

export async function addMatterTask(_state: string | null, formData: FormData): Promise<string | null> {
  let matterId = "";
  try {
    const user = await authorizedUser("tasks", "Edit");
    matterId = requireText(formData.get("matterId"), "Matter", 80);
    const matter = await getMatterForUser(user, matterId, "View");
    const title = requireText(formData.get("title"), "Task title", 160);
    const category = requireText(formData.get("category"), "Task category", 40);
    const assignedToId = await ensureAssignee(user, requireText(formData.get("assignedToId"), "Assigned person", 80), "tasks");
    const dueAt = optionalDate(formData.get("dueAt"), "Due date");
    const db = getDb();
    await db.$transaction(async (tx) => {
      const published = await lockActiveSetup(tx, user.firmId);
      if (!taskCategoriesFromConfig(published).includes(category as typeof TASK_CATEGORIES[number])) throw new ActionError("Choose a task category from the currently published firm setup.");
      const currentMatter = await tx.matter.findFirst({
        where: { id: matter.id, firmId: user.firmId },
        select: { stage: true },
      });
      if (!currentMatter) throw new ActionError("Matter not found in this firm.");
      await tx.task.create({
        data: { firmId: user.firmId, matterId: matter.id, title, category, stage: currentMatter.stage, assignedToId, createdById: user.id, dueAt },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "task.created", entityType: "matter", entityId: matter.id, details: { title, category } } });
    });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/matters/${matterId}`);
}

export async function completeTask(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedUser("tasks", "Edit");
    const taskId = requireText(formData.get("taskId"), "Task", 80);
    const task = await getTaskForUser(user, taskId, "Edit");
    if (task.status === "Complete") return "success:Task is already complete.";
    const db = getDb();
    await db.$transaction(async (tx) => {
      const updated = await tx.task.updateMany({
        where: { id: task.id, firmId: user.firmId, status: "Open" },
        data: { status: "Complete", completedAt: new Date(), completedById: user.id },
      });
      if (updated.count !== 1) throw new ActionError("This task was completed by someone else. Reload the page.");
      if (task.matterId) {
        const matter = await tx.matter.findFirst({
          where: { id: task.matterId, firmId: user.firmId },
          select: { id: true },
        });
        if (matter) {
          await tx.matter.update({
            where: { id_firmId: { id: matter.id, firmId: user.firmId } },
            data: { lastActivityAt: new Date() },
          });
          await tx.matterActivity.create({
            data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Task completed", details: { taskId: task.id, title: task.title } },
          });
        }
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "task.completed", entityType: "task", entityId: task.id, details: { title: task.title } },
      });
    });
    revalidateAll();
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/tasks");
}

export async function updateTaskAssignment(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedUser("tasks", "Edit");
    const taskId = requireText(formData.get("taskId"), "Task", 80);
    const task = await getTaskForUser(user, taskId, "Edit");
    if (task.status !== "Open") throw new ActionError("Completed tasks cannot be reassigned or rescheduled.");
    const assignedToId = await ensureAssignee(user, requireText(formData.get("assignedToId"), "Assigned person", 80), "tasks");
    const dueAt = optionalDate(formData.get("dueAt"), "Due date");
    const dueUnchanged = (dueAt?.getTime() ?? null) === (task.dueAt?.getTime() ?? null);
    const assignmentChanged = assignedToId !== task.assignedToId;
    if (!dueUnchanged || assignmentChanged) {
      const reason = requireText(formData.get("reason"), "Reason for changing assignment or due date", 500);
      const db = getDb();
      await db.$transaction(async (tx) => {
        await tx.task.update({
          where: { id_firmId: { id: task.id, firmId: user.firmId } },
          data: { assignedToId, dueAt },
        });
        await tx.auditLog.create({
          data: {
            firmId: user.firmId,
            actorId: user.id,
            action: assignmentChanged ? "task.reassigned" : "task.due_date_changed",
            entityType: "task",
            entityId: task.id,
            details: { reason, assignedToId, dueAt: dueAt?.toISOString() ?? null },
          },
        });
      });
    }
    revalidateAll();
    return "success:Task assignment and due date saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function nudgeTask(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await authorizedUser("tasks", "View");
    const taskId = requireText(formData.get("taskId"), "Task", 80);
    const task = await getTaskForUser(user, taskId, "View");
    if (task.status !== "Open") throw new ActionError("Only open tasks can be nudged.");
    const reports = await directReports(user.id, user.firmId);
    if (!reports.includes(task.assignedToId)) throw new ActionError("Only a direct supervisor can nudge this staff member.");
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.taskNudge.create({
        data: { firmId: user.firmId, taskId: task.id, senderId: user.id, recipientId: task.assignedToId },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "task.nudged", entityType: "task", entityId: task.id },
      });
    });
    revalidateAll();
    return "success:Your nudge is visible to the assignee.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function addMatterNote(_state: string | null, formData: FormData): Promise<string | null> {
  let matterId = "";
  try {
    const user = await authorizedUser("matters", "Edit");
    matterId = requireText(formData.get("matterId"), "Matter", 80);
    const matter = await getMatterForUser(user, matterId, "Edit");
    const body = requireText(formData.get("body"), "Note", 5000);
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.matterNote.create({ data: { firmId: user.firmId, matterId: matter.id, authorId: user.id, body } });
      await tx.matter.update({
        where: { id_firmId: { id: matter.id, firmId: user.firmId } },
        data: { lastActivityAt: new Date() },
      });
      await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Note added" } });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.note_added", entityType: "matter", entityId: matter.id },
      });
    });
    revalidateAll();
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/matters/${matterId}`);
}

export async function addDocumentReference(_state: string | null, formData: FormData): Promise<string | null> {
  let matterId = "";
  try {
    const user = await authorizedUser("matters", "Edit");
    matterId = requireText(formData.get("matterId"), "Matter", 80);
    const matter = await getMatterForUser(user, matterId, "Edit");
    const label = requireText(formData.get("label"), "Document label", 160);
    const reference = requireText(formData.get("reference"), "Document reference", 1000);
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.documentReference.create({
        data: { firmId: user.firmId, matterId: matter.id, createdById: user.id, label, reference },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.document_reference_added", entityType: "matter", entityId: matter.id },
      });
    });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/matters/${matterId}`);
}

export async function importMatters(_state: string | null, formData: FormData): Promise<string | null> {
  const rowErrors: string[] = [];
  try {
    const user = await authorizedUser("matters", "Edit");
    const upload = formData.get("file");
    if (!(upload instanceof File) || upload.size === 0) throw new ActionError("Choose a CSV file to import.");
    if (upload.size > MAX_IMPORT_BYTES) throw new ActionError("CSV files must be 2 MB or smaller.");
    if (!upload.name.toLowerCase().endsWith(".csv")) throw new ActionError("Select a .csv file.");
    const content = await upload.text();
    if (new TextEncoder().encode(content).byteLength > MAX_IMPORT_BYTES) throw new ActionError("CSV files must be 2 MB or smaller.");
    const parsed = parseMatterCsv(content);
    if (parsed.length === 1 && parsed[0].error && parsed[0].line === 1) throw new ActionError(parsed[0].error);
    if (parsed.length > MAX_IMPORT_ROWS) throw new ActionError(`A CSV import can contain at most ${MAX_IMPORT_ROWS} data rows.`);
    const db = getDb();
    const setup = await db.setupConfiguration.findFirst({
      where: { firmId: user.firmId },
      select: { publishedAt: true },
    });
    if (!setup?.publishedAt) throw new ActionError("The firm must publish Setup Centre before importing matters.");
    const allowedResponsibleIds = permissionScope(user, "matters") === "Team"
      ? [user.id, ...await directReports(user.id, user.firmId)]
      : permissionScope(user, "matters") === "Firm"
        ? (await getDb().user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true } })).map(({ id }) => id)
        : [user.id];
    let imported = 0;
    for (const result of parsed) {
      if (result.error || !result.value) {
        rowErrors.push(`Row ${result.line}: ${result.error ?? "Invalid row."}`);
        continue;
      }
      const row = result.value;
      try {
        await importMatterRow(db, user, row, allowedResponsibleIds);
        imported += 1;
      } catch (error) {
        rowErrors.push(`Row ${row.line}: ${actionErrorMessage(error)}`);
      }
    }
    revalidateAll();
    const summary = `${imported} matter${imported === 1 ? "" : "s"} imported.${rowErrors.length ? ` ${rowErrors.length} row${rowErrors.length === 1 ? "" : "s"} need attention: ${rowErrors.map((message) => message.slice(0, 300)).join(" ")}` : ""}`;
    return rowErrors.length ? summary : `success:${summary}`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

async function importMatterRow(
  db: ReturnType<typeof getDb>,
  user: Awaited<ReturnType<typeof authorizedUser>>,
  row: CsvMatterRow,
  allowedResponsibleIds: string[],
) {
  try {
    await db.$transaction(async (tx) => {
      const published = await lockActiveSetup(tx, user.firmId);
      const type = matterTypesFromConfig(published).find((item) => item.name.toLowerCase() === row.matterType.toLowerCase());
      const stage = type?.stages.find((item) => item.name.toLowerCase() === row.stage.toLowerCase());
      if (!stage || !type) throw new ActionError("Matter type or stage is not in the currently published firm setup.");
      const eligible = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "firmId" = ${user.firmId} AND "email" = ${row.responsibleEmail} AND "active" = true FOR SHARE`;
      const assigneeId = eligible[0]?.id;
      if (!assigneeId || !allowedResponsibleIds.includes(assigneeId)) throw new ActionError("Responsible person is not active or is outside your assignment scope.");
      const matter = await tx.matter.create({
        data: {
          firmId: user.firmId,
          matterNumber: row.matterNumber,
          clientName: row.clientName,
          clientSurname: row.clientSurname,
          clientEmail: row.clientEmail || null,
          matterType: type.name,
          stage: stage.name,
          stageKind: stage.kind,
          responsibleId: assigneeId,
          createdById: user.id,
          clientNumber: row.clientNumber || null,
          otherReferences: row.otherReferences || null,
          caseNumber: row.caseNumber || null,
          status: stage.kind === "C" || stage.kind === "X" ? "Closed" : "Active",
        },
        select: { id: true },
      });
      if (stage.tasks.length) {
        await tx.task.createMany({
          data: stage.tasks.map((configuredTask) => ({
            firmId: user.firmId,
            matterId: matter.id,
            title: configuredTask.title,
            category: configuredTask.category,
            stage: stage.name,
            assignedToId: assigneeId,
            createdById: user.id,
            dueAt: configuredTask.dueInDays === undefined ? null : addCalendarDays(new Date(), configuredTask.dueInDays),
          })),
        });
      }
      if (stage.kind === "W") {
        await tx.task.create({
          data: {
            firmId: user.firmId,
            matterId: matter.id,
            title: `Follow up: ${stage.name}`,
            category: "Follow up",
            stage: stage.name,
            assignedToId: assigneeId,
            createdById: user.id,
            dueAt: addCalendarDays(new Date(), followUpDaysFromConfig(published)),
          },
        });
      }
      await tx.matterActivity.create({
        data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Matter imported", details: { stage: stage.name } },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "matter.imported", entityType: "matter", entityId: matter.id },
      });
    });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      throw new ActionError(`Matter number ${row.matterNumber} already exists in this firm.`);
    }
    throw error;
  }
}

function revalidateAll() {
  for (const path of MODULE_PATHS) revalidatePath(path);
}
