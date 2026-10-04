import Link from "next/link";
import { createTeamConversation, convertTeamMessageToTask, sendTeamMessage } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { hasPermission, permissionScope, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canAccessRecord } from "@/lib/matter-rules";

type Search = { conversation?: string; q?: string };

export default async function TeamMessagesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("people");
  const query = await searchParams;
  const db = getDb();
  const q = query.q?.trim().slice(0, 100) ?? "";
  const peopleScope = permissionScope(user, "people");
  const reports = peopleScope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })
    : [];
  const supervisor = peopleScope !== "Firm"
    ? await db.supervisorLink.findFirst({ where: { firmId: user.firmId, userId: user.id }, select: { supervisorId: true } })
    : null;
  const directoryIds = peopleScope === "Firm"
    ? undefined
    : [...new Set([user.id, ...reports.map((row) => row.userId), ...(supervisor ? [supervisor.supervisorId] : [])])];
  const canViewMatters = hasPermission(user, "matters");
  const matterScope = permissionScope(user, "matters");
  const matterReports = canViewMatters && matterScope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })
    : [];
  const matterIds = matterScope === "Firm" ? undefined : [user.id, ...matterReports.map((row) => row.userId)];
  const matterMessageFilter = !canViewMatters ? { matterId: null } : matterIds ? {
    OR: [
      { matterId: null },
      { matter: { is: { firmId: user.firmId, responsibleId: { in: matterIds } } } },
    ],
  } : {};
  const [people, matters, conversations] = await Promise.all([
    db.user.findMany({
      where: { firmId: user.firmId, active: true, id: directoryIds ? { in: directoryIds.filter((id) => id !== user.id) } : { not: user.id } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    canViewMatters ? db.matter.findMany({
      where: { firmId: user.firmId, status: { not: "Closed" }, ...(matterIds ? { responsibleId: { in: matterIds } } : {}) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }) : Promise.resolve([]),
    db.teamConversation.findMany({
      where: {
        firmId: user.firmId,
        members: { some: { firmId: user.firmId, userId: user.id } },
        ...(q ? { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { messages: { some: { firmId: user.firmId, ...matterMessageFilter, body: { contains: q, mode: "insensitive" } } } },
        ] } : {}),
      },
      select: {
        id: true, kind: true, title: true, updatedAt: true,
        members: { where: { firmId: user.firmId, userId: { not: user.id } }, select: { user: { select: { name: true } } } },
        messages: { where: { firmId: user.firmId, ...matterMessageFilter }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, urgent: true, createdAt: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);
  const selectedId = query.conversation?.slice(0, 80) ?? "";
  const activeConversation = selectedId ? await db.teamConversation.findFirst({
    where: { id: selectedId, firmId: user.firmId, members: { some: { firmId: user.firmId, userId: user.id } } },
    select: {
      id: true, title: true, kind: true,
      members: { where: { firmId: user.firmId }, select: { userId: true, user: { select: { name: true } } } },
      messages: {
        where: { firmId: user.firmId, ...matterMessageFilter },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: { id: true, senderId: true, body: true, urgent: true, taskId: true, matterId: true, createdAt: true, sender: { select: { name: true } }, matter: { select: { matterNumber: true, clientName: true, clientSurname: true, responsibleId: true } } },
      },
    },
  }) : null;
  const canEditPeople = hasPermission(user, "people", "Edit");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const messageMatterLabel = (responsibleId: string | undefined, matterNumber: string | undefined, clientName: string | undefined, clientSurname: string | undefined) => {
    if (!canViewMatters || !responsibleId || !canAccessRecord({
      userId: user.id, owner: user.isOwner, scope: matterScope,
      assignedUserId: responsibleId, directReportIds: matterReports.map((row) => row.userId),
    })) return null;
    return `${matterNumber} · ${clientName} ${clientSurname}`;
  };

  return (
    <section className="foundation-page">
      <FoundationHeader title="Team messages" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Private one-to-one and group conversations. A conversation and its messages are visible only to active firm members added as recipients.</p>
      <div className="team-workspace">
        <aside className="foundation-panel team-inbox">
          <h2>Conversations</h2>
          <form action="/team/messages" className="foundation-inline-form">
            <label className="foundation-field"><span>Search</span><input name="q" defaultValue={q} maxLength={100} placeholder="Title or message text" /></label>
            <button className="button-secondary" type="submit">Search</button>
          </form>
          {conversations.map((conversation) => {
            const latest = conversation.messages[0];
            const title = conversation.title || conversation.members.map((member) => member.user.name).join(", ") || "Conversation";
            return (
              <Link className={`team-conversation-link${selectedId === conversation.id ? " is-selected" : ""}`} href={`/team/messages?conversation=${encodeURIComponent(conversation.id)}${q ? `&q=${encodeURIComponent(q)}` : ""}`} key={conversation.id}>
                <strong>{title}</strong>
                <span>{latest?.urgent ? "Urgent · " : ""}{latest?.body ?? "No messages yet"}</span>
                <small>{latest?.createdAt.toLocaleString() ?? conversation.updatedAt.toLocaleString()}</small>
              </Link>
            );
          })}
          {!conversations.length ? <p className="foundation-muted">No conversations match your search.</p> : null}
          {conversations.length === 100 ? <p className="foundation-muted">Showing the latest 100 conversations. Search to narrow the list.</p> : null}
        </aside>
        <div className="team-message-content">
          {activeConversation ? (
            <section className="foundation-panel">
              <h2>{activeConversation.title || activeConversation.members.filter((member) => member.userId !== user.id).map((member) => member.user.name).join(", ")}</h2>
              <p className="foundation-muted">{activeConversation.members.map((member) => member.user.name).join(", ")}</p>
              <div className="team-message-list">
                {[...activeConversation.messages].reverse().map((message) => {
                  const matterLabel = messageMatterLabel(message.matter?.responsibleId, message.matter?.matterNumber, message.matter?.clientName, message.matter?.clientSurname);
                  return (
                    <article className={`team-message-card${message.urgent ? " is-urgent" : ""}`} key={message.id}>
                      <div className="team-message-meta"><strong>{message.sender.name}</strong><time>{message.createdAt.toLocaleString()}</time>{message.urgent ? <span className="team-urgent-badge">Urgent</span> : null}</div>
                      <p>{message.body}</p>
                      {matterLabel ? <p className="foundation-muted">Matter: {matterLabel}</p> : null}
                      {message.taskId ? <p className="foundation-notice">Converted to a task.</p> : canEditTasks ? (
                        <ActionForm action={convertTeamMessageToTask}>
                          <input type="hidden" name="messageId" value={message.id} />
                          <SubmitButton className="button-secondary">Convert to my task</SubmitButton>
                        </ActionForm>
                      ) : null}
                    </article>
                  );
                })}
                {!activeConversation.messages.length ? <p className="foundation-muted">No messages yet.</p> : null}
                {activeConversation.messages.length === 200 ? <p className="foundation-muted">Showing the latest 200 messages in this conversation.</p> : null}
              </div>
              {canEditPeople ? (
                <ActionForm action={sendTeamMessage} className="foundation-form team-compose">
                  <input type="hidden" name="conversationId" value={activeConversation.id} />
                  <label className="foundation-field"><span>Reply</span><textarea name="body" maxLength={4000} required rows={3} /></label>
                  {canViewMatters ? <label className="foundation-field"><span>Tag a matter (optional)</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label> : null}
                  <label className="team-checkbox"><input type="checkbox" name="urgent" /> Mark urgent</label>
                  <SubmitButton>Send message</SubmitButton>
                </ActionForm>
              ) : <p className="foundation-muted">Your people permission allows viewing but not sending messages.</p>}
            </section>
          ) : <section className="foundation-panel"><h2>Choose a conversation</h2><p className="foundation-muted">Select a recipient-only conversation or start one below.</p></section>}
          {canEditPeople ? (
            <section className="foundation-panel">
              <h2>Start a conversation</h2>
              {people.length ? (
                <ActionForm action={createTeamConversation} className="foundation-form">
                  <label className="foundation-field"><span>Recipients</span><select name="recipientIds" multiple required size={Math.min(6, Math.max(2, people.length))}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>Choose one colleague for one-to-one chat or several for a group.</small></label>
                  <label className="foundation-field"><span>Group title (optional)</span><input name="title" maxLength={120} /></label>
                  <label className="foundation-field"><span>First message</span><textarea name="body" maxLength={4000} required rows={3} /></label>
                  {canViewMatters ? <label className="foundation-field"><span>Tag a matter (optional)</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label> : null}
                  <label className="team-checkbox"><input type="checkbox" name="urgent" /> Mark urgent</label>
                  <SubmitButton>Start conversation</SubmitButton>
                </ActionForm>
              ) : <p className="foundation-muted">No other colleagues are available within your people scope.</p>}
            </section>
          ) : null}
        </div>
      </div>
    </section>
  );
}
