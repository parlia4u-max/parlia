"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser, hasPermission, permissionScope, audit } from "@/lib/auth";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { encryptSensitive, decryptSensitive, fingerprintSensitive } from "@/lib/sensitive-data";
import { leaveBalance, leaveDaysBetween, type LeaveKind } from "@/lib/leave-rules";
import { matchesHRDocumentMagic } from "@/lib/hr-rules";

type HrUser = NonNullable<Awaited<ReturnType<typeof hrUser>>>;

async function hrUser(level: "View" | "Edit" = "View") {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !hasPermission(user, "people", level)) throw new ActionError(`You do not have ${level.toLowerCase()} access to HR records.`);
  return user;
}

async function managedIds(user: HrUser) {
  const db = getDb();
  if (user.isOwner || permissionScope(user, "people") === "Firm") {
    return (await db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true } })).map((person) => person.id);
  }
  if (permissionScope(user, "people") === "Team") {
    const reports = await db.supervisorLink.findMany({
      where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } },
      select: { userId: true },
    });
    return [user.id, ...reports.map((report) => report.userId)];
  }
  return [user.id];
}

async function canManageTarget(user: HrUser, targetId: string) {
  if (user.isOwner) return true;
  if (!hasPermission(user, "people", "Edit")) return false;
  return (await managedIds(user)).includes(targetId);
}

async function canAccessTarget(user: HrUser, targetId: string) {
  return user.id === targetId || (await managedIds(user)).includes(targetId);
}

async function getPublished(firmId: string) {
  const setup = await getDb().setupConfiguration.findFirst({ where: { firmId }, select: { published: true } });
  if (!setup?.published || typeof setup.published !== "object") throw new ActionError("Published firm setup is unavailable.");
  return setup.published as Record<string, any>;
}

function text(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

function optionalText(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (value === null || value === "") return "";
  if (typeof value !== "string" || value.trim().length > max) throw new ActionError(`${label} must be ${max} characters or fewer.`);
  return value.trim();
}

function secretValue(form: FormData, key: string) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.length || value.length > 4096) throw new ActionError("Secret is required and must be 4096 characters or fewer.");
  return value;
}

function calendarDate(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ActionError(`${label} is required.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ActionError(`${label} must be a valid date.`);
  return parsed;
}

function leaveType(value: FormDataEntryValue | null): LeaveKind {
  if (value === "Annual" || value === "Sick" || value === "Study" || value === "FamilyResponsibility") return value;
  throw new ActionError("Choose a valid leave type.");
}

function todayUTC() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function submitLeave(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const type = leaveType(form.get("type"));
    const startDate = calendarDate(form.get("startDate"), "Start date");
    const endDate = calendarDate(form.get("endDate"), "End date");
    const reason = text(form, "reason", "Reason", 500);
    const coverId = text(form, "coverId", "Covering colleague", 80);
    const formTemplate = text(form, "formTemplate", "PDF form template", 1);
    if (endDate < startDate) throw new ActionError("End date must be on or after the start date.");
    if (startDate < todayUTC()) throw new ActionError("Leave requests cannot start in the past.");
    if (!["A", "B", "C"].includes(formTemplate)) throw new ActionError("Choose leave form A, B or C.");
    const db = getDb();
    const [config, profile] = await Promise.all([
      getPublished(user.firmId),
      db.staffProfile.findFirst({ where: { userId: user.id, firmId: user.firmId }, select: { onboardingDueAt: true, employmentStartDate: true } }),
    ]);
    if (coverId === user.id) throw new ActionError("Choose another active member of this firm as cover.");
    const country = config.countryHolidays as { publicHolidays?: { date?: string }[] } | undefined;
    const holidays = new Set((country?.publicHolidays ?? []).map((holiday) => holiday.date).filter((date): date is string => typeof date === "string"));
    const requestedDays = leaveDaysBetween(startDate, endDate, holidays);
    if (requestedDays < 1) throw new ActionError("The selected dates contain no working days after weekends and configured public holidays.");
    if (requestedDays > 90) throw new ActionError("A single leave request cannot exceed 90 working days.");
    const rules = config.leaveRules ?? {};
    const formConfig = (rules.leaveForms as { id: string }[] | undefined)?.find((item) => item.id === formTemplate);
    if (!formConfig) throw new ActionError("The selected leave form is not configured in published Setup.");
    await db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${user.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      if (!locked.length) throw new ActionError("Your staff account is no longer active in this firm.");
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${user.firmId} FOR SHARE`;
      const currentSetup = await tx.setupConfiguration.findUnique({ where: { firmId: user.firmId }, select: { published: true } });
      const currentPublished = currentSetup?.published as Record<string, any> | undefined;
      if (!currentPublished || JSON.stringify(currentPublished.leaveRules) !== JSON.stringify(config.leaveRules) ||
          JSON.stringify(currentPublished.countryHolidays) !== JSON.stringify(config.countryHolidays)) {
        throw new ActionError("Published firm leave settings changed while submitting. Reload and review your balance.");
      }
      const cover = await tx.user.findFirst({
        where: { id: coverId, firmId: user.firmId, active: true },
        include: { role: { include: { permissions: true } } },
      });
      if (!cover || !hasPermission(cover, "tasks", "Edit")) throw new ActionError("Choose an active cover colleague with task edit access.");
      const overlapping = await tx.leaveRequest.findFirst({
        where: { firmId: user.firmId, requesterId: user.id, status: { in: ["Pending", "Approved"] }, startDate: { lte: endDate }, endDate: { gte: startDate } },
        select: { id: true },
      });
      if (overlapping) throw new ActionError("You already have pending or approved leave over some of these dates.");
      const existing = await tx.leaveRequest.findMany({
        where: { firmId: user.firmId, requesterId: user.id, status: { in: ["Pending", "Approved"] } },
        select: { type: true, requestedDays: true, startDate: true, status: true },
      });
      const balance = leaveBalance({ type, rules, employedAt: profile?.employmentStartDate ?? user.createdAt, requests: existing as never, today: todayUTC() });
      if (!balance.configured) throw new ActionError("This leave type is disabled until the owner configures and publishes its allowance in Setup.");
      if (balance.balance === null || requestedDays > balance.balance) throw new ActionError(`The request exceeds your available balance of ${balance.balance ?? 0} day(s).`);
      const request = await tx.leaveRequest.create({
        data: {
          firmId: user.firmId, requesterId: user.id, coverId, type, startDate, endDate, requestedDays, reason, formTemplate,
          formSnapshot: { template: formConfig, firmProfile: config.firmProfile } as never,
        },
        select: { id: true },
      });
      if (type !== "Annual") {
        const task = await tx.task.create({
          data: {
            firmId: user.firmId, title: `Submit proof for ${type === "FamilyResponsibility" ? "family-responsibility" : type.toLowerCase()} leave`,
            category: "Tasks", assignedToId: user.id, createdById: user.id, dueAt: endDate,
          },
          select: { id: true },
        });
        await tx.leaveProofTask.create({ data: { firmId: user.firmId, leaveRequestId: request.id, taskId: task.id } });
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "leave.request.submitted", entityType: "leave-request", entityId: request.id, details: { type, requestedDays } },
      });
    });
    revalidatePath("/leave");
    revalidatePath("/tasks");
    return "success:Leave request submitted for approval.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

async function verifyApprover(user: HrUser, requesterId: string) {
  if (user.isOwner) return;
  if (!hasPermission(user, "people", "Edit") || permissionScope(user, "people") === "Own") {
    throw new ActionError("Leave approvals require owner access or supervisor edit permission within Team or Firm scope.");
  }
  const link = await getDb().supervisorLink.findFirst({
    where: { firmId: user.firmId, userId: requesterId, supervisorId: user.id, user: { active: true }, supervisor: { active: true } },
    select: { id: true },
  });
  if (!link) throw new ActionError("Only the requester’s assigned direct supervisor or the firm owner may decide this request.");
}

export async function decideLeave(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const requestId = text(form, "requestId", "Leave request", 80);
    const decision = form.get("decision");
    if (decision !== "approve" && decision !== "decline") throw new ActionError("Choose approve or decline.");
    const decisionNote = optionalText(form, "decisionNote", "Decision note", 500);
    const db = getDb();
    const request = await db.leaveRequest.findFirst({ where: { id: requestId, firmId: user.firmId }, select: { id: true, requesterId: true, coverId: true, status: true, type: true, startDate: true, endDate: true, requestedDays: true } });
    if (!request) throw new ActionError("Leave request not found in this firm.");
    await verifyApprover(user, request.requesterId);
    if (request.status !== "Pending") throw new ActionError("This leave request has already been decided.");
    if (decision === "approve" && !request.coverId) throw new ActionError("An active cover person is required before approval.");
    const cover = request.coverId ? await db.user.findFirst({
      where: { id: request.coverId, firmId: user.firmId, active: true },
      include: { role: { include: { permissions: true } } },
    }) : null;
    if (decision === "approve" && (!cover || !hasPermission(cover, "tasks", "Edit"))) throw new ActionError("The selected cover person is no longer authorized to handle tasks.");
    await db.$transaction(async (tx) => {
      const changed = await tx.leaveRequest.updateMany({
        where: { id: request.id, firmId: user.firmId, status: "Pending" },
        data: { status: decision === "approve" ? "Approved" : "Declined", approvedById: user.id, decidedAt: new Date(), decisionNote: decisionNote || null },
      });
      if (changed.count !== 1) throw new ActionError("This request was already decided by another approver.");
      if (decision === "approve" && request.coverId) {
        const tasks = await tx.task.findMany({
          where: { firmId: user.firmId, assignedToId: request.requesterId, status: "Open" },
          select: { id: true, title: true, category: true, stage: true, matterId: true, dueAt: true, status: true, completedAt: true, completedById: true, assignedToId: true },
        });
        for (const task of tasks) {
          const snapshot = { title: task.title, category: task.category, stage: task.stage, matterId: task.matterId, dueAt: task.dueAt?.toISOString() ?? null, status: task.status, completedAt: task.completedAt?.toISOString() ?? null, completedById: task.completedById, assignedToId: task.assignedToId };
          const moved = await tx.task.updateMany({ where: { id: task.id, firmId: user.firmId, assignedToId: request.requesterId, status: "Open" }, data: { assignedToId: request.coverId } });
          if (moved.count !== 1) continue;
          await tx.leaveTaskHandover.create({
            data: { firmId: user.firmId, leaveRequestId: request.id, taskId: task.id, originalAssigneeId: request.requesterId, coverId: request.coverId, taskSnapshot: snapshot },
          });
        }
        await tx.calendarEvent.create({
          data: {
            firmId: user.firmId, ownerId: request.requesterId, responsibleId: request.requesterId, createdById: user.id,
            leaveRequestId: request.id, title: "Approved leave", description: "Approved staff leave",
            startAt: request.startDate, endAt: new Date(request.endDate.getTime() + 24 * 60 * 60 * 1000), audience: "Internal",
          },
        });
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: `leave.request.${decision === "approve" ? "approved" : "declined"}`, entityType: "leave-request", entityId: request.id, details: { type: request.type, handoverCount: decision === "approve" ? await tx.leaveTaskHandover.count({ where: { firmId: user.firmId, leaveRequestId: request.id } }) : 0 } },
      });
    });
    revalidatePath("/leave");
    revalidatePath("/tasks");
    revalidatePath("/calendar");
    return `success:Leave request ${decision === "approve" ? "approved" : "declined"}.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function returnFromLeave(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const requestId = text(form, "requestId", "Leave request", 80);
    const db = getDb();
    const request = await db.leaveRequest.findFirst({ where: { id: requestId, firmId: user.firmId }, select: { id: true, requesterId: true, endDate: true, status: true, returnedAt: true } });
    if (!request || (request.requesterId !== user.id && !user.isOwner)) throw new ActionError("Only the requester or firm owner can return from this leave.");
    if (request.status !== "Approved") throw new ActionError("Only approved leave can be returned.");
    if (request.returnedAt) throw new ActionError("This leave has already been returned.");
    if (request.endDate >= todayUTC()) throw new ActionError("Return from leave is available only after the approved leave end date has passed.");
    let restored = 0;
    await db.$transaction(async (tx) => {
      const marked = await tx.leaveRequest.updateMany({
        where: { id: request.id, firmId: user.firmId, status: "Approved", returnedAt: null },
        data: { returnedAt: new Date(), returnedById: user.id },
      });
      if (marked.count !== 1) throw new ActionError("Return from leave was already recorded.");
      const handovers = await tx.leaveTaskHandover.findMany({ where: { firmId: user.firmId, leaveRequestId: request.id, restoredAt: null }, select: { id: true, taskId: true, originalAssigneeId: true, coverId: true } });
      for (const handover of handovers) {
        const result = await tx.task.updateMany({
          where: { id: handover.taskId, firmId: user.firmId, assignedToId: handover.coverId },
          data: { assignedToId: handover.originalAssigneeId },
        });
        if (result.count === 1) restored += 1;
        await tx.leaveTaskHandover.updateMany({ where: { id: handover.id, firmId: user.firmId, restoredAt: null }, data: { restoredAt: new Date() } });
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "leave.returned", entityType: "leave-request", entityId: request.id, details: { taskAssignmentsRestored: restored } },
      });
    });
    revalidatePath("/leave");
    revalidatePath("/tasks");
    return `success:Return recorded. ${restored} task assignment(s) restored where still assigned to cover.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function saveNextOfKin(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const targetId = text(form, "targetId", "Staff member", 80);
    if (!(await canAccessTarget(user, targetId))) throw new ActionError("You cannot access this staff profile.");
    if (targetId !== user.id && !user.isOwner) throw new ActionError("Next-of-kin details can be accessed only by the profile owner or firm owner.");
    const name = text(form, "nextOfKinName", "Next-of-kin name", 160);
    const relationship = text(form, "nextOfKinRelationship", "Relationship", 80);
    const phone = text(form, "nextOfKinPhone", "Next-of-kin phone", 80);
    const sealed = encryptSensitive(JSON.stringify({ name, relationship, phone }));
    const db = getDb();
    await db.$transaction(async (tx) => {
      await tx.staffProfile.upsert({
        where: { userId_firmId: { userId: targetId, firmId: user.firmId } },
        create: { firmId: user.firmId, userId: targetId, nextOfKinCiphertext: sealed.ciphertext, nextOfKinIv: sealed.iv, nextOfKinTag: sealed.authTag },
        update: { nextOfKinCiphertext: sealed.ciphertext, nextOfKinIv: sealed.iv, nextOfKinTag: sealed.authTag },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "hr.next_of_kin.updated", entityType: "staff-profile", entityId: targetId } });
    });
    revalidatePath("/people/hr");
    revalidatePath(`/people/hr/${targetId}`);
    return "success:Encrypted next-of-kin details saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function toggleOnboardingItem(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const itemId = text(form, "itemId", "Checklist item", 80);
    const completed = form.get("completed") === "yes";
    const db = getDb();
    const item = await db.onboardingChecklistItem.findFirst({
      where: { id: itemId, firmId: user.firmId },
      include: { profile: { select: { userId: true } } },
    });
    if (!item || (item.profile.userId !== user.id && !(await canManageTarget(user, item.profile.userId)))) throw new ActionError("You cannot update this onboarding item.");
    await db.$transaction(async (tx) => {
      await tx.onboardingChecklistItem.updateMany({
        where: { id: item.id, firmId: user.firmId },
        data: { completed, completedAt: completed ? new Date() : null, completedById: completed ? user.id : null },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: `hr.onboarding.${completed ? "completed" : "reopened"}`, entityType: "onboarding-checklist-item", entityId: item.id } });
    });
    revalidatePath("/people/hr");
    revalidatePath(`/people/hr/${item.profile.userId}`);
    return "success:Onboarding checklist updated.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function setOnboardingDeadline(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner) throw new ActionError("Only the firm owner can set onboarding deadlines.");
    const targetId = text(form, "targetId", "Staff member", 80);
    const raw = optionalText(form, "dueAt", "Due date", 10);
    const dueAt = raw ? calendarDate(raw, "Due date") : null;
    const employmentStartRaw = optionalText(form, "employmentStartDate", "Employment start date", 10);
    const employmentStartDate = employmentStartRaw ? calendarDate(employmentStartRaw, "Employment start date") : null;
    const db = getDb();
    const target = await db.user.findFirst({ where: { id: targetId, firmId: user.firmId, active: true }, select: { id: true } });
    if (!target) throw new ActionError("Choose an active staff account in this firm.");
    await db.$transaction(async (tx) => {
      await tx.staffProfile.upsert({
        where: { userId_firmId: { userId: targetId, firmId: user.firmId } },
        create: { firmId: user.firmId, userId: targetId, onboardingDueAt: dueAt, employmentStartDate },
        update: { onboardingDueAt: dueAt, employmentStartDate },
      });
      await tx.auditLog.create({
        data: {
          firmId: user.firmId, actorId: user.id, action: "hr.onboarding.deadline.updated", entityType: "staff-profile", entityId: targetId,
          details: { dueAt: dueAt?.toISOString() ?? null, employmentStartDate: employmentStartDate?.toISOString() ?? null },
        },
      });
    });
    revalidatePath("/people/hr");
    revalidatePath(`/people/hr/${targetId}`);
    return "success:Onboarding deadline saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

const ALLOWED_DOCUMENT_TYPES = new Set(["Bank confirmation", "Identity document", "Signed contract"]);

function validateDocumentContent(mimeType: string, bytes: Buffer) {
  if (!matchesHRDocumentMagic(mimeType, bytes)) throw new ActionError("File content does not match an accepted PDF, PNG or JPEG type.");
}

export async function uploadHRDocument(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    const targetId = text(form, "targetId", "Staff member", 80);
    let type = text(form, "documentType", "Document type", 120);
    if (type === "Custom") type = `Custom: ${text(form, "customDocumentType", "Custom document type", 80)}`;
    if (!ALLOWED_DOCUMENT_TYPES.has(type) && !/^Custom: [\w -]{1,80}$/.test(type)) throw new ActionError("Choose a standard document type or name a custom type.");
    if (!(await canAccessTarget(user, targetId)) || (targetId !== user.id && !(await canManageTarget(user, targetId)))) throw new ActionError("You are not authorized to upload documents for this staff member.");
    const entry = form.get("file");
    if (!(entry instanceof File) || !entry.size) throw new ActionError("Choose a document to upload.");
    if (entry.size > 5 * 1024 * 1024) throw new ActionError("HR documents cannot exceed 5 MB.");
    const name = entry.name.replace(/[\\/\r\n"]/g, "_").slice(0, 180);
    const bytes = Buffer.from(await entry.arrayBuffer());
    validateDocumentContent(entry.type, bytes);
    const sealedMetadata = encryptSensitive(JSON.stringify({ documentType: type, fileName: name, mimeType: entry.type, size: bytes.length }));
    const sealedContent = encryptSensitive(bytes.toString("base64"));
    const db = getDb();
    const documentTypeHash = fingerprintSensitive(type, `${user.firmId}:hr-document-type`);
    const existing = await db.hRDocument.findFirst({ where: { firmId: user.firmId, subjectId: targetId, documentTypeHash }, select: { id: true, resubmissionRequested: true, locked: true } });
    if (existing && (targetId !== user.id || !existing.resubmissionRequested)) throw new ActionError("Only the staff member may replace a locked document after the firm owner requests resubmission.");
    await db.$transaction(async (tx) => {
      const document = await tx.hRDocument.upsert({
        where: { subjectId_documentTypeHash: { subjectId: targetId, documentTypeHash } },
        create: {
          firmId: user.firmId, subjectId: targetId, documentTypeHash,
          encryptedMetadata: sealedMetadata.ciphertext, metadataIv: sealedMetadata.iv, metadataAuthTag: sealedMetadata.authTag,
          encryptedContent: sealedContent.ciphertext, contentIv: sealedContent.iv, contentAuthTag: sealedContent.authTag,
        },
        update: {
          encryptedMetadata: sealedMetadata.ciphertext, metadataIv: sealedMetadata.iv, metadataAuthTag: sealedMetadata.authTag,
          encryptedContent: sealedContent.ciphertext, contentIv: sealedContent.iv, contentAuthTag: sealedContent.authTag,
          locked: true, resubmissionRequested: false, submittedAt: new Date(),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: existing ? "hr.document.replaced_and_locked" : "hr.document.uploaded_and_locked", entityType: "hr-document", entityId: document.id, details: { subjectId: targetId } },
      });
    });
    revalidatePath("/people/hr");
    revalidatePath(`/people/hr/${targetId}`);
    return "success:Document encrypted, submitted and locked.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function requestDocumentResubmission(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner) throw new ActionError("Only the firm owner may request document resubmission.");
    const documentId = text(form, "documentId", "Document", 80);
    const db = getDb();
    const document = await db.hRDocument.findFirst({ where: { id: documentId, firmId: user.firmId }, select: { id: true, subjectId: true, resubmissionRequested: true } });
    if (!document) throw new ActionError("Document not found in this firm.");
    if (document.resubmissionRequested) throw new ActionError("Resubmission has already been requested.");
    await db.$transaction(async (tx) => {
      const requested = await tx.hRDocument.updateMany({ where: { id: document.id, firmId: user.firmId, resubmissionRequested: false }, data: { resubmissionRequested: true } });
      if (requested.count !== 1) throw new ActionError("Resubmission was already requested.");
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "hr.document.resubmission_requested", entityType: "hr-document", entityId: document.id, details: { subjectId: document.subjectId } },
      });
    });
    revalidatePath(`/people/hr/${document.subjectId}`);
    return "success:Document resubmission requested. The staff member may now replace it.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function createEquipment(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner && (permissionScope(user, "people") === "Own" || !hasPermission(user, "people", "Edit"))) throw new ActionError("Equipment management requires owner or authorized staff manager access.");
    const name = text(form, "name", "Equipment name", 120);
    const serialNumber = text(form, "serialNumber", "Serial number", 120);
    const condition = text(form, "condition", "Condition report", 1000);
    const signedDeclaration = text(form, "signedDeclaration", "Signed declaration", 2000);
    const assignedToId = text(form, "assignedToId", "Staff member", 80);
    const allowed = await managedIds(user);
    if (!allowed.includes(assignedToId)) throw new ActionError("You may assign equipment only within your authorized staff scope.");
    const db = getDb();
    const assignee = await db.user.findFirst({ where: { id: assignedToId, firmId: user.firmId, active: true }, select: { id: true, name: true } });
    if (!assignee) throw new ActionError("Choose an active employee in this firm.");
    if (signedDeclaration !== assignee.name) throw new ActionError("The signed declaration must be the assigned staff member’s full name.");
    await db.$transaction(async (tx) => {
      const asset = await tx.equipmentAsset.create({
        data: { firmId: user.firmId, name, serialNumber, condition, assignedToId, assignedById: user.id, signedDeclaration, assignedAt: new Date() },
        select: { id: true },
      });
      await tx.equipmentAssignment.create({
        data: { firmId: user.firmId, equipmentId: asset.id, userId: assignedToId, assignedById: user.id, conditionAtIssue: condition, signedDeclaration },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "hr.equipment.assigned", entityType: "equipment", entityId: asset.id, details: { assignedToId, serialNumber } },
      });
    });
    revalidatePath("/people/equipment");
    return "success:Equipment recorded and assigned.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function assignEquipment(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner && permissionScope(user, "people") === "Own") throw new ActionError("Equipment management requires owner or authorized staff manager access.");
    const assetId = text(form, "assetId", "Equipment item", 80);
    const assignedToId = text(form, "assignedToId", "Staff member", 80);
    const condition = text(form, "condition", "Condition report", 1000);
    const signedDeclaration = text(form, "signedDeclaration", "Signed declaration", 2000);
    const scopeIds = await managedIds(user);
    if (!scopeIds.includes(assignedToId)) throw new ActionError("You may assign equipment only within your authorized staff scope.");
    const db = getDb();
    const [asset, assignee] = await Promise.all([
      db.equipmentAsset.findFirst({
        where: { id: assetId, firmId: user.firmId, assignedToId: null, returnedAt: { not: null }, ...(!user.isOwner && permissionScope(user, "people") === "Team" ? { assignments: { some: { firmId: user.firmId, userId: { in: scopeIds } } } } : {}) },
        select: { id: true, serialNumber: true },
      }),
      db.user.findFirst({ where: { id: assignedToId, firmId: user.firmId, active: true }, select: { id: true, name: true } }),
    ]);
    if (!asset || !assignee) throw new ActionError("Choose a returned equipment item and active staff member in your scope.");
    if (signedDeclaration !== assignee.name) throw new ActionError("The signed declaration must be the assigned staff member’s full name.");
    await db.$transaction(async (tx) => {
      const changed = await tx.equipmentAsset.updateMany({
        where: { id: asset.id, firmId: user.firmId, assignedToId: null, returnedAt: { not: null } },
        data: { assignedToId: assignee.id, assignedById: user.id, signedDeclaration, condition, assignedAt: new Date(), returnedAt: null },
      });
      if (changed.count !== 1) throw new ActionError("This equipment item was assigned by another manager.");
      await tx.equipmentAssignment.create({
        data: { firmId: user.firmId, equipmentId: asset.id, userId: assignee.id, assignedById: user.id, conditionAtIssue: condition, signedDeclaration },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "hr.equipment.reassigned", entityType: "equipment", entityId: asset.id, details: { assignedToId: assignee.id, serialNumber: asset.serialNumber } },
      });
    });
    revalidatePath("/people/equipment");
    return "success:Equipment reassignment recorded.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function returnEquipment(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner && permissionScope(user, "people") === "Own") throw new ActionError("Equipment management requires owner or authorized staff manager access.");
    const assetId = text(form, "assetId", "Equipment item", 80);
    const returnCondition = text(form, "returnCondition", "Return condition report", 1000);
    const db = getDb();
    const asset = await db.equipmentAsset.findFirst({ where: { id: assetId, firmId: user.firmId, returnedAt: null }, select: { id: true, assignedToId: true, serialNumber: true } });
    if (!asset || !asset.assignedToId) throw new ActionError("Active equipment assignment not found.");
    const assignedToId = asset.assignedToId;
    if (!(await managedIds(user)).includes(assignedToId)) throw new ActionError("This assignment is outside your staff scope.");
    await db.$transaction(async (tx) => {
      const history = await tx.equipmentAssignment.updateMany({
        where: { firmId: user.firmId, equipmentId: asset.id, userId: assignedToId, returnedAt: null },
        data: { returnedAt: new Date(), returnCondition },
      });
      if (history.count !== 1) throw new ActionError("The active equipment assignment was already returned.");
      const changed = await tx.equipmentAsset.updateMany({
        where: { id: asset.id, firmId: user.firmId, returnedAt: null },
        data: { assignedToId: null, returnedAt: new Date(), condition: returnCondition },
      });
      if (changed.count !== 1) throw new ActionError("The equipment item was updated by another manager.");
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "hr.equipment.returned", entityType: "equipment", entityId: asset.id, details: { serialNumber: asset.serialNumber } },
      });
    });
    revalidatePath("/people/equipment");
    return "success:Equipment return recorded.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function createVaultEntry(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("Edit");
    if (!user.isOwner) throw new ActionError("Only the firm owner may manage the password vault.");
    const label = text(form, "label", "Entry name", 160);
    const username = optionalText(form, "username", "Username", 160);
    const secret = secretValue(form, "secret");
    const notes = optionalText(form, "notes", "Notes", 500);
    const sealedMetadata = encryptSensitive(JSON.stringify({ label, username, notes }));
    const sealedSecret = encryptSensitive(secret);
    const db = getDb();
    await db.$transaction(async (tx) => {
      const entry = await tx.passwordVaultEntry.create({
        data: {
          firmId: user.firmId, encryptedMetadata: sealedMetadata.ciphertext, metadataIv: sealedMetadata.iv, metadataAuthTag: sealedMetadata.authTag,
          encryptedSecret: sealedSecret.ciphertext, secretIv: sealedSecret.iv, secretAuthTag: sealedSecret.authTag, createdById: user.id,
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "hr.password_vault.entry_created", entityType: "password-vault-entry", entityId: entry.id } });
    });
    revalidatePath("/people/password-vault");
    return "success:Encrypted password-vault entry saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function revealVaultEntry(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await hrUser("View");
    if (!user.isOwner) throw new ActionError("Only the firm owner may reveal password-vault entries.");
    const entryId = text(form, "entryId", "Vault entry", 80);
    const db = getDb();
    const entry = await db.passwordVaultEntry.findFirst({
      where: { id: entryId, firmId: user.firmId },
      select: { id: true, encryptedMetadata: true, metadataIv: true, metadataAuthTag: true, encryptedSecret: true, secretIv: true, secretAuthTag: true },
    });
    if (!entry) throw new ActionError("Vault entry not found.");
    const metadata = JSON.parse(decryptSensitive(entry.encryptedMetadata, entry.metadataIv, entry.metadataAuthTag)) as { label: string; username: string };
    const secret = decryptSensitive(entry.encryptedSecret, entry.secretIv, entry.secretAuthTag);
    await audit(user.firmId, user.id, "hr.password_vault.secret_revealed", "password-vault-entry", entry.id);
    return `success:Secret for ${metadata.label}${metadata.username ? ` (${metadata.username})` : ""}: ${secret}`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}
