import { getDb } from "./db.ts";
import { decryptSensitive, encryptSensitive } from "./sensitive-data.ts";

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

type Db = ReturnType<typeof getDb>;

function credentials() {
  const id = (process.env.MICROSOFT_OAUTH_CLIENT_ID || process.env.MS_CLIENT_ID || "").trim();
  const secret = (process.env.MICROSOFT_OAUTH_CLIENT_SECRET || process.env.MS_CLIENT_SECRET || "").trim();
  return id && secret ? { id, secret } : null;
}

export async function hasMicrosoftConnection(firmId: string) {
  if (!credentials()) return false;
  const found = await getDb().integrationConnection.findUnique({ where: { firmId_provider: { firmId, provider: "Microsoft365Calendar" } }, select: { id: true } });
  return Boolean(found);
}

async function accessToken(db: Db, firmId: string): Promise<string | null> {
  const creds = credentials();
  if (!creds) return null;
  const connection = await db.integrationConnection.findUnique({ where: { firmId_provider: { firmId, provider: "Microsoft365Calendar" } } });
  if (!connection) return null;
  const tokens = JSON.parse(decryptSensitive(connection.encryptedTokens, connection.tokensIv, connection.tokensAuthTag)) as { accessToken: string; refreshToken: string | null; tokenType: string };
  if (connection.accessTokenExpiresAt && connection.accessTokenExpiresAt.getTime() - Date.now() > 120_000) return tokens.accessToken;
  if (!tokens.refreshToken) return null;
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, grant_type: "refresh_token", refresh_token: tokens.refreshToken, scope: connection.scopes }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const payload = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!payload.access_token) return null;
  const next = { accessToken: payload.access_token, refreshToken: payload.refresh_token ?? tokens.refreshToken, tokenType: "Bearer" };
  const sealed = encryptSensitive(JSON.stringify(next));
  await db.integrationConnection.update({
    where: { id: connection.id },
    data: { encryptedTokens: sealed.ciphertext, tokensIv: sealed.iv, tokensAuthTag: sealed.authTag, accessTokenExpiresAt: new Date(Date.now() + (payload.expires_in ?? 3600) * 1000) },
  });
  return next.accessToken;
}

async function graph(db: Db, firmId: string, method: string, path: string, body?: unknown) {
  const token = await accessToken(db, firmId);
  if (!token) return null;
  const response = await fetch(`${GRAPH}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) return null;
  return response.status === 204 ? {} : await response.json() as Record<string, any>;
}

export type TeamsMeeting = { graphEventId: string; joinUrl: string };

export async function createTeamsMeeting(db: Db, firmId: string, input: { title: string; startAt: Date; endAt: Date; attendeeEmails?: string[]; notes?: string | null }): Promise<TeamsMeeting | null> {
  const result = await graph(db, firmId, "POST", "/me/events", {
    subject: input.title,
    body: { contentType: "text", content: input.notes ?? "" },
    start: { dateTime: input.startAt.toISOString().replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: input.endAt.toISOString().replace("Z", ""), timeZone: "UTC" },
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    attendees: (input.attendeeEmails ?? []).map((address) => ({ emailAddress: { address }, type: "required" })),
  });
  const joinUrl = result?.onlineMeeting?.joinUrl;
  if (!result?.id || typeof joinUrl !== "string") return null;
  return { graphEventId: String(result.id), joinUrl };
}

export async function updateOutlookEvent(db: Db, firmId: string, graphEventId: string, input: { title: string; startAt: Date; endAt: Date }) {
  return Boolean(await graph(db, firmId, "PATCH", `/me/events/${encodeURIComponent(graphEventId)}`, {
    subject: input.title,
    start: { dateTime: input.startAt.toISOString().replace("Z", ""), timeZone: "UTC" },
    end: { dateTime: input.endAt.toISOString().replace("Z", ""), timeZone: "UTC" },
  }));
}

export async function deleteOutlookEvent(db: Db, firmId: string, graphEventId: string) {
  return Boolean(await graph(db, firmId, "DELETE", `/me/events/${encodeURIComponent(graphEventId)}`));
}

export async function fetchOutlookEvent(db: Db, firmId: string, graphEventId: string): Promise<{ title: string; startAt: Date; endAt: Date } | "deleted" | null> {
  const token = await accessToken(db, firmId);
  if (!token) return null;
  const response = await fetch(`${GRAPH}/me/events/${encodeURIComponent(graphEventId)}?$select=subject,start,end`, {
    headers: { authorization: `Bearer ${token}`, prefer: 'outlook.timezone="UTC"' },
    cache: "no-store",
  });
  if (response.status === 404) return "deleted";
  if (!response.ok) return null;
  const data = await response.json() as { subject?: string; start?: { dateTime: string }; end?: { dateTime: string } };
  if (!data.start?.dateTime || !data.end?.dateTime) return null;
  return { title: data.subject ?? "", startAt: new Date(`${data.start.dateTime.split(".")[0]}Z`), endAt: new Date(`${data.end.dateTime.split(".")[0]}Z`) };
}