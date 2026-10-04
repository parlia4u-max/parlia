"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { canAccessRecord } from "@/lib/matter-rules";
import { validatedDocumentReference } from "@/lib/client-portal-rules";
import { portalSettingsFromConfig } from "@/lib/portal-settings";
import { clientStepsForType } from "@/lib/client-tracker";

function text(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

function optionalText(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new ActionError(`${label} must be ${max} characters or fewer.`);
  return value.trim() || null;
}

async function authorizedMatterEditor(matterId: string) {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to continue.");
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } }, firm: { select: { name: true } } },
  });
  if (!user || !hasPermission(user, "matters", "Edit")) throw new ActionError("Matter edit permission is required.");
  const matter = await db.matter.findFirst({ where: { id: matterId, firmId: user.firmId }, select: { id: true, matterNumber: true, responsibleId: true } });
  if (!matter) throw new ActionError("Matter not found in this firm.");
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  if (!canAccessRecord({ userId: user.id, owner: user.isOwner, scope, assignedUserId: matter.responsibleId, directReportIds: reports.map((item) => item.userId) })) {
    throw new ActionError("This matter is outside your permitted scope.");
  }
  return { user, matter, db };
}

export async function createClientPortalUpdate(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    const title = text(form, "title", "Update title", 160);
    const body = text(form, "body", "Update", 3000);
    const shareNow = form.get("shareNow") === "on";
    if (shareNow && !await db.clientMatterAccess.findFirst({
      where: { firmId: user.firmId, matterId: matter.id, revokedAt: null, client: { active: true } },
      select: { id: true },
    })) throw new ActionError("Connect an active client portal account to this matter before sharing an update.");
    const setup = await db.setupConfiguration.findUnique({ where: { firmId: user.firmId }, select: { published: true } });
    const fee = portalSettingsFromConfig(setup?.published);
    await db.$transaction(async (tx) => {
      const created = await tx.clientPortalUpdate.create({
        data: { firmId: user.firmId, matterId: matter.id, createdById: user.id, title, body, sharedAt: shareNow ? new Date() : null },
        select: { id: true },
      });
      if (shareNow && fee.updateFeeEnabled && fee.updateFeeAmount > 0) {
        await tx.possibleBilling.create({ data: { firmId: user.firmId, matterId: matter.id, updateId: created.id, description: `Client update: ${title}`, amount: fee.updateFeeAmount } });
      }
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: shareNow ? "client_portal.update_shared" : "client_portal.update_drafted", entityType: "client-portal-update", entityId: created.id, details: { matterId: matter.id } },
      });
    });
    revalidatePath(`/matters/${matter.id}`);
    revalidatePath(`/client/matters/${matter.id}`);
    return shareNow ? "success:Update saved and shared with the connected client." : "success:Private draft saved. It is not visible in the client portal.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function revokeClientMatterAccess(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const accessId = text(form, "accessId", "Client access", 80);
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    await db.$transaction(async (tx) => {
      const changed = await tx.clientMatterAccess.updateMany({
        where: { id: accessId, firmId: user.firmId, matterId: matter.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (changed.count !== 1) throw new ActionError("Active client access was not found.");
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "client_portal.matter_access_revoked", entityType: "client-matter-access", entityId: accessId, details: { matterId: matter.id } },
      });
    });
    revalidatePath(`/matters/${matter.id}`);
    return "success:Client access to this matter was revoked.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function submitClientDocumentReference(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const client = await getCurrentClient();
    if (!client) throw new ActionError("Sign in to continue.");
    const matterId = text(form, "matterId", "Matter", 80);
    const label = text(form, "label", "Document label", 160);
    const referenceUrl = validatedDocumentReference(text(form, "referenceUrl", "Document link", 2048));
    const db = getDb();
    const access = await db.clientMatterAccess.findFirst({
      where: { firmId: client.firmId, clientId: client.id, matterId, revokedAt: null, matter: { firmId: client.firmId } },
      select: { matterId: true },
    });
    if (!access) throw new ActionError("This matter is not connected to your active client account.");
    const reference = await db.clientDocumentReference.create({
      data: { firmId: client.firmId, matterId: access.matterId, clientId: client.id, label, referenceUrl, status: "PendingReview" },
      select: { id: true },
    });
    await db.auditLog.create({
      data: { firmId: client.firmId, actorId: null, action: "client_portal.document_reference_submitted", entityType: "client-document-reference", entityId: reference.id, details: { matterId: access.matterId, clientId: client.id } },
    });
    revalidatePath(`/client/matters/${matterId}`);
    revalidatePath("/client-review");
    return "success:Document reference submitted for firm review. No file was uploaded to Parlia.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function reviewClientDocumentReference(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const referenceId = text(form, "referenceId", "Document reference", 80);
    const decision = form.get("decision");
    if (decision !== "Accepted" && decision !== "Rejected") throw new ActionError("Choose accept or reject.");
    const reviewNote = optionalText(form, "reviewNote", "Review note", 1000);
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    const reference = await db.clientDocumentReference.findFirst({
      where: { id: referenceId, firmId: user.firmId, matterId: matter.id, status: "PendingReview" },
      include: { client: { select: { email: true, name: true } } },
    });
    if (!reference) throw new ActionError("Pending document reference not found in this matter.");
    await db.$transaction(async (tx) => {
      const changed = await tx.clientDocumentReference.updateMany({
        where: { id: reference.id, firmId: user.firmId, matterId: matter.id, status: "PendingReview" },
        data: { status: decision, reviewNote, reviewedById: user.id, reviewedAt: new Date() },
      });
      if (changed.count !== 1) throw new ActionError("This submission was already reviewed.");
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: `client_portal.document_reference.${decision.toLowerCase()}`, entityType: "client-document-reference", entityId: reference.id, details: { matterId: matter.id, clientId: reference.clientId } },
      });
    });
    revalidatePath("/client-review");
    revalidatePath(`/client/matters/${matter.id}`);
    try {
      await sendEmail(reference.client.email, `${user.firm.name}: document reference reviewed`, `Hello ${reference.client.name},\n\nThe firm has ${decision.toLowerCase()} the document reference “${reference.label}” for matter ${matter.matterNumber}.${reviewNote ? `\n\nNote: ${reviewNote}` : ""}\n\nSign in to the client portal to view the status.`);
    } catch (error) {
      return `Review status was saved, but the client notification failed: ${actionErrorMessage(error)}`;
    }
    return `success:Submission ${decision.toLowerCase()} and client notified.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function setClientStep(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    const step = optionalText(form, "step", "Client step", 80);
    const full = await db.matter.findFirstOrThrow({ where: { id: matter.id, firmId: user.firmId }, select: { matterType: true } });
    const setup = await db.setupConfiguration.findUnique({ where: { firmId: user.firmId }, select: { published: true } });
    const published = setup?.published && typeof setup.published === "object" ? setup.published as Record<string, unknown> : {};
    const type = (Array.isArray(published.matterTypes) ? published.matterTypes : []).find((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === full.matterType);
    const stages = Array.isArray((type as Record<string, unknown> | undefined)?.stages) ? ((type as Record<string, unknown>).stages as { name: string; kind: string }[]) : [];
    const steps = clientStepsForType(type, stages);
    if (step && !steps.some((item) => item.name === step)) throw new ActionError("Choose one of the configured client steps.");
    const estimates: Record<string, string> = {};
    for (const item of steps) {
      const value = form.get(`estimate:${item.name}`);
      if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) estimates[item.name] = value;
    }
    await db.$transaction(async (tx) => {
      await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { clientStepOverride: step, clientStepEstimates: estimates } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "client_portal.step_set", entityType: "matter", entityId: matter.id, details: { step } } });
    });
    revalidatePath(`/matters/${matter.id}`);
    revalidatePath(`/client/matters/${matter.id}`);
    return "success:Client tracker saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function decidePossibleBilling(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const id = text(form, "billingId", "Billing entry", 80);
    const decision = text(form, "decision", "Decision", 10);
    if (decision !== "Confirmed" && decision !== "Declined") throw new ActionError("Choose confirm or decline.");
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    await db.$transaction(async (tx) => {
      const changed = await tx.possibleBilling.updateMany({
        where: { id, firmId: user.firmId, matterId: matter.id, status: "Pending" },
        data: { status: decision, decidedById: user.id, decidedAt: new Date() },
      });
      if (changed.count !== 1) throw new ActionError("This entry was already decided.");
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: `client_portal.billing_${decision.toLowerCase()}`, entityType: "possible-billing", entityId: id, details: { matterId: matter.id } } });
    });
    revalidatePath(`/matters/${matter.id}`);
    return `success:Entry ${decision.toLowerCase()}.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}
