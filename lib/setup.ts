import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { SETUP_SECTIONS, createInitialSetupConfig } from "@/lib/setup-config";

export async function ensureSetupConfiguration(firmId: string) {
  const db = getDb();
  const firm = await db.firm.findUnique({ where: { id: firmId }, select: { id: true, name: true } });
  if (!firm) notFound();
  const defaults = createInitialSetupConfig(firm.name);
  const config = await db.setupConfiguration.upsert({
    where: { firmId },
    create: { firmId, draft: defaults as never, published: defaults as never },
    update: {},
  });
  // Firms set up before a section existed receive its defaults so publishing stays valid.
  const draft = config.draft as Record<string, unknown>;
  const published = config.published as Record<string, unknown>;
  const missing = SETUP_SECTIONS.map((section) => section.key).filter((key) => draft[key] === undefined || published[key] === undefined);
  if (!missing.length) return config;
  const fill = (current: Record<string, unknown>) => ({ ...Object.fromEntries(missing.map((key) => [key, (defaults as Record<string, unknown>)[key]])), ...current });
  return db.setupConfiguration.update({
    where: { firmId },
    data: { draft: fill(draft) as never, published: fill(published) as never },
  });
}

export async function getSetupPageContext(section?: string) {
  const sessionUser = await requireUser();
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    select: { id: true, firmId: true, isOwner: true, name: true },
  });
  if (!user) notFound();
  const config = await ensureSetupConfiguration(user.firmId);
  if (section) {
    const definition = SETUP_SECTIONS.find((candidate) => candidate.key === section);
    if (!definition) notFound();
    if (!user.isOwner) {
      if (definition.ownerOnly) notFound();
      const supervisorLink = await db.supervisorLink.findFirst({
        where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
        select: { id: true },
      });
      const published = config.published as Record<string, unknown>;
      const rights = published.setupRights as { supervisors?: { userId: string; sections: string[] }[] } | undefined;
      const grant = rights?.supervisors?.find((item) => item.userId === user.id);
      if (!supervisorLink || !Array.isArray(grant?.sections) || !grant.sections.includes(section)) notFound();
    }
  } else if (!user.isOwner) {
    const supervisorLink = await db.supervisorLink.findFirst({
      where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
      select: { id: true },
    });
    const published = config.published as Record<string, unknown>;
    const rights = published.setupRights as { supervisors?: { userId: string; sections: string[] }[] } | undefined;
    const grant = rights?.supervisors?.find((item) => item.userId === user.id);
    if (!supervisorLink || !Array.isArray(grant?.sections) || !grant.sections.length) notFound();
  }
  const firm = await db.firm.findFirst({ where: { id: user.firmId }, select: { id: true, name: true } });
  if (!firm) notFound();
  return { user, firm, config };
}
