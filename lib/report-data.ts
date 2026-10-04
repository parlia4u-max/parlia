import { getDb } from "@/lib/db";
import { hasPermission, permissionScope, type PermissionBearingUser } from "@/lib/permissions";
import { narrowerReportScope, quietMatterCutoff } from "@/lib/report-rules";

type ReportUser = PermissionBearingUser & { id: string; firmId: string };

export async function quietMatterScope(user: ReportUser) {
  if (!user.isOwner && (!hasPermission(user, "reports") || !hasPermission(user, "matters"))) {
    return { scope: null, responsibleIds: [] as string[] };
  }
  const scope = user.isOwner
    ? "Firm"
    : narrowerReportScope(permissionScope(user, "reports"), permissionScope(user, "matters"));
  if (scope === "Own") return { scope, responsibleIds: [user.id] };
  if (scope === "Firm") return { scope, responsibleIds: undefined };
  const directReports = await getDb().supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  });
  return { scope, responsibleIds: [user.id, ...directReports.map((item) => item.userId)] };
}

export async function findQuietMatters(user: ReportUser, days: number, now = new Date()) {
  const access = await quietMatterScope(user);
  if (!access.scope) return { scope: null, matters: [] };
  const cutoff = quietMatterCutoff(now, days);
  const matters = await getDb().matter.findMany({
    where: {
      firmId: user.firmId,
      status: "Active",
      lastActivityAt: { lt: cutoff },
      ...(access.responsibleIds ? { responsibleId: { in: access.responsibleIds } } : {}),
    },
    select: {
      id: true,
      matterNumber: true,
      clientName: true,
      clientSurname: true,
      matterType: true,
      stage: true,
      lastActivityAt: true,
      responsible: { select: { name: true, email: true } },
    },
    orderBy: [{ lastActivityAt: "asc" }, { matterNumber: "asc" }],
    take: 1000,
  });
  return { scope: access.scope, matters };
}
