"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureSetupConfiguration } from "@/lib/setup";
import { isSetupSectionKey, SETUP_SECTIONS, validateSetupValue } from "@/lib/setup-config";
import { MODULES } from "@/lib/permissions";

async function currentFirmUser() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to manage setup.");
  const user = await getDb().user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    select: { id: true, firmId: true, isOwner: true },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  return user;
}

async function requireSectionAccess(section: string) {
  const user = await currentFirmUser();
  if (!isSetupSectionKey(section)) throw new ActionError("Choose a valid setup section.");
  const definition = SETUP_SECTIONS.find((candidate) => candidate.key === section)!;
  if (definition.ownerOnly && !user.isOwner) throw new ActionError("Only the firm owner can change this setup section.");
  const db = getDb();
  const config = await ensureSetupConfiguration(user.firmId);
  if (!user.isOwner) {
    const supervisorLink = await db.supervisorLink.findFirst({
      where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
      select: { id: true },
    });
    const published = config.published as Record<string, unknown>;
    const rights = published.setupRights as { supervisors?: { userId: string; sections: string[] }[] } | undefined;
    const grant = rights?.supervisors?.find((item) => item.userId === user.id);
    if (!supervisorLink || !Array.isArray(grant?.sections) || !grant.sections.includes(section)) {
      throw new ActionError("You do not have drafting rights for this setup section.");
    }
  }
  return { user, db, section };
}

export async function saveSetupDraft(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const section = String(formData.get("section") ?? "");
    const { user, db, section: validSection } = await requireSectionAccess(section);
    const raw = String(formData.get("value") ?? "");
    if (raw.length > 100_000) throw new ActionError("Setup values cannot exceed 100 KB.");
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new ActionError("Setup form data could not be read. Reload the page and try again.");
    }
    validateSetupValue(validSection, value);
    if (validSection === "setupRights") {
      const grants = (value as { supervisors: { userId: string }[] }).supervisors;
      const supervisorIds = [...new Set(grants.map((grant) => grant.userId))];
      if (supervisorIds.length) {
        const eligible = await db.supervisorLink.findMany({
          where: { firmId: user.firmId, supervisorId: { in: supervisorIds }, supervisor: { active: true }, user: { active: true } },
          distinct: ["supervisorId"],
          select: { supervisorId: true },
        });
        if (eligible.length !== supervisorIds.length) throw new ActionError("Setup rights can only be granted to active supervisors assigned to this firm.");
      }
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${user.firmId} FOR UPDATE`;
      const current = await tx.setupConfiguration.findUnique({ where: { firmId: user.firmId } });
      if (!current) throw new ActionError("Setup is not available for this firm.");
      const draft = current.draft as Record<string, unknown>;
      await tx.setupConfiguration.update({
        where: { firmId: user.firmId },
        data: { draft: { ...draft, [validSection]: value } as never },
      });
      await tx.auditLog.create({
        data: {
          firmId: user.firmId,
          actorId: user.id,
          action: "setup.draft_saved",
          entityType: "setup",
          entityId: validSection,
        },
      });
    });
    revalidatePath("/setup");
    revalidatePath("/settings");
    revalidatePath(SETUP_SECTIONS.find((item) => item.key === validSection)!.href);
    return "success:Draft saved. Active firm settings are unchanged until the owner publishes.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function publishSetup(_state: string | null, _formData: FormData): Promise<string | null> {
  try {
    const user = await currentFirmUser();
    if (!user.isOwner) throw new ActionError("Only the firm owner can publish setup.");
    const db = getDb();
    await ensureSetupConfiguration(user.firmId);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${user.firmId} FOR UPDATE`;
      const config = await tx.setupConfiguration.findUnique({ where: { firmId: user.firmId } });
      if (!config) throw new ActionError("Setup is not available for this firm.");
      const draft = config.draft as Record<string, unknown>;
      for (const section of SETUP_SECTIONS) validateSetupValue(section.key, draft[section.key]);
      const profile = draft.firmProfile as { name: string };
      const permissionConfig = draft.permissions as { roles: { name: string; permissions: Record<string, { level: string; scope: string }> }[] };
      const setupRights = draft.setupRights as { supervisors: { userId: string }[] };
      const supervisorIds = [...new Set(setupRights.supervisors.map((grant) => grant.userId))];
      if (supervisorIds.length) {
        const eligible = await tx.supervisorLink.findMany({
          where: { firmId: user.firmId, supervisorId: { in: supervisorIds }, supervisor: { active: true }, user: { active: true } },
          distinct: ["supervisorId"],
          select: { supervisorId: true },
        });
        if (eligible.length !== supervisorIds.length) throw new ActionError("Setup rights can only be granted to active supervisors assigned to this firm.");
      }

      await tx.firm.update({ where: { id: user.firmId }, data: { name: profile.name.trim() } });
      const retainedRoleNames = permissionConfig.roles.map((role) => role.name.trim());
      const removedRoles = await tx.role.findMany({
        where: { firmId: user.firmId, name: { not: "Owner", notIn: retainedRoleNames } },
        select: { id: true, name: true, _count: { select: { users: true, invitations: true } } },
      });
      const assignedRole = removedRoles.find((role) => role._count.users > 0 || role._count.invitations > 0);
      if (assignedRole) {
        throw new ActionError(`Cannot remove the “${assignedRole.name}” role while staff or invitations still use it.`);
      }
      if (removedRoles.length) await tx.role.deleteMany({ where: { firmId: user.firmId, id: { in: removedRoles.map((role) => role.id) } } });
      for (const roleConfig of permissionConfig.roles) {
        const roleName = roleConfig.name.trim();
        let role = await tx.role.findFirst({
          where: { firmId: user.firmId, name: roleName },
          select: { id: true, name: true },
        });
        if (role?.name === "Owner") throw new ActionError("Owner permissions cannot be changed.");
        if (!role) {
          role = await tx.role.create({
            data: { firmId: user.firmId, name: roleName, isTemplate: true },
            select: { id: true, name: true },
          });
        }
        for (const module of MODULES) {
          const permission = roleConfig.permissions[module];
          await tx.rolePermission.upsert({
            where: { roleId_module: { roleId: role.id, module } },
            create: { firmId: user.firmId, roleId: role.id, module, level: permission.level as never, scope: permission.scope as never },
            update: { firmId: user.firmId, level: permission.level as never, scope: permission.scope as never },
          });
        }
      }

      await tx.setupConfiguration.update({
        where: { firmId: user.firmId },
        data: { published: draft as never, publishedAt: new Date(), version: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          firmId: user.firmId,
          actorId: user.id,
          action: "setup.published",
          entityType: "setup",
          details: { version: config.version + 1 },
        },
      });
    });
    revalidatePath("/");
    revalidatePath("/setup");
    revalidatePath("/settings/permissions");
    revalidatePath("/settings/subscription");
    return "success:Setup published. All settings are now active for this firm.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
