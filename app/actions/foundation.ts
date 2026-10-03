"use server";

import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, requireOwner } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { getDb } from "@/lib/db";
import { hashToken, normalizeEmail, randomToken, required, validEmail } from "@/lib/security";
import { canInviteStaff } from "@/lib/staff-seats";

export async function inviteStaff(_state: string | null, formData: FormData): Promise<string | null> {
  let destination = "/staff?invited=1";
  let inviteId = "";
  const owner = await requireOwner();
  try {
    const name = required(formData.get("name"), "Staff name");
    const email = normalizeEmail(required(formData.get("email"), "Email"));
    const roleId = required(formData.get("roleId"), "Role");
    if (name.length > 120) throw new ActionError("Staff names must be 120 characters or fewer.");
    if (!validEmail(email) || email.length > 254) throw new ActionError("Enter a valid email address.");
    const db = getDb();
    const role = await db.role.findFirst({ where: { id: roleId, firmId: owner.firmId, name: { not: "Owner" } } });
    if (!role) throw new ActionError("Choose a role belonging to this firm.");
    if (await db.user.findUnique({ where: { email } })) throw new ActionError("That email already has a Parlia account.");
    const pending = await db.invitation.findFirst({
      where: { firmId: owner.firmId, email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (pending) throw new ActionError("An active invitation has already been sent to that email.");
    const token = randomToken();
    const invite = await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Firm" WHERE "id" = ${owner.firmId} FOR UPDATE`;
      const firm = await tx.firm.findFirst({ where: { id: owner.firmId }, select: { staffSeatLimit: true } });
      if (!firm) throw new ActionError("This firm account is no longer available.");
      const now = new Date();
      const currentInvitation = await tx.invitation.findFirst({
        where: { firmId: owner.firmId, email, acceptedAt: null, expiresAt: { gt: now } },
      });
      if (currentInvitation) throw new ActionError("An active invitation has already been sent to that email.");
      const [activeStaff, pendingInvitations] = await Promise.all([
        tx.user.count({ where: { firmId: owner.firmId, active: true, isOwner: false } }),
        tx.invitation.count({ where: { firmId: owner.firmId, acceptedAt: null, expiresAt: { gt: now } } }),
      ]);
      if (!canInviteStaff(activeStaff, pendingInvitations, firm.staffSeatLimit)) {
        throw new ActionError("Your firm has reached its staff seat allowance. Review the firm’s subscription options before inviting another staff member.");
      }
      return tx.invitation.create({
        data: {
          firmId: owner.firmId,
          inviterId: owner.id,
          roleId,
          name,
          email,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });
    });
    inviteId = invite.id;
    try {
      await sendEmail(
        email,
        `Invitation to join ${owner.firm.name} on Parlia`,
        `Hello ${name},\n\n${owner.name} invited you to join ${owner.firm.name}.\nAccept within 7 days and set your password: ${appUrl(`/accept-invitation?token=${encodeURIComponent(token)}`)}`,
      );
    } catch (error) {
      await db.invitation.delete({ where: { id: invite.id } });
      inviteId = "";
      throw error;
    }
    await audit(owner.firmId, owner.id, "staff.invited", "invitation", invite.id, { email, role: role.name });
  } catch (error) {
    return actionErrorMessage(error);
  }
  if (inviteId) redirect(destination);
  return "Invitation was not sent.";
}

export async function assignSupervisor(_state: string | null, formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  try {
    const userId = required(formData.get("userId"), "Staff member");
    const supervisorId = required(formData.get("supervisorId"), "Supervisor");
    if (userId === supervisorId) throw new ActionError("A staff member cannot supervise themselves.");
    const db = getDb();
    const member = await db.user.findFirst({ where: { id: userId, firmId: owner.firmId, isOwner: false } });
    const supervisor = supervisorId === "none"
      ? null
      : await db.user.findFirst({ where: { id: supervisorId, firmId: owner.firmId, active: true } });
    if (!member || (supervisorId !== "none" && !supervisor)) throw new ActionError("Choose active people from this firm.");
    if (supervisor) {
      const visited = new Set<string>();
      let ancestorId: string | null = supervisor.id;
      while (ancestorId) {
        if (ancestorId === member.id) throw new ActionError("That assignment would create a supervisor cycle.");
        if (visited.has(ancestorId)) throw new ActionError("The current supervisor chain contains a cycle.");
        visited.add(ancestorId);
        const link: {
          supervisorId: string;
          user: { firmId: string };
          supervisor: { firmId: string };
        } | null = await db.supervisorLink.findFirst({
          where: { userId: ancestorId, firmId: owner.firmId },
          select: {
            supervisorId: true,
            user: { select: { firmId: true } },
            supervisor: { select: { firmId: true } },
          },
        });
        ancestorId = link?.user.firmId === owner.firmId && link.supervisor.firmId === owner.firmId
          ? link.supervisorId
          : null;
      }
    }
    await db.$transaction(async (tx) => {
      await tx.supervisorLink.deleteMany({ where: { userId, firmId: owner.firmId } });
      if (supervisorId !== "none") {
        await tx.supervisorLink.create({ data: { userId, supervisorId, firmId: owner.firmId } });
      }
    });
    await audit(owner.firmId, owner.id, "supervisor.assigned", "user", userId, { supervisorId: supervisorId === "none" ? null : supervisorId });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/staff");
}

export async function toggleStaff(_state: string | null, formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  try {
    const userId = required(formData.get("userId"), "Staff member");
    const db = getDb();
    const member = await db.user.findFirst({ where: { id: userId, firmId: owner.firmId, isOwner: false } });
    if (!member) throw new ActionError("Staff member not found.");
    await db.$transaction(async (tx) => {
      const unlinkedStaff = member.active
        ? await tx.supervisorLink.findMany({ where: { supervisorId: userId, firmId: owner.firmId }, select: { userId: true } })
        : [];
      await tx.user.update({ where: { id: member.id }, data: { active: !member.active } });
      if (member.active) {
        await tx.session.deleteMany({ where: { userId, firmId: owner.firmId } });
        await tx.supervisorLink.deleteMany({ where: { supervisorId: userId, firmId: owner.firmId } });
      }
      await tx.auditLog.create({
        data: {
          firmId: owner.firmId,
          actorId: owner.id,
          action: member.active ? "staff.deactivated" : "staff.activated",
          entityType: "user",
          entityId: member.id,
          details: member.active ? { unlinkedStaff: unlinkedStaff.map((link) => link.userId) } : undefined,
        },
      });
    });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/staff");
}
