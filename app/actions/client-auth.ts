"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { createClientSession, signOutClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { createPortalInvitation } from "@/lib/portal-invites";
import { canAccessRecord } from "@/lib/matter-rules";
import { hashPassword, hashToken, hashVerificationCode, normalizeEmail, randomVerificationCode, requiredSecret, validEmail, verifyPassword } from "@/lib/security";

function text(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

async function authorizedMatterEditor(matterId: string) {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to manage client portal access.");
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } }, firm: { select: { name: true } } },
  });
  if (!user || !hasPermission(user, "matters", "Edit")) throw new ActionError("Matter edit permission is required to manage client portal access.");
  const matter = await db.matter.findFirst({ where: { id: matterId, firmId: user.firmId }, select: { id: true, matterNumber: true, responsibleId: true, clientName: true, clientSurname: true, clientEmail: true } });
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

export async function inviteClientToMatter(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = text(form, "matterId", "Matter", 80);
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    if (!matter.clientEmail) throw new ActionError("Add a verified client email to the matter before sending a portal invitation.");
    const email = normalizeEmail(matter.clientEmail);
    if (!validEmail(email) || email.length > 254) throw new ActionError("The client email on this matter is not valid.");
    const name = `${matter.clientName} ${matter.clientSurname}`.trim();
    const existing = await db.clientPortalAccount.findFirst({
      where: { firmId: user.firmId, email, active: true },
      select: { id: true },
    });
    if (existing) {
      const access = await db.$transaction(async (tx) => {
        const result = await tx.clientMatterAccess.upsert({
          where: { firmId_clientId_matterId: { firmId: user.firmId, clientId: existing.id, matterId: matter.id } },
          create: { firmId: user.firmId, clientId: existing.id, matterId: matter.id },
          update: { revokedAt: null },
          select: { id: true },
        });
        await tx.auditLog.create({
          data: { firmId: user.firmId, actorId: user.id, action: "client_portal.matter_access_granted", entityType: "client-matter-access", entityId: result.id, details: { matterId: matter.id, clientId: existing.id, email } },
        });
        return result;
      });
      try {
        await sendEmail(email, `${user.firm.name}: matter access added`, `Hello ${name},\n\n${user.firm.name} has connected your portal account to matter ${matter.matterNumber}. Sign in to view updates shared with you: ${appUrl(`/client/login?firm=${encodeURIComponent(user.firmId)}`)}`);
      } catch (error) {
        await db.auditLog.create({
          data: { firmId: user.firmId, actorId: user.id, action: "client_portal.access_notice_failed", entityType: "client-matter-access", entityId: access.id, details: { matterId: matter.id, clientId: existing.id } },
        });
        revalidatePath(`/matters/${matter.id}`);
        return `Matter access was granted, but the email notice failed: ${actionErrorMessage(error)}`;
      }
      revalidatePath(`/matters/${matter.id}`);
      return "success:Existing client portal account connected to this matter.";
    }

    const invitation = await createPortalInvitation(db, { firmId: user.firmId, matterId: matter.id, senderId: user.id, email, name, replacePending: false });
    if (!invitation) throw new ActionError("An active client portal invitation already exists for this matter.");    await db.auditLog.create({
      data: { firmId: user.firmId, actorId: user.id, action: "client_portal.invitation_sent", entityType: "client-portal-invitation", entityId: invitation.id, details: { matterId: matter.id, email } },
    });
    revalidatePath(`/matters/${matter.id}`);
    return "success:Client portal invitation sent.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function acceptClientInvitation(_state: string | null, form: FormData): Promise<string | null> {
  let accepted = false;
  try {
    const token = text(form, "token", "Invitation link", 200);
    const password = requiredSecret(form.get("password"), "Password");
    const passwordHash = await hashPassword(password);
    const db = getDb();
    const invitation = await db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClientPortalInvitation" WHERE "tokenHash" = ${hashToken(token)} FOR UPDATE`;
      if (!rows.length) throw new ActionError("This client invitation is invalid or expired.");
      const current = await tx.clientPortalInvitation.findFirst({
        where: { id: rows[0].id, tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, firmId: true, matterId: true, email: true, name: true },
      });
      if (!current) throw new ActionError("This client invitation is invalid or expired.");
      const currentAccount = await tx.clientPortalAccount.findUnique({
        where: { firmId_email: { firmId: current.firmId, email: current.email } },
        select: { id: true, active: true },
      });
      if (currentAccount?.active) throw new ActionError("This portal account is already active. Sign in to continue.");
      const account = await tx.clientPortalAccount.upsert({
        where: { firmId_email: { firmId: current.firmId, email: current.email } },
        create: { firmId: current.firmId, email: current.email, name: current.name, passwordHash, active: true },
        update: { name: current.name, passwordHash, active: true },
        select: { id: true },
      });
      await tx.clientMatterAccess.upsert({
        where: { firmId_clientId_matterId: { firmId: current.firmId, clientId: account.id, matterId: current.matterId } },
        create: { firmId: current.firmId, clientId: account.id, matterId: current.matterId },
        update: { revokedAt: null },
      });
      const used = await tx.clientPortalInvitation.updateMany({
        where: { id: current.id, firmId: current.firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date(), clientId: account.id },
      });
      if (used.count !== 1) throw new ActionError("This client invitation has already been used.");
      await tx.auditLog.create({
        data: { firmId: current.firmId, actorId: null, action: "client_portal.account_activated", entityType: "client-portal-account", entityId: account.id, details: { invitationId: current.id, matterId: current.matterId } },
      });
      return account;
    });
    accepted = Boolean(invitation.id);
  } catch (error) {
    return actionErrorMessage(error);
  }
  if (accepted) redirect("/client/login?created=1");
  return "Invitation could not be accepted.";
}

export async function loginClient(_state: string | null, form: FormData): Promise<string | null> {
  let destination = "";
  let email = "";
  try {
    const firmId = text(form, "firmId", "Firm code", 80);
    email = normalizeEmail(text(form, "email", "Email", 254));
    const password = requiredSecret(form.get("password"), "Password");
    if (!validEmail(email)) throw new ActionError("Email or password is incorrect.");
    const db = getDb();
    const client = await db.clientPortalAccount.findFirst({
      where: { firmId, email, active: true },
      select: { id: true, firmId: true, email: true, passwordHash: true, name: true },
    });
    if (!client?.passwordHash || !(await verifyPassword(password, client.passwordHash))) throw new ActionError("Firm code, email or password is incorrect.");
    const code = randomVerificationCode();
    const codeHash = hashVerificationCode(code);
    const now = new Date();
    const challenge = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClientPortalAccount" WHERE "id" = ${client.id} AND "firmId" = ${client.firmId} FOR UPDATE`;
      const active = await tx.clientPortalChallenge.findFirst({
        where: { firmId: client.firmId, clientId: client.id, purpose: "Login", expiresAt: { gt: now }, attempts: { lt: 5 } },
        orderBy: { createdAt: "desc" },
        select: { id: true },
      });
      if (active && now.getTime() - (await tx.clientPortalChallenge.findUniqueOrThrow({ where: { id: active.id }, select: { createdAt: true } })).createdAt.getTime() < 60_000) {
        return { id: active.id, send: false };
      }
      await tx.clientPortalChallenge.deleteMany({ where: { firmId: client.firmId, clientId: client.id, purpose: "Login" } });
      const created = await tx.clientPortalChallenge.create({
        data: { firmId: client.firmId, clientId: client.id, purpose: "Login", codeHash, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) },
        select: { id: true },
      });
      return { id: created.id, send: true };
    });
    destination = `/client/verify?firm=${encodeURIComponent(client.firmId)}&email=${encodeURIComponent(client.email)}`;
    if (challenge.send) {
      try {
        await sendEmail(client.email, "Your Parlia client portal sign-in code", `Hello ${client.name},\n\nYour sign-in code is ${code}. It expires in 10 minutes. If you did not request it, you can ignore this message.`);
      } catch (error) {
        await db.clientPortalChallenge.deleteMany({ where: { id: challenge.id, firmId: client.firmId } });
        throw error;
      }
    }
    await db.auditLog.create({
      data: { firmId: client.firmId, actorId: null, action: "client_portal.login_code_requested", entityType: "client-portal-account", entityId: client.id },
    });
  } catch (error) {
    return actionErrorMessage(error);
  }
  if (destination) redirect(destination);
  return "Sign-in could not be started.";
}

export async function verifyClientLogin(_state: string | null, form: FormData): Promise<string | null> {
  let clientId = "";
  let firmId = "";
  try {
    firmId = text(form, "firmId", "Firm code", 80);
    const email = normalizeEmail(text(form, "email", "Email", 254));
    const code = text(form, "code", "Verification code", 6);
    if (!/^\d{6}$/.test(code)) throw new ActionError("The verification code is invalid or expired.");
    const db = getDb();
    const client = await db.clientPortalAccount.findFirst({ where: { firmId, email, active: true }, select: { id: true } });
    if (!client) throw new ActionError("The verification code is invalid or expired.");
    const consumed = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClientPortalAccount" WHERE "id" = ${client.id} AND "firmId" = ${firmId} FOR UPDATE`;
      const challenge = await tx.clientPortalChallenge.findFirst({
        where: { firmId, clientId: client.id, purpose: "Login", codeHash: hashVerificationCode(code), expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge) {
        await tx.clientPortalChallenge.updateMany({
          where: { firmId, clientId: client.id, purpose: "Login", expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
          data: { attempts: { increment: 1 } },
        });
        await tx.clientPortalChallenge.deleteMany({ where: { firmId, clientId: client.id, purpose: "Login", attempts: { gte: 5 } } });
        return false;
      }
      const removed = await tx.clientPortalChallenge.deleteMany({
        where: { id: challenge.id, firmId, clientId: client.id, purpose: "Login", codeHash: hashVerificationCode(code), expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      });
      return removed.count === 1;
    });
    if (!consumed) throw new ActionError("The verification code is invalid or expired.");
    clientId = client.id;
  } catch (error) {
    return actionErrorMessage(error);
  }
  await createClientSession(clientId, firmId);
  await getDb().auditLog.create({
    data: { firmId, actorId: null, action: "client_portal.session_created", entityType: "client-portal-account", entityId: clientId },
  });
  redirect("/client");
}

export async function requestClientPasswordReset(_state: string | null, form: FormData): Promise<string | null> {
  let destination = "";
  try {
    const firmId = text(form, "firmId", "Firm code", 80);
    const email = normalizeEmail(text(form, "email", "Email", 254));
    if (!validEmail(email)) throw new ActionError("Enter a valid email address.");
    const db = getDb();
    const client = await db.clientPortalAccount.findFirst({
      where: { firmId, email, active: true },
      select: { id: true, firmId: true, email: true, name: true },
    });
    destination = `/client/reset-password?firm=${encodeURIComponent(firmId)}&email=${encodeURIComponent(email)}&sent=1`;
    if (client) {
      const code = randomVerificationCode();
      const codeHash = hashVerificationCode(code);
      const now = new Date();
      const challenge = await db.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClientPortalAccount" WHERE "id" = ${client.id} AND "firmId" = ${firmId} FOR UPDATE`;
        const recent = await tx.clientPortalChallenge.findFirst({
          where: { firmId, clientId: client.id, purpose: "PasswordReset", expiresAt: { gt: now }, attempts: { lt: 5 } },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        });
        if (recent && now.getTime() - recent.createdAt.getTime() < 60_000) return { id: recent.id, send: false };
        await tx.clientPortalChallenge.deleteMany({ where: { firmId, clientId: client.id, purpose: "PasswordReset" } });
        const created = await tx.clientPortalChallenge.create({
          data: { firmId, clientId: client.id, purpose: "PasswordReset", codeHash, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) },
          select: { id: true },
        });
        return { id: created.id, send: true };
      });
      if (challenge.send) {
        try {
          await sendEmail(client.email, "Your Parlia client portal password reset code", `Hello ${client.name},\n\nYour password reset code is ${code}. It expires in 10 minutes. If you did not request this, you can ignore the message.`);
        } catch (error) {
          await db.clientPortalChallenge.deleteMany({ where: { id: challenge.id, firmId, clientId: client.id, purpose: "PasswordReset" } });
          throw error;
        }
      }
      await db.auditLog.create({
        data: { firmId, actorId: null, action: "client_portal.password_reset_requested", entityType: "client-portal-account", entityId: client.id },
      });
    }
  } catch (error) {
    return actionErrorMessage(error);
  }
  if (destination) redirect(destination);
  return "If the account is active, a reset code will be sent.";
}

export async function resetClientPassword(_state: string | null, form: FormData): Promise<string | null> {
  let redirectTo = "";
  try {
    const firmId = text(form, "firmId", "Firm code", 80);
    const email = normalizeEmail(text(form, "email", "Email", 254));
    const code = text(form, "code", "Reset code", 6);
    const passwordHash = await hashPassword(requiredSecret(form.get("password"), "New password"));
    if (!/^\d{6}$/.test(code)) throw new ActionError("The reset code is invalid or expired.");
    const db = getDb();
    const client = await db.clientPortalAccount.findFirst({ where: { firmId, email, active: true }, select: { id: true } });
    if (!client) throw new ActionError("The reset code is invalid or expired.");
    const changed = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "ClientPortalAccount" WHERE "id" = ${client.id} AND "firmId" = ${firmId} FOR UPDATE`;
      const challenge = await tx.clientPortalChallenge.findFirst({
        where: { firmId, clientId: client.id, purpose: "PasswordReset", codeHash: hashVerificationCode(code), expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        orderBy: { createdAt: "desc" },
      });
      if (!challenge) {
        await tx.clientPortalChallenge.updateMany({
          where: { firmId, clientId: client.id, purpose: "PasswordReset", expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
          data: { attempts: { increment: 1 } },
        });
        await tx.clientPortalChallenge.deleteMany({ where: { firmId, clientId: client.id, purpose: "PasswordReset", attempts: { gte: 5 } } });
        return false;
      }
      const consumed = await tx.clientPortalChallenge.deleteMany({
        where: { id: challenge.id, firmId, clientId: client.id, purpose: "PasswordReset", codeHash: hashVerificationCode(code), expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
      });
      if (consumed.count !== 1) return false;
      await tx.clientPortalAccount.updateMany({ where: { id: client.id, firmId, active: true }, data: { passwordHash } });
      await tx.clientPortalSession.deleteMany({ where: { firmId, clientId: client.id } });
      await tx.auditLog.create({
        data: { firmId, actorId: null, action: "client_portal.password_reset_completed", entityType: "client-portal-account", entityId: client.id },
      });
      return true;
    });
    if (!changed) throw new ActionError("The reset code is invalid or expired.");
    redirectTo = `/client/login?reset=1&firm=${encodeURIComponent(firmId)}`;
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(redirectTo);
}

export async function logoutClient() {
  await signOutClient();
  redirect("/client/login");
}
