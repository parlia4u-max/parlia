"use server";

import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, requireOwner } from "@/lib/auth";
import { appUrl, sendEmail } from "@/lib/email";
import { getDb } from "@/lib/db";
import { MODULES, type ModuleKey, type PermissionLevel, type PermissionScope } from "@/lib/permissions";
import { hashToken, normalizeEmail, randomToken, required, validEmail } from "@/lib/security";

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
    const invite = await db.invitation.create({
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

export async function saveRole(_state: string | null, formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  try {
    const name = required(formData.get("name"), "Role name");
    if (name.length > 80) throw new ActionError("Role names must be 80 characters or fewer.");
    if (name.toLowerCase() === "owner") throw new ActionError("Owner is a reserved role name.");
    const roleId = formData.get("roleId");
    const db = getDb();
    if (roleId) {
      const role = await db.role.findFirst({ where: { id: String(roleId), firmId: owner.firmId, name: { not: "Owner" } } });
      if (!role) throw new ActionError("Role not found.");
      await db.role.update({ where: { id: role.id }, data: { name } });
      await audit(owner.firmId, owner.id, "role.renamed", "role", role.id, { name });
    } else {
      const role = await db.role.create({ data: { firmId: owner.firmId, name, isTemplate: false } });
      await db.rolePermission.createMany({
        data: MODULES.map((module) => ({ roleId: role.id, firmId: owner.firmId, module, level: "None", scope: "Own" })),
      });
      await audit(owner.firmId, owner.id, "role.created", "role", role.id, { name });
    }
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/settings/permissions");
}

export async function savePermission(_state: string | null, formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  try {
    const roleId = required(formData.get("roleId"), "Role");
    const moduleValue = required(formData.get("module"), "Module");
    const levelValue = required(formData.get("level"), "Permission level");
    const scopeValue = required(formData.get("scope"), "Permission scope");
    if (!MODULES.includes(moduleValue as ModuleKey)) throw new ActionError("Invalid module.");
    if (!["None", "View", "Edit"].includes(levelValue) || !["Own", "Team", "Firm"].includes(scopeValue)) {
      throw new ActionError("Invalid permission level or scope.");
    }
    const module = moduleValue as ModuleKey;
    const level = levelValue as PermissionLevel;
    const scope = scopeValue as PermissionScope;
    const db = getDb();
    const role = await db.role.findFirst({ where: { id: roleId, firmId: owner.firmId, name: { not: "Owner" } } });
    if (!role) throw new ActionError("Role not found.");
    await db.rolePermission.upsert({
      where: { roleId_module: { roleId, module } },
      create: { roleId, firmId: owner.firmId, module, level, scope },
      update: { firmId: owner.firmId, level, scope },
    });
    await audit(owner.firmId, owner.id, "permission.updated", "role", roleId, { module, level, scope });
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/settings/permissions");
}
