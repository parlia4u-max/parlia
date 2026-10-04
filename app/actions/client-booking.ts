"use server";

import { revalidatePath } from "next/cache";
import { actionErrorMessage, ActionError } from "@/lib/errors";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { availabilityFromConfig, computeSlots, formatSlot } from "@/lib/availability";
import { createTeamsMeeting, deleteOutlookEvent } from "@/lib/microsoft-graph";

async function clientMatter(matterId: string) {
  const client = await getCurrentClient();
  if (!client) throw new ActionError("Please log in again.");
  const db = getDb();
  const access = await db.clientMatterAccess.findFirst({
    where: { firmId: client.firmId, clientId: client.id, matterId, revokedAt: null },
    include: { matter: { select: { id: true, firmId: true, matterNumber: true, clientName: true, clientSurname: true, responsibleId: true } } },
  });
  if (!access) throw new ActionError("You do not have access to this matter.");
  const setup = await db.setupConfiguration.findUnique({ where: { firmId: client.firmId }, select: { published: true } });
  return { client, matter: access.matter, db, settings: availabilityFromConfig(setup?.published) };
}

export async function availableSlotsForMatter(matterId: string): Promise<Date[]> {
  const { client, matter, db, settings } = await clientMatter(matterId);
  if (!settings.enabled) return [];
  const now = new Date();
  const busy = await db.calendarEvent.findMany({
    where: { firmId: client.firmId, ownerId: matter.responsibleId, endAt: { gte: now }, startAt: { lte: new Date(now.getTime() + (settings.maxDaysAhead + 1) * 86_400_000) } },
    select: { startAt: true, endAt: true },
    take: 1000,
  });
  return computeSlots(settings, busy, now);
}

export async function bookClientMeeting(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const matterId = String(form.get("matterId") ?? "");
    const slot = new Date(String(form.get("slot") ?? ""));
    if (!matterId || Number.isNaN(slot.getTime())) throw new ActionError("Choose a time.");
    const { client, matter, db, settings } = await clientMatter(matterId);
    if (!settings.enabled) throw new ActionError("Booking online is not switched on for this firm.");
    const offered = await availableSlotsForMatter(matterId);
    if (!offered.some((item) => item.getTime() === slot.getTime())) throw new ActionError("That time is no longer free. Please choose another.");
    const mine = await db.calendarEvent.count({ where: { firmId: client.firmId, matterId, bookedByClientId: client.id, startAt: { gte: new Date() } } });
    if (mine >= 3) throw new ActionError("You already have 3 upcoming meetings. Cancel one first or contact the firm.");
    const endAt = new Date(slot.getTime() + settings.slotMinutes * 60_000);
    const title = `Client meeting: ${matter.clientName} ${matter.clientSurname} (${matter.matterNumber})`;
    const teams = await createTeamsMeeting(db, client.firmId, { title, startAt: slot, endAt }).catch(() => null);
    const event = await db.calendarEvent.create({
      data: {
        firmId: client.firmId, ownerId: matter.responsibleId, responsibleId: matter.responsibleId, createdById: matter.responsibleId,
        matterId, title, startAt: slot, endAt, audience: "Client", meetingUrl: teams?.joinUrl ?? null, graphEventId: teams?.graphEventId ?? null, bookedByClientId: client.id,
      },
      select: { id: true },
    });
    await db.auditLog.create({ data: { firmId: client.firmId, actorId: null, action: "client_portal.meeting_booked", entityType: "calendar-event", entityId: event.id, details: { matterId, clientId: client.id, at: formatSlot(slot), teams: Boolean(teams) } } });
    revalidatePath(`/client/matters/${matterId}`);
    revalidatePath("/calendar");
    return `success:Meeting booked for ${formatSlot(slot)} (South African time).`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function cancelClientMeeting(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const eventId = String(form.get("eventId") ?? "");
    const client = await getCurrentClient();
    if (!client) throw new ActionError("Please log in again.");
    const db = getDb();
    const event = await db.calendarEvent.findFirst({ where: { id: eventId, firmId: client.firmId, bookedByClientId: client.id } });
    if (!event || !event.matterId) throw new ActionError("Meeting not found.");
    const { settings } = await clientMatter(event.matterId);
    if (event.startAt.getTime() - Date.now() < settings.noticeHours * 3_600_000) throw new ActionError(`Meetings can only be cancelled online at least ${settings.noticeHours} hours before. Please contact the firm.`);
    if (event.graphEventId) await deleteOutlookEvent(db, client.firmId, event.graphEventId).catch(() => false);
    await db.calendarEvent.deleteMany({ where: { id: event.id, firmId: client.firmId } });
    await db.auditLog.create({ data: { firmId: client.firmId, actorId: null, action: "client_portal.meeting_cancelled", entityType: "calendar-event", entityId: event.id, details: { matterId: event.matterId, clientId: client.id } } });
    revalidatePath(`/client/matters/${event.matterId}`);
    revalidatePath("/calendar");
    return "success:Meeting cancelled.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}