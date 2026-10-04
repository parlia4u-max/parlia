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
          firmId: user.firmId, ownerId: responsibleId, createdById: user.id, responsibleId,
          matterId, title, description, startAt, endAt, audience, meetingUrl: finalMeetingUrl, graphEventId,
          attendees: { create: [...new Set(attendeeIds)].map((userId) => ({ firmId: user.firmId, userId })) },
          ...(documentLabel && documentUrl ? { documents: { create: { label: documentLabel, url: documentUrl } } } : {}),
        },
        select: { id: true },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "calendar.event.created", entityType: "calendar-event", entityId: event.id, details: { audience, teams: Boolean(graphEventId) } },
      });
    });
    if (audience === "Client" && matterId) {
      await notifyMatterClients({ firmId: user.firmId, matterId, kind: "Meeting" }).catch(() => undefined);
    }
    revalidatePath("/calendar");
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect("/calendar");
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