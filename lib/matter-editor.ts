import { ActionError } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord } from "@/lib/matter-rules";

export async function authorizedMatterEditor(matterId: string) {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to continue.");
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } }, firm: { select: { name: true } } },
  });
  if (!user || !hasPermission(user, "matters", "Edit")) throw new ActionError("Matter edit permission is required.");
  const matter = await db.matter.findFirst({ where: { id: matterId, firmId: user.firmId }, select: { id: true, matterNumber: true, responsibleId: true, clientEmail: true, clientName: true, clientSurname: true } });
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
