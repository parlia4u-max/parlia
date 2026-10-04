"use server";

import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, createSession, signOut } from "@/lib/auth";
import { appUrl, requireEmailConfiguration, sendEmail } from "@/lib/email";
import { getDb } from "@/lib/db";
import { MODULES } from "@/lib/permissions";
import { createInitialSetupConfig } from "@/lib/setup-config";
import { hashPassword, hashToken, hashVerificationCode, normalizeEmail, randomToken, randomVerificationCode, required, requiredSecret, validEmail, verifyPassword } from "@/lib/security";

const templates = [
  { name: "Lawyer", permissions: { matters: ["Edit", "Firm"], tasks: ["Edit", "Own"], calendar: ["Edit", "Firm"], attendance: ["Edit", "Team"], people: ["View", "Firm"], reports: ["View", "Firm"] } },
  { name: "Candidate attorney", permissions: { matters: ["Edit", "Team"], tasks: ["Edit", "Own"], calendar: ["View", "Team"], attendance: ["Edit", "Own"], people: ["View", "Own"] } },
  { name: "Admin", permissions: { matters: ["View", "Firm"], tasks: ["View", "Firm"], calendar: ["View", "Firm"], people: ["Edit", "Firm"], reports: ["View", "Firm"], settings: ["Edit", "Firm"] } },
  { name: "Accounts", permissions: { matters: ["View", "Firm"], reports: ["View", "Firm"], accounts: ["Edit", "Firm"] } },
  { name: "Custom", permissions: {} },
] as const;

async function issueOwnerCode(db: ReturnType<typeof getDb>, userId: string, firmId: string, action: string) {
  const now = new Date();
  const eligibleSince = new Date(now.getTime() - 60 * 1000);
  const code = randomVerificationCode();
  const codeHash = hashVerificationCode(code);
  return db.$transaction(async (tx) => {
    const reserved = await tx.user.updateMany({
      where: {
        id: userId,
        firmId,
        isOwner: true,
        active: true,
        OR: [{ verificationSentAt: null }, { verificationSentAt: { lt: eligibleSince } }],
      },
      data: { verificationSentAt: now },
    });
    if (reserved.count !== 1) {
      const current = await tx.loginChallenge.findFirst({
        where: { userId, firmId, expiresAt: { gt: now }, attempts: { lt: 5 } },
      });
      if (current) return null;
      throw new ActionError("Please wait one minute before requesting another verification code.");
    }
    await tx.loginChallenge.deleteMany({ where: { userId, firmId } });
    await tx.loginChallenge.create({
      data: { userId, firmId, codeHash, expiresAt: new Date(now.getTime() + 10 * 60 * 1000) },
    });
    await tx.auditLog.create({
      data: { firmId, actorId: userId, action, entityType: "user", entityId: userId },
    });
    return code;
  });
}

function actionError(error: unknown) {
  return actionErrorMessage(error);
}

export async function createOwner(_state: string | null, formData: FormData): Promise<string | null> {
  let ownerEmail = "";
  try {
    const firmName = required(formData.get("firmName"), "Firm name");
    const name = required(formData.get("name"), "Your name");
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    ownerEmail = email;
    const password = requiredSecret(formData.get("password"), "Password");
    if (firmName.length > 120 || name.length > 120) throw new ActionError("Firm and owner names must be 120 characters or fewer.");
    if (!validEmail(email) || email.length > 254) throw new ActionError("Enter a valid email address.");
    requireEmailConfiguration();
    hashVerificationCode("configuration-check");
    const passwordHash = await hashPassword(password);
    const db = getDb();
    if (await db.user.findUnique({ where: { email } })) throw new ActionError("An account with this email already exists.");
    const code = randomVerificationCode();
    const codeHash = hashVerificationCode(code);
    await db.$transaction(async (tx) => {
      const firm = await tx.firm.create({ data: { name: firmName } });
      const setupDefaults = createInitialSetupConfig(firmName);
      await tx.setupConfiguration.create({
        data: { firmId: firm.id, draft: setupDefaults as never, published: setupDefaults as never },
      });
      const ownerRole = await tx.role.create({ data: { firmId: firm.id, name: "Owner", isTemplate: true } });
      const user = await tx.user.create({
        data: {
          firmId: firm.id,
          roleId: ownerRole.id,
          name,
          email,
          passwordHash,
          isOwner: true,
          verificationSentAt: new Date(),
        },
      });
      for (const template of templates) {
        const role = await tx.role.create({ data: { firmId: firm.id, name: template.name, isTemplate: true } });
        await tx.rolePermission.createMany({
          data: MODULES.map((module) => {
            const permission = template.permissions[module as keyof typeof template.permissions];
            return {
              firmId: firm.id,
              roleId: role.id,
              module,
              level: permission?.[0] ?? "None",
              scope: permission?.[1] ?? "Own",
            };
          }),
        });
      }
      await tx.loginChallenge.create({
        data: { userId: user.id, firmId: firm.id, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      });
      await tx.auditLog.create({
        data: { firmId: firm.id, actorId: user.id, action: "owner.created", entityType: "user", entityId: user.id },
      });
      return user;
    });
    try {
      await sendEmail(email, "Your Parlia verification code", `Your Parlia verification code is ${code}. It expires in 10 minutes.`);
    } catch (error) {
      return `${actionError(error)} Your firm is saved. Sign in to request a new verification code.`;
    }
  } catch (error) {
    return actionError(error);
  }
  redirect(`/owner-account?email=${encodeURIComponent(ownerEmail)}&mode=signup`);
}

export async function login(_state: string | null, formData: FormData): Promise<string | null> {
  let destination = "/";
  try {
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    const password = requiredSecret(formData.get("password"), "Password");
    const db = getDb();
    const user = await db.user.findUnique({ where: { email } });
    if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
      throw new ActionError("Email or password is incorrect.");
    }
    if (user.isOwner) {
      requireEmailConfiguration();
      hashVerificationCode("configuration-check");
      const code = await issueOwnerCode(db, user.id, user.firmId, "owner.verification_requested");
      if (code) {
        await sendEmail(email, "Your Parlia sign-in code", `Your Parlia sign-in code is ${code}. It expires in 10 minutes.`);
      } else {
        destination = `/owner-account?email=${encodeURIComponent(email)}&mode=login&recent=1`;
      }
      if (code) destination = `/owner-account?email=${encodeURIComponent(email)}&mode=login`;
    } else {
      await createSession(user.id, user.firmId);
      await audit(user.firmId, user.id, "session.created", "session");
    }
  } catch (error) {
    return actionError(error);
  }
  redirect(destination);
}

export async function resendOwnerCode(_state: string | null, formData: FormData): Promise<string | null> {
  let wasSent = false;
  try {
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    const user = await getDb().user.findUnique({ where: { email } });
    if (!user?.isOwner || !user.active) throw new ActionError("No active owner account was found for that email.");
    requireEmailConfiguration();
    hashVerificationCode("configuration-check");
    const db = getDb();
    const code = await issueOwnerCode(db, user.id, user.firmId, "owner.verification_resent");
    if (code) {
      await sendEmail(email, "Your Parlia verification code", `Your Parlia verification code is ${code}. It expires in 10 minutes.`);
      wasSent = true;
    }
  } catch (error) {
    return actionError(error);
  }
  return wasSent
    ? "success:A new verification code was sent."
    : "success:A recent code is still active. If it has not arrived, wait one minute and request another.";
}

export async function verifyOwnerCode(_state: string | null, formData: FormData): Promise<string | null> {
  let userId = "";
  try {
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    const code = required(formData.get("code"), "Verification code");
    if (!/^\d{6}$/.test(code)) throw new ActionError("The verification code is invalid or expired.");
    const user = await getDb().user.findUnique({ where: { email } });
    if (!user?.isOwner || !user.active) throw new ActionError("The verification code is invalid or expired.");
    userId = user.id;
    const db = getDb();
    const challenge = await db.loginChallenge.findFirst({
      where: {
        userId: user.id,
        firmId: user.firmId,
        codeHash: hashVerificationCode(code),
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
    });
    if (!challenge) {
      await db.loginChallenge.updateMany({
        where: { userId: user.id, firmId: user.firmId, expiresAt: { gt: new Date() }, attempts: { lt: 5 } },
        data: { attempts: { increment: 1 } },
      });
      await db.loginChallenge.deleteMany({ where: { userId: user.id, firmId: user.firmId, attempts: { gte: 5 } } });
      throw new ActionError("The verification code is invalid or expired.");
    }
    const consumed = await db.loginChallenge.deleteMany({
      where: {
        id: challenge.id,
        userId: user.id,
        firmId: user.firmId,
        codeHash: hashVerificationCode(code),
        expiresAt: { gt: new Date() },
        attempts: { lt: 5 },
      },
    });
    if (consumed.count !== 1) throw new ActionError("The verification code is invalid or expired.");
    await createSession(user.id, user.firmId);
    await audit(user.firmId, user.id, "session.created", "session");
  } catch (error) {
    return actionError(error);
  }
  if (userId) redirect("/");
  return "The verification code is invalid or expired.";
}

export async function logout() {
  await signOut();
  redirect("/login");
}

export async function requestPasswordReset(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    if (!validEmail(email)) throw new ActionError("Enter a valid email address.");
    const user = await getDb().user.findUnique({ where: { email } });
    if (user?.active) {
      requireEmailConfiguration();
      const token = randomToken();
      const reset = await getDb().passwordReset.create({
        data: { userId: user.id, firmId: user.firmId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      });
      try {
        await sendEmail(email, "Reset your Parlia password", `Use this single-use link within one hour: ${appUrl(`/reset-password?token=${encodeURIComponent(token)}`)}`);
      } catch (error) {
        await getDb().passwordReset.deleteMany({ where: { id: reset.id, firmId: user.firmId } });
        throw error;
      }
    }
  } catch (error) {
    return actionError(error);
  }
  redirect("/forgot-password?sent=1");
}

export async function resetPassword(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const token = required(formData.get("token"), "Reset token");
    const password = requiredSecret(formData.get("password"), "New password");
    const passwordHash = await hashPassword(password);
    const db = getDb();
    const reset = await db.passwordReset.findFirst({
      where: { tokenHash: hashToken(token), expiresAt: { gt: new Date() } },
      include: { user: true },
    });
    if (!reset) throw new ActionError("This password reset link is invalid or has expired.");
    await db.$transaction(async (tx) => {
      const consumed = await tx.passwordReset.deleteMany({
        where: {
          id: reset.id,
          userId: reset.userId,
          firmId: reset.firmId,
          tokenHash: hashToken(token),
          expiresAt: { gt: new Date() },
        },
      });
      if (consumed.count !== 1) throw new ActionError("This password reset link is invalid or has expired.");
      await tx.user.update({ where: { id: reset.userId, firmId: reset.firmId }, data: { passwordHash } });
      await tx.session.deleteMany({ where: { userId: reset.userId, firmId: reset.firmId } });
      await tx.loginChallenge.deleteMany({ where: { userId: reset.userId, firmId: reset.firmId } });
      await tx.passwordReset.deleteMany({ where: { userId: reset.userId, firmId: reset.firmId } });
      await tx.auditLog.create({
        data: { firmId: reset.user.firmId, actorId: reset.userId, action: "password.reset", entityType: "user", entityId: reset.userId },
      });
    });
  } catch (error) {
    return actionError(error);
  }
  redirect("/login?reset=1");
}

export async function acceptInvitation(_state: string | null, formData: FormData): Promise<string | null> {
  let userId = "";
  try {
    const token = required(formData.get("token"), "Invitation token");
    const password = requiredSecret(formData.get("password"), "Password");
    const passwordHash = await hashPassword(password);
    const db = getDb();
    const invite = await db.invitation.findFirst({
      where: { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!invite) throw new ActionError("This invitation link is invalid or has expired.");
    const user = await db.$transaction(async (tx) => {
      const claimed = await tx.invitation.updateMany({
        where: { id: invite.id, firmId: invite.firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) throw new ActionError("This invitation link is invalid or has expired.");
      const member = await tx.user.create({
        data: { firmId: invite.firmId, roleId: invite.roleId, name: invite.name, email: invite.email, passwordHash },
      });
      await tx.auditLog.create({
        data: { firmId: invite.firmId, actorId: member.id, action: "invitation.accepted", entityType: "user", entityId: member.id },
      });
      return member;
    });
    userId = user.id;
    await createSession(user.id, user.firmId);
  } catch (error) {
    return actionError(error);
  }
  if (userId) redirect("/");
  return "This invitation link is invalid or has expired.";
}
