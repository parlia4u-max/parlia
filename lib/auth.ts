import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { ActionError } from "@/lib/errors";
import { hashToken, randomToken } from "@/lib/security";
import { hasPermission, permissionScope } from "@/lib/permissions";
import type { ModuleKey, PermissionLevel } from "@/lib/permissions";
export { hasPermission, permissionScope } from "@/lib/permissions";

const COOKIE = "parlia_session";
const IDLE_MILLISECONDS = 14 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MILLISECONDS = 5 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: IDLE_MILLISECONDS / 1000,
};

export async function createSession(userId: string, firmId: string) {
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: userId, firmId, active: true },
    select: { id: true, firmId: true },
  });
  if (!user) throw new ActionError("Cannot create a session for an inactive or unrecognized firm account.");
  const token = randomToken();
  const now = new Date();
  await db.session.create({
    data: {
      userId,
      firmId: user.firmId,
      tokenHash: hashToken(token),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + IDLE_MILLISECONDS),
    },
  });
  (await cookies()).set(COOKIE, token, cookieOptions);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { firm: true, role: { include: { permissions: true } } } } },
  });
  const now = new Date();
  if (!session || session.expiresAt <= now || !session.user.active) {
    if (session) await db.session.deleteMany({ where: { id: session.id, firmId: session.firmId } });
    jar.delete(COOKIE);
    return null;
  }
  if (session.firmId !== session.user.firmId) {
    await db.session.deleteMany({ where: { id: session.id, firmId: session.firmId } });
    jar.delete(COOKIE);
    return null;
  }
  if (now.getTime() - session.lastActivityAt.getTime() >= REFRESH_AFTER_MILLISECONDS) {
    await db.session.update({
      where: { id: session.id, firmId: session.firmId },
      data: { lastActivityAt: now, expiresAt: new Date(now.getTime() + IDLE_MILLISECONDS) },
    });
    jar.set(COOKIE, token, cookieOptions);
  }
  return session.user;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireOwner() {
  const user = await requireUser();
  if (!user.isOwner) notFound();
  return user;
}

export async function requirePermission(module: ModuleKey, level: PermissionLevel = "View") {
  const user = await requireUser();
  if (!hasPermission(user, module, level)) notFound();
  return user;
}

export async function requireOwnerPermission(module: ModuleKey, level: PermissionLevel = "View") {
  const user = await requirePermission(module, level);
  if (!user.isOwner) notFound();
  return user;
}

export async function signOut() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  try {
    if (token && process.env.DATABASE_URL) {
      const db = getDb();
      const session = await db.session.findFirst({
        where: { tokenHash: hashToken(token) },
        select: { firmId: true },
      });
      if (session) {
        await db.session.deleteMany({ where: { tokenHash: hashToken(token), firmId: session.firmId } });
      }
    }
  } finally {
    jar.delete(COOKIE);
  }
}

export async function audit(firmId: string, actorId: string | null, action: string, entityType: string, entityId?: string, details?: object) {
  await getDb().auditLog.create({
    data: { firmId, actorId, action, entityType, entityId, details: details as never },
  });
}
