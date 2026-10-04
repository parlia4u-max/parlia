import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { hashToken, randomToken } from "@/lib/security";

const COOKIE = "parlia_client_session";
const IDLE_MILLISECONDS = 30 * 60 * 1000;
const REFRESH_AFTER_MILLISECONDS = 5 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: IDLE_MILLISECONDS / 1000,
};

export async function createClientSession(clientId: string, firmId: string) {
  const client = await getDb().clientPortalAccount.findFirst({
    where: { id: clientId, firmId, active: true, passwordHash: { not: null } },
    select: { id: true, firmId: true },
  });
  if (!client) throw new Error("Cannot create a session for an inactive client account.");
  const token = randomToken();
  const now = new Date();
  await getDb().clientPortalSession.create({
    data: {
      firmId: client.firmId,
      clientId: client.id,
      tokenHash: hashToken(token),
      lastActivityAt: now,
      expiresAt: new Date(now.getTime() + IDLE_MILLISECONDS),
    },
  });
  (await cookies()).set(COOKIE, token, cookieOptions);
}

export async function getCurrentClient() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const session = await db.clientPortalSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { client: { include: { firm: true } } },
  });
  const now = new Date();
  if (!session || session.expiresAt <= now || !session.client.active || session.firmId !== session.client.firmId) {
    if (session) await db.clientPortalSession.deleteMany({ where: { id: session.id, firmId: session.firmId } });
    jar.delete(COOKIE);
    return null;
  }
  if (now.getTime() - session.lastActivityAt.getTime() >= REFRESH_AFTER_MILLISECONDS) {
    await db.clientPortalSession.update({
      where: { id: session.id, firmId: session.firmId },
      data: { lastActivityAt: now, expiresAt: new Date(now.getTime() + IDLE_MILLISECONDS) },
    });
    jar.set(COOKIE, token, cookieOptions);
  }
  return session.client;
}

export async function signOutClient() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  try {
    if (token && process.env.DATABASE_URL) {
      await getDb().clientPortalSession.deleteMany({ where: { tokenHash: hashToken(token) } });
    }
  } finally {
    jar.delete(COOKIE);
  }
}
