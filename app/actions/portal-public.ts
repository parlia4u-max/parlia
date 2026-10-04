"use server";

import { headers } from "next/headers";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getDb } from "@/lib/db";
import { getFirmBySlug, sendBrandedEmail } from "@/lib/firm-portal";
import { createPortalInvitation } from "@/lib/portal-invites";
import { ACCESS_REQUEST_LIMITS, isRateLimited, verifyHumanCheck } from "@/lib/portal-check";
import { hashVerificationCode, normalizeEmail, validEmail } from "@/lib/security";

const ACCESS_REQUEST_MESSAGE = "If your details match our records, we have emailed you a link";

function field(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

async function requesterHash() {
  const list = await headers();
  const ip = (list.get("x-forwarded-for")?.split(",")[0] ?? list.get("x-real-ip") ?? "unknown").trim();
  return hashVerificationCode(`portal-ip:${ip}`);
}

function checkHuman(form: FormData) {
  if (typeof form.get("website") === "string" && String(form.get("website")).length) throw new ActionError(ACCESS_REQUEST_MESSAGE);
  if (!verifyHumanCheck(form.get("checkToken"), form.get("checkAnswer"))) throw new ActionError("The check answer was not correct. Please try the new question.");
}

async function notifyStaffOfFailure(firmId: string) {
  const db = getDb();
  const since = new Date(Date.now() - 60 * 60 * 1000);
  if (await db.portalAccessRequest.findFirst({ where: { firmId, staffNotified: true, createdAt: { gte: since } }, select: { id: true } })) return false;
  const failures = await db.portalAccessRequest.count({ where: { firmId, outcome: { in: ["NoMatch", "Blocked"] }, createdAt: { gte: since } } });
  if (failures < 3) return false;
  const owners = await db.user.findMany({ where: { firmId, isOwner: true, active: true }, select: { email: true } });
  let sent = false;
  for (const owner of owners) {
    try {
      await sendBrandedEmail(firmId, owner.email, "Client portal: unmatched access requests", "Unmatched access requests", [
        `${failures} client portal access requests in the last hour did not match a matter record. No links were sent.`,
        "If this was not expected, check the audit log under Settings.",
      ]);
      sent = true;
    } catch {
      // The failure is already in the audit log; delivery problems must not reveal anything to the requester.
    }
  }
  return sent;
}

export async function requestPortalAccess(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const slug = field(form, "slug", "Firm", 60);
    const context = await getFirmBySlug(slug);
    if (!context || !context.settings.requestAccessEnabled) throw new ActionError("Requesting access is not available. Please contact the firm.");
    checkHuman(form);
    const reference = field(form, "reference", "Reference number", 80);
    const email = normalizeEmail(field(form, "email", "Email", 254));
    if (!validEmail(email)) throw new ActionError("Enter a valid email address.");
    const firmId = context.firm.id;
    const db = getDb();
    const ipHash = await requesterHash();
    const emailHash = hashVerificationCode(`portal-email:${email}`);
    const since = new Date(Date.now() - ACCESS_REQUEST_LIMITS.windowMinutes * 60_000);
    const base = { firmId, createdAt: { gte: since }, outcome: { not: "Consultation" as const } };
    const [ip, byEmail, firm] = await Promise.all([
      db.portalAccessRequest.count({ where: { ...base, ipHash } }),
      db.portalAccessRequest.count({ where: { ...base, emailHash } }),
      db.portalAccessRequest.count({ where: base }),
    ]);
    if (isRateLimited({ ip, email: byEmail, firm })) {
      await db.portalAccessRequest.create({ data: { firmId, ipHash, emailHash, outcome: "Blocked" } });
      await db.auditLog.create({ data: { firmId, action: "client_portal.access_request_blocked", entityType: "client-portal-access-request", details: { reason: "rate_limited" } } });
      return `success:${ACCESS_REQUEST_MESSAGE}`;
    }
    const matter = await db.matter.findFirst({
      where: {
        firmId,
        clientEmail: { equals: email, mode: "insensitive" },
        OR: [{ matterNumber: { equals: reference, mode: "insensitive" } }, { clientNumber: { equals: reference, mode: "insensitive" } }],
      },
      select: { id: true, responsibleId: true, clientName: true, clientSurname: true },
    });
    const record = await db.portalAccessRequest.create({ data: { firmId, ipHash, emailHash, outcome: matter ? "Sent" : "NoMatch" } });
    await db.auditLog.create({
      data: { firmId, action: matter ? "client_portal.access_request_matched" : "client_portal.access_request_unmatched", entityType: "client-portal-access-request", entityId: record.id, details: { matterId: matter?.id ?? null } },
    });
    if (!matter) {
      if (await notifyStaffOfFailure(firmId)) await db.portalAccessRequest.update({ where: { id: record.id }, data: { staffNotified: true } });
      return `success:${ACCESS_REQUEST_MESSAGE}`;
    }
    const name = `${matter.clientName} ${matter.clientSurname}`.trim();
    const account = await db.clientPortalAccount.findFirst({ where: { firmId, email, active: true }, select: { id: true } });
    try {
      if (account) {
        await sendBrandedEmail(firmId, email, "Your client portal", "Sign in to your portal", [`Hello ${name},`, "Use the button below to sign in to your client portal."], { label: "Client login", path: `/client/login?firm=${encodeURIComponent(firmId)}` });
      } else {
        await createPortalInvitation(db, { firmId, matterId: matter.id, senderId: matter.responsibleId, email, name, replacePending: true });
      }
    } catch {
      await db.auditLog.create({ data: { firmId, action: "client_portal.access_request_email_failed", entityType: "client-portal-access-request", entityId: record.id } });
    }
    return `success:${ACCESS_REQUEST_MESSAGE}`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function requestConsultation(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const slug = field(form, "slug", "Firm", 60);
    const context = await getFirmBySlug(slug);
    if (!context) throw new ActionError("This firm page is not available.");
    checkHuman(form);
    const name = field(form, "name", "Your name", 120);
    const contact = field(form, "contact", "Email or phone number", 254);
    const description = field(form, "description", "Short description", 1000);
    const firmId = context.firm.id;
    const db = getDb();
    const ipHash = await requesterHash();
    const recent = await db.portalAccessRequest.count({
      where: { firmId, ipHash, outcome: "Consultation", createdAt: { gte: new Date(Date.now() - ACCESS_REQUEST_LIMITS.windowMinutes * 60_000) } },
    });
    if (recent >= ACCESS_REQUEST_LIMITS.perIp) throw new ActionError("Too many requests from this connection. Please try again later.");
    const created = await db.consultationRequest.create({ data: { firmId, name, contact, description } });
    await db.portalAccessRequest.create({ data: { firmId, ipHash, emailHash: hashVerificationCode(`consult:${contact.toLowerCase()}`), outcome: "Consultation" } });
    await db.auditLog.create({ data: { firmId, action: "client_portal.consultation_requested", entityType: "consultation-request", entityId: created.id } });
    return "success:Thank you. The firm has your request and will contact you. This does not give you portal access.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
