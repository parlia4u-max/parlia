import { notFound } from "next/navigation";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function getHrPageUser() {
  const session = await getCurrentUser();
  if (!session) notFound();
  const user = await getDb().user.findFirst({
    where: { id: session.id, firmId: session.firmId, active: true },
    include: { role: { include: { permissions: true } }, firm: true },
  });
  if (!user || !hasPermission(user, "people", "View")) notFound();
  return user;
}

export async function canReadHrTarget(user: Awaited<ReturnType<typeof getHrPageUser>>, targetId: string) {
  if (user.isOwner || user.id === targetId) return true;
  if (!hasPermission(user, "people", "View")) return false;
  if (permissionScope(user, "people") === "Firm") return true;
  if (permissionScope(user, "people") !== "Team") return false;
  const relation = await getDb().supervisorLink.findFirst({
    where: { firmId: user.firmId, supervisorId: user.id, userId: targetId, supervisor: { active: true }, user: { active: true } },
    select: { id: true },
  });
  return Boolean(relation);
}

export async function getHrProfile(targetId: string) {
  const user = await getHrPageUser();
  if (!(await canReadHrTarget(user, targetId))) notFound();
  const db = getDb();
  const target = await db.user.findFirst({
    where: { id: targetId, firmId: user.firmId, active: true },
    select: { id: true, name: true, email: true, createdAt: true },
  });
  if (!target) notFound();
  const config = await db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } });
  const published = config?.published && typeof config.published === "object" ? config.published as { hrChecklist?: { name: string; required: boolean }[] } : {};
  const items = Array.isArray(published.hrChecklist) ? published.hrChecklist : [];
  const profile = await db.staffProfile.upsert({
    where: { userId_firmId: { userId: targetId, firmId: user.firmId } },
    create: { userId: targetId, firmId: user.firmId },
    update: {},
  });
  for (const item of items) {
    if (typeof item?.name !== "string" || !item.name.trim()) continue;
    await db.onboardingChecklistItem.upsert({
      where: { profileId_name: { profileId: profile.id, name: item.name } },
      create: { firmId: user.firmId, profileId: profile.id, name: item.name, required: Boolean(item.required) },
      update: { required: Boolean(item.required) },
    });
  }
  const [savedProfile, documents, checklist] = await Promise.all([
    db.staffProfile.findFirst({ where: { id: profile.id, firmId: user.firmId }, select: { id: true, userId: true, nextOfKinCiphertext: true, nextOfKinIv: true, nextOfKinTag: true, employmentStartDate: true, onboardingDueAt: true } }),
    db.hRDocument.findMany({ where: { firmId: user.firmId, subjectId: targetId }, select: { id: true, encryptedMetadata: true, metadataIv: true, metadataAuthTag: true, locked: true, resubmissionRequested: true, submittedAt: true }, orderBy: { submittedAt: "desc" } }),
    db.onboardingChecklistItem.findMany({ where: { firmId: user.firmId, profileId: profile.id, name: { in: items.map((item) => item.name).filter((name): name is string => typeof name === "string") } }, orderBy: { name: "asc" } }),
  ]);
  return { user, target, profile: savedProfile!, documents, checklist };
}
