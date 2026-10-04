"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord, canAccessTask } from "@/lib/matter-rules";
import { taskCategoriesFromConfig } from "@/lib/matter-config";
import { employeeVotePeriod, parseMeetingActionItems } from "@/lib/team-rules";
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
    const notes = text(form, "minutes", "Minutes", 12000);
    const actionLines = parseMeetingActionItems(optionalText(form, "actionItems", "Action items", 4000));
    const taskEdits = hasPermission(user, "tasks", "Edit");
    if (actionLines.length && !taskEdits) throw new ActionError("Task edit permission is required to create meeting action items.");
    const assignToId = actionLines.length ? text(form, "assignedToId", "Action item assignee", 80) : "";
    const dateValue = optionalText(form, "dueAt", "Action item due date", 10);
    const dueAt = dateValue ? dateTime(`${dateValue}T00:00`, "Action item due date") : null;
    const db = getDb();
    const attendeeRows = actionLines.length
      ? await db.teamMeetingParticipant.findMany({ where: { firmId: user.firmId, meetingId }, select: { userId: true } })
      : [];
    const attendeeIds = attendeeRows.map((item) => item.userId);
    if (actionLines.length && !attendeeIds.includes(assignToId)) throw new ActionError("Assign action items to an active meeting participant.");
    if (actionLines.length && meetingMatter) await requireMatterAccessForRecipients(user.firmId, meetingMatter, attendeeIds);
    const assignee = actionLines.length ? (await requireMembers(user, [assignToId]))[0] : null;
    if (actionLines.length) {
      const scope = permissionScope(user, "tasks");
      const reports = await directReports(user.id, user.firmId);
      if (!canAccessTask({ userId: user.id, owner: user.isOwner, scope, assignedUserId: assignee!, directReportIds: reports })) {
        throw new ActionError("The selected assignee is outside your permitted task scope.");
      }
    }
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "TeamMeeting" WHERE "id" = ${meeting.id} AND "firmId" = ${user.firmId} FOR UPDATE`;
      const existing = await tx.teamMeeting.findFirst({ where: { id: meeting.id, firmId: user.firmId }, select: { minutes: true } });
      const existingMinutes = existing?.minutes && typeof existing.minutes === "object" ? existing.minutes as Record<string, unknown> : {};
      if (existingMinutes.savedAt) throw new ActionError("Minutes and action items have already been saved for this meeting.");
      const updated = await tx.teamMeeting.updateMany({
        where: { id: meeting.id, firmId: user.firmId },
        data: { minutes: { notes, savedAt: new Date().toISOString(), actionItemCount: actionLines.length } },
      });
      if (updated.count !== 1) throw new ActionError("Meeting not found. Reload and try again.");
      if (actionLines.length) {
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
        for (const title of actionLines) {
          const task = await tx.task.create({
            data: { firmId: user.firmId, matterId: meeting.matterId, title, category, stage: null, assignedToId: assignee!, createdById: user.id, dueAt },
          });
          const item = await tx.teamMeetingActionItem.create({
            data: { firmId: user.firmId, meetingId: meeting.id, title, assignedToId: assignee!, taskId: task.id },
          });
          const message = await tx.teamMessage.create({
            data: { firmId: user.firmId, conversationId: conversation.id, senderId: user.id, body: `Meeting action item: ${title}`, matterId: meeting.matterId, urgent: false, taskId: task.id },
          });
          await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.meeting.action-created", entityType: "team-meeting-action", entityId: item.id, details: { taskId: task.id, messageId: message.id, assignedToId: assignee } } });
          if (meeting.matterId) {
            await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: meeting.matterId, actorId: user.id, action: "Meeting action item created", details: { meetingId: meeting.id, taskId: task.id } } });
          }
        }
      }
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "team.meeting.minutes-saved", entityType: "team-meeting", entityId: meeting.id, details: { actionItemCount: actionLines.length } } });
      if (meeting.matterId) {
        await tx.matterActivity.create({ data: { firmId: user.firmId, matterId: meeting.matterId, actorId: user.id, action: "Meeting minutes saved", details: { meetingId: meeting.id, actionItemCount: actionLines.length } } });
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
    const user = await teamUser("Edit");
    const nomineeId = text(form, "nomineeId", "Colleague", 80);
    if (nomineeId === user.id) throw new ActionError("You cannot vote for yourself.");
    await requireMembers(user, [nomineeId]);
    const db = getDb();
    const nominee = await db.user.findFirst({ where: { id: nomineeId, firmId: user.firmId, active: true, isOwner: false }, select: { id: true } });
    if (!nominee) throw new ActionError("Choose an active colleague in this firm.");
    const period = employeeVotePeriod();
    try {
      await db.$transaction(async (tx) => {
        await tx.teamEmployeeVote.create({ data: { firmId: user.firmId, period, voterId: user.id, nomineeId } });
        await tx.auditLog.create({ data: { firmId: user.firmId, actorId: null, action: "team.employee-vote.cast", entityType: "employee-vote", details: { period } } });
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") throw new ActionError("You have already voted in this period.");
      throw error;
    }
    revalidate();
    return "success:Your private vote has been recorded.";
  } catch (error) { return actionErrorMessage(error); }
}
