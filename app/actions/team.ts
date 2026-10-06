"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord, canAccessTask } from "@/lib/matter-rules";
import { taskCategoriesFromConfig } from "@/lib/matter-config";
import { employeeVoteDeadline, employeeVotePeriod, parseMeetingActionItems } from "@/lib/team-rules";
import type { Prisma } from "@prisma/client";

const TEAM_PATHS = ["/team/messages", "/team/meetings", "/team/suggestions", "/team/recognition", "/tasks", "/matters"];

async function teamUser(level: "View" | "Edit" = "View") {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to continue.");
  const user = await getDb().user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  if (!hasPermission(user, "people", level)) throw new ActionError(`You do not have ${level.toLowerCase()} access to team features.`);
  return user;
}

async function recognitionManager() {
  const sessionUser = await getCurrentUser();
  if (!sessionUser) throw new ActionError("Sign in to continue.");
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    include: { role: { include: { permissions: true } } },
  });
  if (!user) throw new ActionError("Your account is not active in this firm.");
  if (user.isOwner) return { user, isOwner: true };
  const settings = await db.teamRecognitionSettings.findUnique({ where: { firmId: user.firmId }, select: { delegateId: true } });
  if (settings?.delegateId !== user.id) throw new ActionError("Only the firm owner or assigned recognition coordinator can manage this page.");
  return { user, isOwner: false };
}

function text(form: FormData, key: string, label: string, max = 240) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  }
  return value.trim();
}

function optionalText(form: FormData, key: string, label: string, max = 1000) {
  const value = form.get(key);
  if (value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > max) throw new ActionError(`${label} must be ${max} characters or fewer.`);
  return value.trim() || null;
}

function selectedIds(form: FormData, key: string, maximum = 30) {
  const values = form.getAll(key);
  if (values.some((value) => typeof value !== "string")) throw new ActionError("Choose valid team members.");
  const ids = [...new Set(values.map(String).filter(Boolean))];
  if (ids.length > maximum) throw new ActionError(`Choose no more than ${maximum} team members.`);
  return ids;
}

function dateTime(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new ActionError(`${label} is required.`);
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw new ActionError(`${label} is invalid.`);
  return result;
}

function checked(form: FormData, key: string) {
  return form.get(key) === "on";
}

async function directReports(userId: string, firmId: string) {
  const rows = await getDb().supervisorLink.findMany({
    where: { firmId, supervisorId: userId, user: { firmId, active: true } },
    select: { userId: true },
  });
  return rows.map((row) => row.userId);
}

async function requireMatter(user: Awaited<ReturnType<typeof teamUser>>, matterId: string) {
  if (!hasPermission(user, "matters", "View")) throw new ActionError("Matter access is required to tag this item.");
  const matter = await getDb().matter.findFirst({
    where: { id: matterId, firmId: user.firmId },
    select: { id: true, responsibleId: true, stage: true, matterNumber: true },
  });
  if (!matter) throw new ActionError("Matter not found in this firm.");
  const reports = permissionScope(user, "matters") === "Team" ? await directReports(user.id, user.firmId) : [];
  if (!canAccessRecord({
    userId: user.id,
    owner: user.isOwner,
    scope: permissionScope(user, "matters"),
    assignedUserId: matter.responsibleId,
    directReportIds: reports,
  })) throw new ActionError("Matter is outside your permitted matter scope.");
  return matter;
}

async function requireMatterAccessForRecipients(firmId: string, matter: { responsibleId: string }, userIds: string[]) {
  if (!userIds.length) return;
  const db = getDb();
  const people = await db.user.findMany({
    where: { firmId, active: true, id: { in: userIds } },
    include: { role: { include: { permissions: true } } },
  });
  if (people.length !== new Set(userIds).size) throw new ActionError("Matter-tagged messages and meetings may include only active firm staff.");
  const teamIds = people.filter((person) => permissionScope(person, "matters") === "Team").map((person) => person.id);
  const reports = teamIds.length ? await db.supervisorLink.findMany({
    where: { firmId, supervisorId: { in: teamIds }, user: { firmId, active: true } },
    select: { supervisorId: true, userId: true },
  }) : [];
  const reportIdsBySupervisor = new Map<string, string[]>();
  for (const item of reports) reportIdsBySupervisor.set(item.supervisorId, [...(reportIdsBySupervisor.get(item.supervisorId) ?? []), item.userId]);
  if (people.some((person) => !hasPermission(person, "matters") || !canAccessRecord({
    userId: person.id,
    owner: person.isOwner,
    scope: permissionScope(person, "matters"),
    assignedUserId: matter.responsibleId,
    directReportIds: reportIdsBySupervisor.get(person.id) ?? [],
  }))) {
    throw new ActionError("Every recipient must have permission to access the tagged matter.");
  }
}

async function requireMembers(user: Awaited<ReturnType<typeof teamUser>>, ids: string[]) {
  const scope = permissionScope(user, "people");
  let allowedIds: string[] | undefined;
  if (scope === "Team") {
    const [reports, supervisor] = await Promise.all([
      directReports(user.id, user.firmId),
      getDb().supervisorLink.findFirst({ where: { firmId: user.firmId, userId: user.id, supervisor: { firmId: user.firmId, active: true } }, select: { supervisorId: true } }),
    ]);
    allowedIds = [user.id, ...reports, ...(supervisor ? [supervisor.supervisorId] : [])];
  } else if (scope === "Own") {
    const supervisor = await getDb().supervisorLink.findFirst({ where: { firmId: user.firmId, userId: user.id, supervisor: { firmId: user.firmId, active: true } }, select: { supervisorId: true } });
    allowedIds = [user.id, ...(supervisor ? [supervisor.supervisorId] : [])];
  }
  if (allowedIds && ids.some((id) => !allowedIds!.includes(id))) {
    throw new ActionError("Choose only colleagues within your permitted people scope.");
  }
  const members = await getDb().user.findMany({
    where: { firmId: user.firmId, active: true, id: { in: ids } },
    select: { id: true },
  });
  if (members.length !== ids.length) throw new ActionError("All selected people must be active staff in this firm.");
  return members.map((member) => member.id);
}

async function requireConversation(user: Awaited<ReturnType<typeof teamUser>>, conversationId: string) {
  const conversation = await getDb().teamConversation.findFirst({
    where: {
      id: conversationId,
      firmId: user.firmId,
      members: { some: { firmId: user.firmId, userId: user.id } },
    },
    select: { id: true, kind: true },
  });
  if (!conversation) throw new ActionError("Conversation not found or you are not a recipient.");
  return conversation;
}

async function activeTaskSetup(tx: Prisma.TransactionClient, firmId: string) {
  const config = await tx.setupConfiguration.findFirst({ where: { firmId }, select: { published: true, publishedAt: true } });
  if (!config?.publishedAt) throw new ActionError("Publish Setup Centre before creating team tasks.");
  const categories = taskCategoriesFromConfig(config.published);
  if (!categories.length) throw new ActionError("Configure at least one task category in Setup Centre.");
  return categories[0];
}

function revalidate() {
  TEAM_PATHS.forEach((path) => revalidatePath(path));
}

export async function createTeamConversation(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    const title = optionalText(form, "title", "Conversation title", 120);
    const body = text(form, "body", "First message", 4000);
    const matterId = optionalText(form, "matterId", "Matter", 80);
    const recipients = selectedIds(form, "recipientIds", 19).filter((id) => id !== user.id);
    if (!recipients.length) throw new ActionError("Choose at least one other recipient.");
    const members = [user.id, ...await requireMembers(user, recipients)];
    const matter = matterId ? await requireMatter(user, matterId) : null;
    if (matter) await requireMatterAccessForRecipients(user.firmId, matter, members);
    const kind = members.length === 2 ? "OneToOne" : "Group";
    const db = getDb();
    await db.$transaction(async (tx) => {
      const conversation = await tx.teamConversation.create({
        data: {
          firmId: user.firmId,
          kind,
          title: kind === "Group" ? title || "Team conversation" : null,
          createdById: user.id,
          members: { create: members.map((userId) => ({ firmId: user.firmId, userId })) },
        },
      });
      const message = await tx.teamMessage.create({
        data: { firmId: user.firmId, conversationId: conversation.id, senderId: user.id, body, matterId: matter?.id ?? null, urgent: checked(form, "urgent") },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "team.message.created", entityType: "team-message", entityId: message.id, details: { conversationId: conversation.id, recipientCount: recipients.length, urgent: checked(form, "urgent"), matterId: matter?.id ?? null } },
      });
      if (matter) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Team message added", details: { messageId: message.id } } });
        await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
    });
    revalidate();
    return "success:Conversation started.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function startDirectTeamMessage(_state: string | null, form: FormData): Promise<string | null> {
  let conversationId = "";
  try {
    const user = await teamUser("Edit");
    const recipientId = text(form, "recipientId", "Colleague", 80);
    const body = text(form, "body", "Message", 4000);
    const matterId = optionalText(form, "matterId", "Matter", 80);
    const recipients = await requireMembers(user, [recipientId]);
    const matter = matterId ? await requireMatter(user, matterId) : null;
    if (matter) await requireMatterAccessForRecipients(user.firmId, matter, [user.id, ...recipients]);
    const db = getDb();
    conversationId = await db.$transaction(async (tx) => {
      let conversation = await tx.teamConversation.findFirst({
        where: {
          firmId: user.firmId,
          kind: "OneToOne",
          AND: [
            { members: { some: { firmId: user.firmId, userId: user.id } } },
            { members: { some: { firmId: user.firmId, userId: recipientId } } },
          ],
        },
        select: { id: true },
      });
      if (!conversation) {
        conversation = await tx.teamConversation.create({
          data: {
            firmId: user.firmId,
            kind: "OneToOne",
            createdById: user.id,
            members: { create: [{ userId: user.id }, { userId: recipientId }] },
          },
          select: { id: true },
        });
      }
      const message = await tx.teamMessage.create({
        data: { firmId: user.firmId, conversationId: conversation.id, senderId: user.id, body, matterId: matter?.id ?? null, urgent: checked(form, "urgent") },
        select: { id: true },
      });
      await tx.teamConversation.updateMany({ where: { id: conversation.id, firmId: user.firmId }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "team.message.created", entityType: "team-message", entityId: message.id, details: { conversationId: conversation.id, recipientCount: 1, urgent: checked(form, "urgent"), matterId: matter?.id ?? null } },
      });
      if (matter) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Team message added", details: { messageId: message.id } } });
        await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
      return conversation.id;
    });
    revalidate();
  } catch (error) {
    return actionErrorMessage(error);
  }
  redirect(`/team/messages?conversation=${encodeURIComponent(conversationId)}`);
}

export async function sendTeamMessage(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    const conversation = await requireConversation(user, text(form, "conversationId", "Conversation", 80));
    const body = text(form, "body", "Message", 4000);
    const matterId = optionalText(form, "matterId", "Matter", 80);
    const matter = matterId ? await requireMatter(user, matterId) : null;
    if (matter) {
      const recipients = await getDb().teamConversationMember.findMany({ where: { firmId: user.firmId, conversationId: conversation.id }, select: { userId: true } });
      await requireMatterAccessForRecipients(user.firmId, matter, [...recipients.map((item) => item.userId), user.id]);
    }
    const db = getDb();
    await db.$transaction(async (tx) => {
      const message = await tx.teamMessage.create({
        data: { firmId: user.firmId, conversationId: conversation.id, senderId: user.id, body, matterId: matter?.id ?? null, urgent: checked(form, "urgent") },
      });
      await tx.teamConversation.updateMany({ where: { id: conversation.id, firmId: user.firmId }, data: { updatedAt: new Date() } });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "team.message.created", entityType: "team-message", entityId: message.id, details: { conversationId: conversation.id, urgent: checked(form, "urgent"), matterId: matter?.id ?? null } },
      });
      if (matter) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Team message added", details: { messageId: message.id } } });
        await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
    });
    revalidate();
    return "success:Message sent.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function convertTeamMessageToTask(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("View");
    if (!hasPermission(user, "tasks", "Edit")) throw new ActionError("Task edit permission is required to convert a message.");
    const messageId = text(form, "messageId", "Message", 80);
    const db = getDb();
    const message = await db.teamMessage.findFirst({
      where: { id: messageId, firmId: user.firmId, conversation: { firmId: user.firmId, members: { some: { firmId: user.firmId, userId: user.id } } } },
      select: { id: true, body: true, matterId: true, taskId: true, matter: { select: { stage: true, responsibleId: true } } },
    });
    if (!message) throw new ActionError("Message not found or you are not a recipient.");
    if (message.taskId) throw new ActionError("This message has already been converted to a task.");
    if (message.matterId) await requireMatter(user, message.matterId);
    const reports = await directReports(user.id, user.firmId);
    if (!canAccessTask({ userId: user.id, owner: user.isOwner, scope: permissionScope(user, "tasks"), assignedUserId: user.id, directReportIds: reports })) {
      throw new ActionError("Your task scope does not allow assigning this task to yourself.");
    }
    await db.$transaction(async (tx) => {
      const category = await activeTaskSetup(tx, user.firmId);
      const task = await tx.task.create({
        data: {
          firmId: user.firmId,
          matterId: message.matterId,
          title: message.body.slice(0, 240),
          category,
          stage: message.matter?.stage ?? null,
          assignedToId: user.id,
          createdById: user.id,
        },
      });
      const updated = await tx.teamMessage.updateMany({ where: { id: message.id, firmId: user.firmId, taskId: null }, data: { taskId: task.id } });
      if (updated.count !== 1) throw new ActionError("Message was already converted. Reload and try again.");
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.message.converted-to-task", entityType: "team-message", entityId: message.id, details: { taskId: task.id } } });
      if (message.matterId) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: message.matterId, actorId: user.id, action: "Team message converted to task", details: { messageId: message.id, taskId: task.id } } });
        await tx.matter.update({ where: { id_firmId: { id: message.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
    });
    revalidate();
    return "success:Message converted to a task assigned to you.";
  } catch (error) { return actionErrorMessage(error); }
}

async function meetingAccessible(user: Awaited<ReturnType<typeof teamUser>>, id: string) {
  const scope = permissionScope(user, "people");
  const userIds = scope === "Team" ? [user.id, ...await directReports(user.id, user.firmId)] : [user.id];
  const meeting = await getDb().teamMeeting.findFirst({
    where: {
      id,
      firmId: user.firmId,
      ...(scope === "Firm" ? {} : {
        OR: [
          { createdById: { in: userIds } },
          { participants: { some: { firmId: user.firmId, userId: { in: userIds } } } },
        ],
      }),
    },
    select: { id: true, title: true, matterId: true, createdById: true, minutes: true },
  });
  if (!meeting) throw new ActionError("Meeting not found or outside your permitted team scope.");
  return meeting;
}

export async function createTeamMeeting(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    const title = text(form, "title", "Meeting title", 160);
    const startsAt = dateTime(text(form, "startsAt", "Meeting date and time", 16), "Meeting date and time");
    const templateName = text(form, "templateName", "Minutes template", 120);
    const matterId = optionalText(form, "matterId", "Matter", 80);
    const participants = selectedIds(form, "participantIds", 29).filter((id) => id !== user.id);
    const memberIds = [user.id, ...await requireMembers(user, participants)];
    const setup = await getDb().setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } });
    const templates = setup?.published && typeof setup.published === "object"
      ? (setup.published as { minutesTemplates?: unknown }).minutesTemplates
      : undefined;
    const template = Array.isArray(templates) ? templates.find((item) => item && typeof item === "object" && (item as { name?: unknown }).name === templateName) as { name: string; sections?: unknown } | undefined : undefined;
    if (!setup?.publishedAt || !template || !Array.isArray(template.sections) || template.sections.some((section) => typeof section !== "string")) {
      throw new ActionError("Choose a minutes template currently published in Setup Centre.");
    }
    const matter = matterId ? await requireMatter(user, matterId) : null;
    if (matter) await requireMatterAccessForRecipients(user.firmId, matter, memberIds);
    const db = getDb();
    const meeting = await db.$transaction(async (tx) => {
      const created = await tx.teamMeeting.create({
        data: {
          firmId: user.firmId,
          title,
          startsAt,
          templateName,
          matterId: matter?.id ?? null,
          urgent: checked(form, "urgent"),
          createdById: user.id,
          participants: { create: memberIds.map((userId) => ({ firmId: user.firmId, userId })) },
        },
      });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.meeting.created", entityType: "team-meeting", entityId: created.id, details: { participantCount: memberIds.length, templateName, urgent: checked(form, "urgent"), matterId: matter?.id ?? null } } });
      if (matter) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: matter.id, actorId: user.id, action: "Team meeting scheduled", details: { meetingId: created.id } } });
        await tx.matter.update({ where: { id_firmId: { id: matter.id, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
      return created;
    });
    revalidate();
    return "success:Meeting scheduled.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function saveTeamMeetingMinutes(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    const meetingId = text(form, "meetingId", "Meeting", 80);
    const meeting = await meetingAccessible(user, meetingId);
    if (!user.isOwner && meeting.createdById !== user.id) throw new ActionError("Only the meeting organizer or firm owner can save minutes.");
    const meetingMatter = meeting.matterId ? await requireMatter(user, meeting.matterId) : null;
    const rawMinutesData = form.get("minutesData");
    let minutesContent: Record<string, unknown>;
    let taskAssignments: { title: string; assignedToIds: string[]; dueAt: Date | null }[];
    if (typeof rawMinutesData === "string") {
      if (!rawMinutesData.trim() || rawMinutesData.length > 30000) throw new ActionError("Meeting minutes are too long to save.");
      let parsed: unknown;
      try { parsed = JSON.parse(rawMinutesData); } catch { throw new ActionError("Meeting minutes could not be read. Reload and try again."); }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new ActionError("Meeting minutes could not be read. Reload and try again.");
      const input = parsed as Record<string, unknown>;
      const layout = input.layout;
      if (layout !== "modern" && layout !== "formal" && layout !== "editorial") throw new ActionError("Choose a valid minutes layout.");
      const messageOfWeek = typeof input.messageOfWeek === "string" ? input.messageOfWeek.trim() : "";
      if (messageOfWeek.length > 500) throw new ActionError("The message of the week must be 500 characters or fewer.");
      if (!Array.isArray(input.sections) || input.sections.length > 20) throw new ActionError("Minutes may have up to 20 discussion sections.");
      const sections = input.sections.map((rawSection, index) => {
        if (!rawSection || typeof rawSection !== "object" || Array.isArray(rawSection)) throw new ActionError(`Discussion section ${index + 1} is invalid.`);
        const section = rawSection as Record<string, unknown>;
        const heading = typeof section.heading === "string" ? section.heading.trim() : "";
        if (!heading || heading.length > 120) throw new ActionError(`Discussion section ${index + 1} needs a heading of 120 characters or fewer.`);
        if (!Array.isArray(section.topics) || section.topics.length > 40) throw new ActionError(`Discussion section ${index + 1} may have up to 40 points.`);
        const topics = section.topics.flatMap((rawTopic) => {
          if (typeof rawTopic !== "string") throw new ActionError("Discussion points must be text.");
          const topic = rawTopic.trim();
          if (topic.length > 2000) throw new ActionError("Each discussion point must be 2,000 characters or fewer.");
          return topic ? [topic] : [];
        });
        return { heading, topics };
      });
      const meetingParticipants = await getDb().teamMeetingParticipant.findMany({ where: { firmId: user.firmId, meetingId }, select: { userId: true } });
      const participantIds = meetingParticipants.map((participant) => participant.userId);
      if (!Array.isArray(input.attendingIds) || input.attendingIds.some((id) => typeof id !== "string" || !participantIds.includes(id))) {
        throw new ActionError("Choose attendees from this meeting's participant list.");
      }
      const attendingIds = [...new Set(input.attendingIds as string[])];
      if (!attendingIds.length) throw new ActionError("Mark at least one employee as present before saving the minutes.");
      if (!Array.isArray(input.assignedTasks) || input.assignedTasks.length > 20) throw new ActionError("A meeting may assign up to 20 tasks.");
      taskAssignments = input.assignedTasks.flatMap((rawTask) => {
        if (!rawTask || typeof rawTask !== "object" || Array.isArray(rawTask)) throw new ActionError("A meeting task is invalid.");
        const task = rawTask as Record<string, unknown>;
        const title = typeof task.title === "string" ? task.title.trim() : "";
        if (!title) return [];
        if (title.length > 240) throw new ActionError("Meeting task titles must be 240 characters or fewer.");
        if (typeof task.assignedToId !== "string" || (task.assignedToId !== "__all__" && !participantIds.includes(task.assignedToId))) {
          throw new ActionError("Assign each task to a meeting participant or everyone attending.");
        }
        if (typeof task.dueAt !== "string" || !task.dueAt) throw new ActionError(`Add a due date for “${title}”.`);
        const dueAt = dateTime(`${task.dueAt}T00:00`, "Task due date");
        return [{ title, assignedToIds: task.assignedToId === "__all__" ? attendingIds : [task.assignedToId], dueAt }];
      });
      minutesContent = { layout, messageOfWeek, attendingIds, sections };
    } else {
      const notes = text(form, "minutes", "Minutes", 12000);
      const actionLines = parseMeetingActionItems(optionalText(form, "actionItems", "Action items", 4000));
      const assignToId = actionLines.length ? text(form, "assignedToId", "Action item assignee", 80) : "";
      const dateValue = optionalText(form, "dueAt", "Action item due date", 10);
      const dueAt = dateValue ? dateTime(`${dateValue}T00:00`, "Action item due date") : null;
      const attendees = actionLines.length ? await getDb().teamMeetingParticipant.findMany({ where: { firmId: user.firmId, meetingId }, select: { userId: true } }) : [];
      const participantIds = attendees.map((item) => item.userId);
      if (actionLines.length && !participantIds.includes(assignToId)) throw new ActionError("Assign action items to an active meeting participant.");
      taskAssignments = actionLines.map((title) => ({ title, assignedToIds: [assignToId], dueAt }));
      minutesContent = { notes };
    }
    const taskEdits = hasPermission(user, "tasks", "Edit");
    if (taskAssignments.length && !taskEdits) throw new ActionError("Task edit permission is required to create meeting action items.");
    const db = getDb();
    const attendeeRows = taskAssignments.length
      ? await db.teamMeetingParticipant.findMany({ where: { firmId: user.firmId, meetingId }, select: { userId: true } })
      : [];
    const attendeeIds = attendeeRows.map((item) => item.userId);
    if (taskAssignments.length && meetingMatter) await requireMatterAccessForRecipients(user.firmId, meetingMatter, attendeeIds);
    const assigneeIds = [...new Set(taskAssignments.flatMap((task) => task.assignedToIds))];
    if (assigneeIds.length) await requireMembers(user, assigneeIds);
    if (taskAssignments.length) {
      const scope = permissionScope(user, "tasks");
      const reports = await directReports(user.id, user.firmId);
      if (assigneeIds.some((assigneeId) => !canAccessTask({ userId: user.id, owner: user.isOwner, scope, assignedUserId: assigneeId, directReportIds: reports }))) {
        throw new ActionError("One or more selected assignees are outside your permitted task scope.");
      }
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TeamMeeting" WHERE "id" = ${meeting.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const existing = await tx.teamMeeting.findFirst({ where: { id: meeting.id, firmId: user.firmId }, select: { minutes: true } });
      const existingMinutes = existing?.minutes && typeof existing.minutes === "object" ? existing.minutes as Record<string, unknown> : {};
      if (existingMinutes.savedAt) throw new ActionError("Minutes and action items have already been saved for this meeting.");
      const updated = await tx.teamMeeting.updateMany({
        where: { id: meeting.id, firmId: user.firmId },
        data: { minutes: { ...minutesContent, savedAt: new Date().toISOString(), actionItemCount: taskAssignments.reduce((count, task) => count + task.assignedToIds.length, 0) } },
      });
      if (updated.count !== 1) throw new ActionError("Meeting not found. Reload and try again.");
      if (taskAssignments.length) {
        const category = await activeTaskSetup(tx, user.firmId);
        const conversation = await tx.teamConversation.create({
          data: {
            firmId: user.firmId,
            kind: attendeeIds.length === 2 ? "OneToOne" : "Group",
            title: `Meeting actions: ${meeting.title}`,
            createdById: user.id,
            members: { create: [...new Set(attendeeIds)].map((userId) => ({ firmId: user.firmId, userId })) },
          },
        });
        for (const assignment of taskAssignments) {
          for (const assigneeId of assignment.assignedToIds) {
            const task = await tx.task.create({
              data: { firmId: user.firmId, matterId: meeting.matterId, title: assignment.title, category, stage: null, assignedToId: assigneeId, createdById: user.id, dueAt: assignment.dueAt },
            });
            const item = await tx.teamMeetingActionItem.create({
              data: { firmId: user.firmId, meetingId: meeting.id, title: assignment.title, assignedToId: assigneeId, taskId: task.id },
            });
            const message = await tx.teamMessage.create({
              data: { firmId: user.firmId, conversationId: conversation.id, senderId: user.id, body: `Meeting action item: ${assignment.title}`, matterId: meeting.matterId, urgent: false, taskId: task.id },
            });
            await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.meeting.action-created", entityType: "team-meeting-action", entityId: item.id, details: { taskId: task.id, messageId: message.id, assignedToId: assigneeId } } });
            if (meeting.matterId) {
              await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: meeting.matterId, actorId: user.id, action: "Meeting action item created", details: { meetingId: meeting.id, taskId: task.id } } });
            }
          }
        }
      }
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.meeting.minutes-saved", entityType: "team-meeting", entityId: meeting.id, details: { actionItemCount: taskAssignments.reduce((count, task) => count + task.assignedToIds.length, 0) } } });
      if (meeting.matterId) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: meeting.matterId, actorId: user.id, action: "Meeting minutes saved", details: { meetingId: meeting.id, actionItemCount: taskAssignments.reduce((count, task) => count + task.assignedToIds.length, 0) } } });
        await tx.matter.update({ where: { id_firmId: { id: meeting.matterId, firmId: user.firmId } }, data: { lastActivityAt: new Date() } });
      }
    });
    revalidate();
    return "success:Minutes saved.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function submitTeamSuggestion(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    const category = text(form, "category", "Suggestion category", 80);
    if (!["Process", "Tools", "Wellbeing", "Other"].includes(category)) throw new ActionError("Choose a valid suggestion category.");
    const body = text(form, "body", "Suggestion", 4000);
    const anonymous = checked(form, "anonymous");
    const db = getDb();
    const suggestion = await db.$transaction(async (tx) => {
      const created = await tx.teamSuggestion.create({
        data: { firmId: user.firmId, category, body, anonymous, submitterId: anonymous ? null : user.id },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: anonymous ? null : user.id, action: "team.suggestion.submitted", entityType: "team-suggestion", entityId: created.id, details: { category, anonymous } },
      });
      return created;
    });
    revalidate();
    return `success:Suggestion submitted${suggestion.anonymous ? " anonymously" : ""}.`;
  } catch (error) { return actionErrorMessage(error); }
}

export async function updateTeamSuggestionStatus(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    if (!user.isOwner) throw new ActionError("Only the firm owner can manage suggestions.");
    const suggestionId = text(form, "suggestionId", "Suggestion", 80);
    const status = text(form, "status", "Suggestion status", 40);
    if (!["Open", "Under review", "Implemented", "Declined"].includes(status)) throw new ActionError("Choose a valid suggestion status.");
    const db = getDb();
    await db.$transaction(async (tx) => {
      const update = await tx.teamSuggestion.updateMany({ where: { id: suggestionId, firmId: user.firmId }, data: { status } });
      if (update.count !== 1) throw new ActionError("Suggestion not found in this firm.");
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.suggestion.status-updated", entityType: "team-suggestion", entityId: suggestionId, details: { status } } });
    });
    revalidate();
    return "success:Suggestion status updated.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function castEmployeeVote(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const session = await getCurrentUser();
    if (!session) throw new ActionError("Sign in to vote.");
    const db = getDb();
    const user = await db.user.findFirst({ where: { id: session.id, firmId: session.firmId, active: true }, select: { id: true, firmId: true, name: true } });
    if (!user) throw new ActionError("Your account is not active in this firm.");
    const period = employeeVotePeriod();
    const settings = await db.teamRecognitionSettings.findUnique({ where: { firmId: user.firmId } });
    const dueDay = settings?.dueDay ?? 25;
    const dueTime = settings?.dueTime ?? "17:00";
    if (new Date() >= employeeVoteDeadline(period, dueDay, dueTime)) throw new ActionError("The voting deadline has passed. Your ballot can no longer be changed.");
    if (await db.teamRecognitionPublication.findUnique({ where: { firmId_period: { firmId: user.firmId, period } }, select: { id: true } })) {
      throw new ActionError("The owner has already published this month's result.");
    }
    const nomineeChoice = text(form, "nominee", "Nominee", 180);
    let nomineeId: string | null = null;
    let nomineeName = "";
    if (nomineeChoice.startsWith("external:")) {
      const externalName = nomineeChoice.slice("external:".length).trim();
      const externalNominees = Array.isArray(settings?.externalNominees) ? settings.externalNominees.filter((name): name is string => typeof name === "string") : [];
      if (!externalNominees.includes(externalName)) throw new ActionError("Choose an external nominee configured by the owner.");
      nomineeName = externalName;
    } else {
      const nominee = await db.user.findFirst({ where: { id: nomineeChoice, firmId: user.firmId, active: true, isOwner: false }, select: { id: true, name: true } });
      if (!nominee) throw new ActionError("Choose an active colleague in this firm.");
      if (nominee.id === user.id) throw new ActionError("You cannot vote for yourself.");
      nomineeId = nominee.id;
      nomineeName = nominee.name;
    }
    const reason = optionalText(form, "reason", "Reason", 500) ?? "";
    const anonymous = checked(form, "anonymous");
    try {
      await db.$transaction(async (tx) => {
        const existing = await tx.teamEmployeeVote.findUnique({ where: { firmId_period_voterId: { firmId: user.firmId, period, voterId: user.id } }, select: { id: true } });
        if (existing) {
          await tx.teamEmployeeVote.update({ where: { id: existing.id }, data: { nomineeId, nomineeName, reason, anonymous } });
        } else {
          await tx.teamEmployeeVote.create({ data: { firmId: user.firmId, period, voterId: user.id, nomineeId, nomineeName, reason, anonymous } });
        }
        await tx.auditLog.create({ data: { firmId: user.firmId, actorId: null, action: existing ? "team.employee-vote.updated" : "team.employee-vote.cast", entityType: "employee-vote", details: { period, anonymous } } });
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ActionError("Your ballot was updated at the same time. Reload the page.");
      throw error;
    }
    revalidate();
    return "success:Your private ballot has been saved. You can change it before the deadline.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function saveRecognitionSettings(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, isOwner } = await recognitionManager();
    const dueDayText = text(form, "dueDay", "Voting deadline day", 2);
    const dueDay = Number(dueDayText);
    const dueTime = text(form, "dueTime", "Voting deadline time", 5);
    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31 || !/^([01]\d|2[0-3]):[0-5]\d$/.test(dueTime)) throw new ActionError("Choose a valid monthly deadline day and time.");
    const delegateValue = optionalText(form, "delegateId", "Recognition coordinator", 80);
    const delegateId = delegateValue || null;
    const existingSettings = await getDb().teamRecognitionSettings.findUnique({ where: { firmId: user.firmId }, select: { delegateId: true } });
    if (!isOwner && delegateId !== existingSettings?.delegateId) throw new ActionError("Only the firm owner can change the recognition coordinator.");
    if (delegateId && !await getDb().user.findFirst({ where: { id: delegateId, firmId: user.firmId, active: true, isOwner: false }, select: { id: true } })) {
      throw new ActionError("Choose an active employee as recognition coordinator.");
    }
    const externalNominees = [...new Set(String(form.get("externalNominees") ?? "").split(/\r?\n/).map((name) => name.trim()).filter(Boolean))];
    if (externalNominees.some((name) => name.length > 120) || externalNominees.length > 100) throw new ActionError("Enter up to 100 external nominees, each no longer than 120 characters.");
    const certificateLayout = text(form, "certificateLayout", "Certificate layout", 20);
    if (!["classic", "modern", "formal"].includes(certificateLayout)) throw new ActionError("Choose a supported certificate layout.");
    await getDb().teamRecognitionSettings.upsert({
      where: { firmId: user.firmId },
      create: { firmId: user.firmId, dueDay, dueTime, delegateId, externalNominees, certificateLayout },
      update: { dueDay, dueTime, delegateId, externalNominees, certificateLayout },
    });
    await getDb().auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.recognition.settings_updated", entityType: "team-recognition-settings", entityId: user.firmId } });
    revalidate();
    return "success:Recognition settings saved.";
  } catch (error) { return actionErrorMessage(error); }
}

export async function publishEmployeeOfMonth(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await teamUser("Edit");
    if (!user.isOwner) throw new ActionError("Only the firm owner can publish the result.");
    const period = text(form, "period", "Voting period", 7);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new ActionError("Choose a valid voting period.");
    const db = getDb();
    const existing = await db.teamRecognitionPublication.findUnique({ where: { firmId_period: { firmId: user.firmId, period } }, select: { id: true } });
    if (existing) throw new ActionError("This month's result has already been published.");
    const settings = await db.teamRecognitionSettings.findUnique({ where: { firmId: user.firmId } });
    const deadline = employeeVoteDeadline(period, settings?.dueDay ?? 25, settings?.dueTime ?? "17:00");
    if (new Date() < deadline) throw new ActionError(`Publish is available after ${deadline.toLocaleString()}.`);
    const votes = await db.teamEmployeeVote.findMany({ where: { firmId: user.firmId, period }, select: { nomineeId: true, nomineeName: true } });
    if (!votes.length) throw new ActionError("There are no ballots to publish for this period.");
    const totals = new Map<string, number>();
    for (const vote of votes) {
      const name = vote.nomineeName || "Former staff member";
      totals.set(name, (totals.get(name) ?? 0) + 1);
    }
    const winner = [...totals].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    await db.$transaction(async (tx) => {
      await tx.teamRecognitionPublication.create({ data: { firmId: user.firmId, period, winnerName: winner[0], voteCount: winner[1], certificateLayout: settings?.certificateLayout ?? "modern", publishedById: user.id } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.employee-of-month.published", entityType: "team-recognition-publication", details: { period, winnerName: winner[0], voteCount: winner[1] } } });
    });
    revalidate();
    return `success:${winner[0]} has been published as Employee of the Month.`;
  } catch (error) { return actionErrorMessage(error); }
}
