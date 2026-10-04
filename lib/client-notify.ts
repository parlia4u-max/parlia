import { getDb } from "@/lib/db";
import { sendBrandedEmail } from "@/lib/firm-portal";
import { getFirmPortalContext } from "@/lib/firm-portal";
import type { PortalNotificationKey } from "@/lib/portal-settings";

type Kind = "NewUpdate" | "NewDocument" | "DocumentRequested" | "InvoicePublished" | "Meeting" | "UploadReviewed";
const SETTING_KEY: Record<Kind, PortalNotificationKey> = {
  NewUpdate: "newUpdate", NewDocument: "newDocument", DocumentRequested: "documentRequested",
  InvoicePublished: "invoicePublished", Meeting: "meeting", UploadReviewed: "uploadReviewed",
};

// The email never names the matter, document or amount: only that something is waiting and where to log in.
export async function sendWaitingEmail(firmId: string, to: string, wording: string, reminder: boolean) {
  await sendBrandedEmail(
    firmId, to,
    reminder ? "Reminder: something is waiting for you" : "Something is waiting for you",
    reminder ? "Reminder: something is waiting" : "Something is waiting for you",
    [wording, "For your privacy, the details are only shown after you log in."],
    { label: "Log in to your portal", path: "/client/login" },
  );
}

// Never throws: a failed email must not undo the staff action that caused it.
export async function notifyMatterClients(input: { firmId: string; matterId: string; kind: Kind; message?: string | null }) {
  try {
    const db = getDb();
    const { settings } = await getFirmPortalContext(input.firmId);
    const setting = settings.notifications[SETTING_KEY[input.kind]];
    if (!setting.enabled) return;
    const accesses = await db.clientMatterAccess.findMany({
      where: { firmId: input.firmId, matterId: input.matterId, revokedAt: null, client: { active: true } },
      select: { client: { select: { id: true, email: true } } },
    });
    for (const { client } of accesses) {
      const created = await db.clientNotification.create({
        data: { firmId: input.firmId, clientId: client.id, matterId: input.matterId, kind: input.kind, message: input.message ?? null },
        select: { id: true },
      });
      try {
        await sendWaitingEmail(input.firmId, client.email, setting.wording, false);
        await db.clientNotification.update({ where: { id: created.id }, data: { emailCount: 1, lastEmailedAt: new Date() } });
      } catch {
        await db.auditLog.create({ data: { firmId: input.firmId, action: "client_portal.notification_email_failed", entityType: "client-notification", entityId: created.id } });
      }
    }
  } catch {
    // The portal badge will still be created on the next event; nothing else to do here.
  }
}

export async function completeNotifications(firmId: string, matterId: string, clientId: string | null, kinds: Kind[]) {
  await getDb().clientNotification.updateMany({
    where: { firmId, matterId, kind: { in: kinds }, doneAt: null, ...(clientId ? { clientId } : {}) },
    data: { doneAt: new Date(), readAt: new Date() },
  });
}