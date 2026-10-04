import { NextResponse } from "next/server";
import { sendWaitingEmail } from "@/lib/client-notify";
import { reminderDue } from "@/lib/client-notify-rules";
import { getDb } from "@/lib/db";
import { getFirmPortalContext } from "@/lib/firm-portal";

// Runs once a day from Vercel Cron. CRON_SECRET must be set; Vercel sends it as a bearer token.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const db = getDb();
  const now = new Date();
  const open = await db.clientNotification.findMany({
    where: { doneAt: null, emailCount: { gte: 1 }, client: { active: true } },
    include: { client: { select: { id: true, email: true } } },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  const settingsByFirm = new Map<string, Awaited<ReturnType<typeof getFirmPortalContext>>["settings"]>();
  const dueByClient = new Map<string, { firmId: string; email: string; ids: string[]; wording: string }>();
  for (const item of open) {
    let settings = settingsByFirm.get(item.firmId);
    if (!settings) { settings = (await getFirmPortalContext(item.firmId)).settings; settingsByFirm.set(item.firmId, settings); }
    if (!reminderDue({ createdAt: item.createdAt, emailCount: item.emailCount, now, reminderDays: settings.reminderDays, reminderMax: settings.reminderMax })) continue;
    const entry = dueByClient.get(item.clientId) ?? { firmId: item.firmId, email: item.client.email, ids: [], wording: "You still have something waiting for you in your portal." };
    entry.ids.push(item.id);
    dueByClient.set(item.clientId, entry);
  }
  let sent = 0;
  for (const entry of dueByClient.values()) {
    try {
      await sendWaitingEmail(entry.firmId, entry.email, entry.wording, true);
      await db.clientNotification.updateMany({ where: { id: { in: entry.ids } }, data: { emailCount: { increment: 1 }, lastEmailedAt: now } });
      sent += 1;
    } catch {
      // Try again on the next run.
    }
  }
  return NextResponse.json({ clientsReminded: sent });
}