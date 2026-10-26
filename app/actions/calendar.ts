"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { taskCategoriesFromConfig } from "@/lib/matter-config";
import { effectiveCalendarVisibility } from "@/lib/calendar";
import { notifyMatterClients } from "@/lib/client-notify";
import { createTeamsMeeting, fetchOutlookEvent } from "@/lib/microsoft-graph";
import { canAddToCalendar, canManageCalendar, cleanColour, parseShares } from "@/lib/calendar-access";

/** Sends people back to the calendar view they were on instead of resetting it. */
function returnPath(formData: FormData) {
  const raw = String(formData.get("returnTo") ?? "");
  if (!raw.startsWith("/calendar") || raw.startsWith("//")) return "/calendar";
  const url = new URL(raw, "http://local");
  url.searchParams.delete("newAt");
  url.searchParams.delete("event");
  url.searchParams.delete("newCalendar");
  url.searchParams.delete("manage");
  return `${url.pathname}${url.search}`;
}

/** Checks that a chosen shared calendar exists in this firm and that the person may add to it. */
async function requireEditableCalendar(firmId: string, userId: string, isOwner: boolean, calendarId: string | null) {
  if (!calendarId) return null;
  const calendar = await getDb().calendar.findFirst({
    where: { id: calendarId, firmId },
    select: { id: true, createdById: true, firmAccess: true, shares: { select: { userId: true, access: true } } },
  });
  if (!calendar || !canAddToCalendar(calendar, userId, isOwner)) throw new ActionError("You can only add events to calendars you are allowed to edit.");
  return calendar.id;
}

async function calendarUser(edit = false) {
  const current = await getCurrentUser();
  if (!current) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: current.id, firmId: current.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user || !hasPermission(user, "calendar", edit ? "Edit" : "View")) {
    throw new ActionError("You do not have access to the calendar.");
  }
  return user;
}

async function permittedCalendarOwners(user: Awaited<ReturnType<typeof calendarUser>>) {
  const db = getDb();
  if (user.isOwner) return (await db.user.findMany({
    where: { firmId: user.firmId, active: true },
    select: { id: true },
  })).map((person) => person.id);
  const setup = await db.setupConfiguration.findFirst({
    where: { firmId: user.firmId },
    select: { published: true },
  });
  const published = setup?.published && typeof setup.published === "object" ? setup.published as {
    calendarVisibility?: { roles?: { role?: string; visibility?: string }[] };
  } : {};
  const visibility = published.calendarVisibility?.roles?.find((item) => item.role === user.role?.name)?.visibility;
  const configured = visibility === "Team" || visibility === "Firm" || visibility === "Own" ? visibility : "Own";
  const effective = effectiveCalendarVisibility(permissionScope(user, "calendar"), configured, user.isOwner);
  if (effective === "Own") return [user.id];
  if (effective === "Firm") return (await db.user.findMany({
    where: { firmId: user.firmId, active: true },
    select: { id: true },
  })).map((person) => person.id);
  const links = await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  });
  return [user.id, ...links.map((link) => link.userId)];
}

function requiredText(value: FormDataEntryValue | null, label: string, limit: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit) {
    throw new ActionError(`${label} is required and must be ${limit} characters or fewer.`);
  }
  return value.trim();
}

function optionalText(value: FormDataEntryValue | null, label: string, limit: number) {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > limit) throw new ActionError(`${label} must be ${limit} characters or fewer.`);
  return value.trim() || null;
}

function dateTime(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value) throw new ActionError(`${label} is required.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ActionError(`${label} must be a valid date and time.`);
  return parsed;
}

export async function createCalendarEvent(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const title = requiredText(formData.get("title"), "Event name", 160);
    const description = optionalText(formData.get("description"), "Notes", 4000);
    const startAt = dateTime(formData.get("startAt"), "Start time");
    const endAt = dateTime(formData.get("endAt"), "End time");
    if (endAt <= startAt) throw new ActionError("End time must be after start time.");
    if (endAt.getTime() - startAt.getTime() > 7 * 24 * 60 * 60 * 1000) throw new ActionError("Calendar events cannot be longer than 7 days.");
    const audience = String(formData.get("audience") ?? "Internal");
    if (audience !== "Internal" && audience !== "Client") throw new ActionError("Choose Internal or Client.");
    const responsibleId = requiredText(formData.get("responsibleId"), "Responsible person", 80);
    const allowedOwners = await permittedCalendarOwners(user);
    if (!allowedOwners.includes(responsibleId)) throw new ActionError("Choose a person whose calendar you are allowed to manage.");
    const matterId = optionalText(formData.get("matterId"), "Matter", 80);
    const meetingUrl = optionalText(formData.get("meetingUrl"), "Meeting link", 500);
    if (meetingUrl) {
      let parsed: URL;
      try { parsed = new URL(meetingUrl); } catch { throw new ActionError("Enter a valid HTTPS meeting link."); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new ActionError("Meeting links must use HTTPS and cannot contain a username or password.");
    }
    const documentLabel = optionalText(formData.get("documentLabel"), "Document link label", 160);
    const documentUrl = optionalText(formData.get("documentUrl"), "Document link", 1000);
    if (Boolean(documentLabel) !== Boolean(documentUrl)) throw new ActionError("Enter both a document link label and its URL.");
    if (documentUrl) {
      let parsed: URL;
      try { parsed = new URL(documentUrl); } catch { throw new ActionError("Enter a valid HTTPS document link."); }
      if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new ActionError("Document links must use HTTPS and cannot contain a username or password.");
    }
    const attendeeIds = formData.getAll("attendeeIds").filter((value): value is string => typeof value === "string");
    if (attendeeIds.length > 50 || attendeeIds.some((id) => !allowedOwners.includes(id))) {
      throw new ActionError("Choose attendees whose calendars you are allowed to see.");
    }
    const calendarId = await requireEditableCalendar(user.firmId, user.id, user.isOwner, optionalText(formData.get("calendarId"), "Calendar", 80));
    const db = getDb();
    if (matterId) {
      if (!hasPermission(user, "matters")) throw new ActionError("You do not have permission to link a matter.");
      const scope = permissionScope(user, "matters");
      const reports = scope === "Team" ? await db.supervisorLink.findMany({
        where: { firmId: user.firmId, supervisorId: user.id },
        select: { userId: true },
      }) : [];
      const matter = await db.matter.findFirst({
        where: {
          id: matterId,
          firmId: user.firmId,
          ...(scope === "Own" ? { responsibleId: user.id } : scope === "Team" ? { responsibleId: { in: [user.id, ...reports.map((item) => item.userId)] } } : {}),
        },
        select: { id: true },
      });
      if (!matter) throw new ActionError("Choose a matter within your access scope.");
    }
    let finalMeetingUrl = meetingUrl;
    let graphEventId: string | null = null;
    if (formData.get("createTeams") === "on" && !meetingUrl) {
      const people = await db.user.findMany({ where: { firmId: user.firmId, id: { in: [...new Set(attendeeIds)] } }, select: { email: true } });
      const teams = await createTeamsMeeting(db, user.firmId, { title, startAt, endAt, notes: description, attendeeEmails: people.map((person) => person.email) });
      if (!teams) throw new ActionError("The Teams meeting could not be created. Check that Microsoft 365 is connected in Setup > Connections, or paste a meeting link instead.");
      finalMeetingUrl = teams.joinUrl;
      graphEventId = teams.graphEventId;
    }
    await db.$transaction(async (tx) => {
      const event = await tx.calendarEvent.create({
        data: {
          firmId: user.firmId, ownerId: responsibleId, createdById: user.id, responsibleId, calendarId,
          matterId, title, description, startAt, endAt, audience, meetingUrl: finalMeetingUrl, graphEventId,
          attendees: { create: [...new Set(attendeeIds)].map((userId) => ({ firmId: user.firmId, userId })) },
          ...(documentLabel && documentUrl ? { documents: { create: { label: documentLabel, url: documentUrl } } } : {}),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "calendar.event.created", entityType: "calendar-event", entityId: event.id, details: { title, audience, teams: Boolean(graphEventId) } },
      });
    });
    if (audience === "Client" && matterId) {
      await notifyMatterClients({ firmId: user.firmId, matterId, kind: "Meeting" }).catch(() => undefined);
    }
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}

export async function updateCalendarEvent(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const eventId = requiredText(formData.get("eventId"), "Event", 80);
    const db = getDb();
    const allowedOwners = await permittedCalendarOwners(user);
    const event = await db.calendarEvent.findFirst({
      where: { id: eventId, firmId: user.firmId },
      select: { id: true, ownerId: true, createdById: true, matterId: true, calendar: { select: { createdById: true, firmAccess: true, shares: { select: { userId: true, access: true } } } } },
    });
    const mayEdit = event && (event.calendar ? canAddToCalendar(event.calendar, user.id, user.isOwner) || event.createdById === user.id : allowedOwners.includes(event.ownerId));
    if (!event || !mayEdit) throw new ActionError("This event is not in a calendar you are allowed to edit.");
    const calendarId = await requireEditableCalendar(user.firmId, user.id, user.isOwner, optionalText(formData.get("calendarId"), "Calendar", 80));
    const title = requiredText(formData.get("title"), "Event name", 160);
    const startAt = dateTime(formData.get("startAt"), "Start time");
    const endAt = dateTime(formData.get("endAt"), "End time");
    if (endAt <= startAt) throw new ActionError("End time must be after start time.");
    if (endAt.getTime() - startAt.getTime() > 7 * 24 * 60 * 60 * 1000) throw new ActionError("Calendar events cannot be longer than 7 days.");
    const responsibleId = requiredText(formData.get("responsibleId"), "Responsible person", 80);
    if (!allowedOwners.includes(responsibleId)) throw new ActionError("Choose a person whose calendar you are allowed to manage.");
    const audience = String(formData.get("audience") ?? "Internal");
    if (audience !== "Internal" && audience !== "Client") throw new ActionError("Choose Internal or Client.");
    const description = optionalText(formData.get("description"), "Notes", 4000);
    const attendeeIds = formData.getAll("attendeeIds").filter((value): value is string => typeof value === "string");
    if (attendeeIds.length > 50 || attendeeIds.some((id) => !allowedOwners.includes(id))) {
      throw new ActionError("Choose attendees whose calendars you are allowed to see.");
    }
    await db.$transaction(async (tx) => {
      await tx.calendarEvent.updateMany({
        where: { id: event.id, firmId: user.firmId },
        data: { title, startAt, endAt, ownerId: responsibleId, responsibleId, audience, description, calendarId },
      });
      await tx.calendarEventAttendee.deleteMany({ where: { firmId: user.firmId, eventId: event.id } });
      if (attendeeIds.length) await tx.calendarEventAttendee.createMany({
        data: [...new Set(attendeeIds)].map((userId) => ({ firmId: user.firmId, eventId: event.id, userId })),
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "calendar.event.updated", entityType: "calendar-event", entityId: event.id, details: { title, previousOwnerId: event.ownerId, audience } },
      });
    });
    if (audience === "Client" && event.matterId) {
      await notifyMatterClients({ firmId: user.firmId, matterId: event.matterId, kind: "Meeting" }).catch(() => undefined);
    }
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}

export async function addCalendarChecklistItem(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const eventId = requiredText(formData.get("eventId"), "Event", 80);
    const label = requiredText(formData.get("label"), "Checklist item", 160);
    const event = await getDb().calendarEvent.findFirst({
      where: { id: eventId, firmId: user.firmId, createdById: user.id },
      select: { id: true },
    });
    if (!event) throw new ActionError("Only the event organizer can change its checklist.");
    await getDb().$transaction(async (tx) => {
      await tx.calendarEventChecklistItem.create({ data: { firmId: user.firmId, eventId, label } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.checklist.added", entityType: "calendar-event", entityId: eventId } });
    });
    revalidatePath("/calendar");
    return "success:Checklist item added.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function toggleCalendarChecklistItem(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const itemId = requiredText(formData.get("itemId"), "Checklist item", 80);
    const db = getDb();
    const item = await db.calendarEventChecklistItem.findFirst({
      where: { id: itemId, firmId: user.firmId, event: { createdById: user.id } },
      select: { id: true, eventId: true, completed: true },
    });
    if (!item) throw new ActionError("Only the event organizer can update its checklist.");
    await db.$transaction(async (tx) => {
      await tx.calendarEventChecklistItem.updateMany({
        where: { id: item.id, firmId: user.firmId },
        data: { completed: !item.completed, completedById: item.completed ? null : user.id, completedAt: item.completed ? null : new Date() },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.checklist.updated", entityType: "calendar-event", entityId: item.eventId } });
    });
    revalidatePath("/calendar");
    return "success:Checklist updated.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function createCalendarFollowUpTask(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const title = requiredText(formData.get("title"), "Task name", 160);
    const eventId = requiredText(formData.get("eventId"), "Event", 80);
    const assignedToId = requiredText(formData.get("assignedToId"), "Assigned person", 80);
    const dueAt = dateTime(formData.get("dueAt"), "Due date");
    const event = await getDb().calendarEvent.findFirst({ where: { id: eventId, firmId: user.firmId, ownerId: user.id }, select: { id: true, matterId: true } });
    if (!event) throw new ActionError("Only the event organizer can create a follow-up task.");
    if (!(await permittedCalendarOwners(user)).includes(assignedToId)) throw new ActionError("Choose a colleague whose calendar you can access.");
    if (!hasPermission(user, "tasks", "Edit")) throw new ActionError("You do not have permission to create tasks.");
    const setup = await getDb().setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } });
    if (!taskCategoriesFromConfig(setup?.published).includes("Follow up")) throw new ActionError("Follow-up tasks are not available in the published firm setup.");
    const taskScope = permissionScope(user, "tasks");
    const reports = taskScope === "Team" ? await getDb().supervisorLink.findMany({
      where: { firmId: user.firmId, supervisorId: user.id },
      select: { userId: true },
    }) : [];
    if (taskScope === "Own" && assignedToId !== user.id ||
      taskScope === "Team" && assignedToId !== user.id && !reports.some((item) => item.userId === assignedToId)) {
      throw new ActionError("Assign this task only within your task permission scope.");
    }
    await getDb().$transaction(async (tx) => {
      await tx.task.create({
        data: { firmId: user.firmId, matterId: event.matterId, title, category: "Follow up", assignedToId, createdById: user.id, dueAt },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.follow-up-task.created", entityType: "calendar-event", entityId: event.id } });
    });
    revalidatePath("/calendar");
    revalidatePath("/tasks");
    return "success:Follow-up task created.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function syncCalendarFromOutlook(_state: string | null, _formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const db = getDb();
    const events = await db.calendarEvent.findMany({
      where: { firmId: user.firmId, graphEventId: { not: null }, endAt: { gte: new Date() }, ownerId: user.id },
      select: { id: true, graphEventId: true, title: true, startAt: true, endAt: true },
      take: 100,
    });
    let changed = 0;
    let removed = 0;
    for (const event of events) {
      const remote = await fetchOutlookEvent(db, user.firmId, event.graphEventId!);
      if (!remote) continue;
      if (remote === "deleted") {
        await db.calendarEvent.deleteMany({ where: { id: event.id, firmId: user.firmId } });
        removed += 1;
      } else if (remote.startAt.getTime() !== event.startAt.getTime() || remote.endAt.getTime() !== event.endAt.getTime() || (remote.title && remote.title !== event.title)) {
        await db.calendarEvent.updateMany({ where: { id: event.id, firmId: user.firmId }, data: { startAt: remote.startAt, endAt: remote.endAt, ...(remote.title ? { title: remote.title.slice(0, 160) } : {}) } });
        changed += 1;
      }
    }
    await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.outlook.synced", entityType: "calendar", entityId: user.id, details: { checked: events.length, changed, removed } } });
    revalidatePath("/calendar");
    return `success:Checked ${events.length} Teams meetings. ${changed} changed, ${removed} removed.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function deleteCalendarEvent(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser(true);
    const eventId = requiredText(formData.get("eventId"), "Event", 80);
    const db = getDb();
    const event = await db.calendarEvent.findFirst({
      where: { id: eventId, firmId: user.firmId },
      select: { id: true, createdById: true, ownerId: true, leaveRequestId: true, calendar: { select: { createdById: true, firmAccess: true, shares: { select: { userId: true, access: true } } } } },
    });
    if (!event) throw new ActionError("Event not found.");
    if (event.leaveRequestId) throw new ActionError("Leave appears on the calendar automatically; change the leave request instead.");
    const mayDelete = event.createdById === user.id || (event.calendar ? canAddToCalendar(event.calendar, user.id, user.isOwner) : event.ownerId === user.id);
    if (!mayDelete) throw new ActionError("Only the person who added this event, or someone who may edit its calendar, can delete it.");
    await db.$transaction(async (tx) => {
      await tx.calendarEvent.deleteMany({ where: { id: event.id, firmId: user.firmId } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.event.deleted", entityType: "calendar-event", entityId: event.id } });
    });
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}

/** Reads the calendar settings form: name, colour, description, firm-wide access and per-person access. */
async function calendarSettings(formData: FormData, firmId: string, creatorId: string) {
  const name = requiredText(formData.get("name"), "Calendar name", 80);
  const description = optionalText(formData.get("description"), "Description", 500);
  const colour = cleanColour(formData.get("colour"));
  const firmAccessRaw = String(formData.get("firmAccess") ?? "");
  const firmAccess = firmAccessRaw === "View" || firmAccessRaw === "Edit" ? firmAccessRaw : null;
  const colleagues = await getDb().user.findMany({ where: { firmId, active: true }, select: { id: true } });
  const ids = colleagues.map((person) => person.id);
  const shares = parseShares(ids.map((userId) => ({ userId, access: formData.get(`access-${userId}`) })), ids, creatorId);
  return { name, description, colour, firmAccess, shares } as const;
}

export async function createCalendar(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser();
    const settings = await calendarSettings(formData, user.firmId, user.id);
    const db = getDb();
    const existing = await db.calendar.count({ where: { firmId: user.firmId, createdById: user.id } });
    if (existing >= 50) throw new ActionError("You can create up to 50 calendars.");
    await db.$transaction(async (tx) => {
      const calendar = await tx.calendar.create({
        data: {
          firmId: user.firmId, createdById: user.id, name: settings.name, description: settings.description, colour: settings.colour, firmAccess: settings.firmAccess,
          shares: { create: settings.shares.map((share) => ({ firmId: user.firmId, userId: share.userId, access: share.access })) },
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.created", entityType: "calendar", entityId: calendar.id, details: { name: settings.name, shared: settings.shares.length, firmAccess: settings.firmAccess } } });
    });
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}

export async function updateCalendar(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser();
    const calendarId = requiredText(formData.get("calendarId"), "Calendar", 80);
    const db = getDb();
    const calendar = await db.calendar.findFirst({ where: { id: calendarId, firmId: user.firmId }, select: { id: true, createdById: true, firmAccess: true, shares: { select: { userId: true, access: true } } } });
    if (!calendar || !canManageCalendar(calendar, user.id)) throw new ActionError("Only the person who created this calendar can change it.");
    const settings = await calendarSettings(formData, user.firmId, user.id);
    await db.$transaction(async (tx) => {
      await tx.calendar.update({ where: { id: calendar.id }, data: { name: settings.name, description: settings.description, colour: settings.colour, firmAccess: settings.firmAccess } });
      await tx.calendarShare.deleteMany({ where: { firmId: user.firmId, calendarId: calendar.id } });
      if (settings.shares.length) await tx.calendarShare.createMany({ data: settings.shares.map((share) => ({ firmId: user.firmId, calendarId: calendar.id, userId: share.userId, access: share.access })) });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.updated", entityType: "calendar", entityId: calendar.id, details: { name: settings.name, shared: settings.shares.length, firmAccess: settings.firmAccess } } });
    });
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}

export async function deleteCalendar(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await calendarUser();
    const calendarId = requiredText(formData.get("calendarId"), "Calendar", 80);
    const db = getDb();
    const calendar = await db.calendar.findFirst({ where: { id: calendarId, firmId: user.firmId }, select: { id: true, name: true, createdById: true, firmAccess: true, shares: { select: { userId: true, access: true } } } });
    if (!calendar || !canManageCalendar(calendar, user.id)) throw new ActionError("Only the person who created this calendar can delete it.");
    await db.$transaction(async (tx) => {
      // Events are kept: they move back to the personal calendar of the person responsible.
      await tx.calendarEvent.updateMany({ where: { firmId: user.firmId, calendarId: calendar.id }, data: { calendarId: null } });
      await tx.calendar.delete({ where: { id: calendar.id } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "calendar.deleted", entityType: "calendar", entityId: calendar.id, details: { name: calendar.name } } });
    });
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(returnPath(formData));
}
