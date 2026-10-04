import { createTeamMeeting, saveTeamMeetingMinutes } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { hasPermission, permissionScope, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { meetingVisibleInPeopleScope } from "@/lib/team-rules";

type Search = { q?: string };

export default async function TeamMeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("people");
  const db = getDb();
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 100) ?? "";
  const scope = permissionScope(user, "people");
  const reports = scope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })
    : [];
  const supervisors = scope !== "Firm"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, userId: user.id }, select: { supervisorId: true } })
    : [];
  const meetingScopeUserIds = [...new Set([user.id, ...reports.map((item) => item.userId)])];
  const scopeUserIds = [...new Set([...meetingScopeUserIds, ...supervisors.map((item) => item.supervisorId)])];
  const canViewMatters = hasPermission(user, "matters");
  const matterScope = permissionScope(user, "matters");
  const matterReports = canViewMatters && matterScope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })
    : [];
  const matterAssigneeIds = matterScope === "Firm" ? undefined : [user.id, ...matterReports.map((item) => item.userId)];
  const setup = await db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } });
  const minutesTemplates = setup?.publishedAt && setup.published && typeof setup.published === "object"
    ? (setup.published as { minutesTemplates?: unknown }).minutesTemplates
    : undefined;
  const templates = Array.isArray(minutesTemplates) ? minutesTemplates.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const item = raw as { name?: unknown; sections?: unknown };
    if (typeof item.name !== "string" || !Array.isArray(item.sections)) return [];
    return [{ name: item.name, sections: item.sections.filter((section): section is string => typeof section === "string") }];
  }) : [];
  const meetingScopeWhere = scope === "Firm" ? {} : {
    OR: [
      { createdById: { in: meetingScopeUserIds } },
      { participants: { some: { firmId: user.firmId, userId: { in: meetingScopeUserIds } } } },
    ],
  };
  const [people, matters, meetings] = await Promise.all([
    db.user.findMany({
      where: { firmId: user.firmId, active: true, id: { not: user.id, ...(scope === "Firm" ? {} : { in: scopeUserIds.filter((id) => id !== user.id) }) } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    canViewMatters ? db.matter.findMany({
      where: { firmId: user.firmId, status: { not: "Closed" }, ...(matterAssigneeIds ? { responsibleId: { in: matterAssigneeIds } } : {}) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true },
      orderBy: { lastActivityAt: "desc" },
      take: 200,
    }) : Promise.resolve([]),
    db.teamMeeting.findMany({
      where: {
        firmId: user.firmId,
        ...(q ? {
          AND: [
            meetingScopeWhere,
            { OR: [{ title: { contains: q, mode: "insensitive" } }, { templateName: { contains: q, mode: "insensitive" } }] },
          ],
        } : meetingScopeWhere),
      },
      select: {
        id: true, title: true, startsAt: true, templateName: true, urgent: true, matterId: true, minutes: true, createdById: true,
        matter: { select: { matterNumber: true, clientName: true, clientSurname: true, responsibleId: true } },
        createdBy: { select: { name: true } },
        participants: { where: { firmId: user.firmId }, select: { userId: true, user: { select: { name: true } } } },
        actionItems: { where: { firmId: user.firmId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, assignedTo: { select: { name: true } }, taskId: true } },
      },
      orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    }),
  ]);
  const canEditPeople = hasPermission(user, "people", "Edit");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const taskAssigneeIds = permissionScope(user, "tasks") === "Firm"
    ? undefined
    : permissionScope(user, "tasks") === "Team"
      ? [user.id, ...(await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })).map((item) => item.userId)]
      : [user.id];
  const visibleMeetings = meetings.filter((meeting) =>
    meetingVisibleInPeopleScope({
      scope,
      userId: user.id,
      directReportIds: reports.map((item) => item.userId),
      createdById: meeting.createdById,
      participantIds: meeting.participants.map((participant) => participant.userId),
    }) &&
    (!meeting.matterId || !!meeting.matter && canViewMatters && (
      user.isOwner || matterScope === "Firm" || meeting.matter.responsibleId === user.id ||
      matterScope === "Team" && matterReports.some((item) => item.userId === meeting.matter!.responsibleId)
    ))
  );
  return (
    <section className="foundation-page">
      <FoundationHeader title="Meetings & minutes" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Schedule internal team meetings from the firm’s published minutes templates. Meeting visibility follows your Own, Team or Firm people scope.</p>
      <section className="foundation-panel">
        <h2>Search meetings</h2>
        <form action="/team/meetings" className="foundation-inline-form">
          <label className="foundation-field"><span>Title or template</span><input name="q" defaultValue={q} maxLength={100} /></label>
          <button className="button-secondary" type="submit">Search</button>
        </form>
      </section>
      <div className="team-meeting-list">
        {visibleMeetings.map((meeting) => {
          const meetingMinutes = meeting.minutes && typeof meeting.minutes === "object" ? meeting.minutes as { notes?: unknown; savedAt?: unknown } : null;
          const matterAllowed = !!meeting.matter && canViewMatters && (
            user.isOwner || matterScope === "Firm" || meeting.matter.responsibleId === user.id ||
            matterScope === "Team" && matterReports.some((item) => item.userId === meeting.matter!.responsibleId)
          );
          const permittedAttendees = meeting.participants.filter((participant) =>
            (!taskAssigneeIds || taskAssigneeIds.includes(participant.userId)) &&
            (scope === "Firm" || scopeUserIds.includes(participant.userId))
          );
          const assignOptions = permittedAttendees.length ? permittedAttendees : meeting.participants.filter((participant) => participant.userId === user.id);
          return (
            <article className="foundation-panel team-meeting-card" key={meeting.id}>
              <div className="team-meeting-heading">
                <div><p className="eyebrow">{meeting.templateName} · {meeting.startsAt.toLocaleString()}</p><h2>{meeting.title}</h2></div>
                {meeting.urgent ? <span className="team-urgent-badge">Urgent</span> : null}
              </div>
              <p className="foundation-muted">Organized by {meeting.createdBy.name} · Participants: {meeting.participants.map((person) => person.user.name).join(", ")}</p>
              {matterAllowed ? <p className="foundation-muted">Matter: {meeting.matter!.matterNumber} · {meeting.matter!.clientName} {meeting.matter!.clientSurname}</p> : null}
              {meetingMinutes?.notes ? <div className="team-minutes"><h3>Minutes</h3><pre>{String(meetingMinutes.notes)}</pre></div> : null}
              {meeting.actionItems.length ? <div className="team-minutes"><h3>Action items</h3><ul>{meeting.actionItems.map((item) => <li key={item.id}>{item.title} — {item.assignedTo.name}{item.taskId ? " (task created)" : ""}</li>)}</ul></div> : null}
              {!meetingMinutes?.savedAt && canEditPeople && (user.isOwner || meeting.createdById === user.id) ? (
                <details className="team-minutes-editor">
                  <summary>Write minutes</summary>
                  <p className="foundation-muted">Template sections: {templates.find((template) => template.name === meeting.templateName)?.sections.join(" · ") || "The template sections are no longer available."}</p>
                  <ActionForm action={saveTeamMeetingMinutes} className="foundation-form">
                    <input type="hidden" name="meetingId" value={meeting.id} />
                    <label className="foundation-field"><span>Minutes by section</span><textarea name="minutes" required maxLength={12000} rows={6} placeholder={templates.find((template) => template.name === meeting.templateName)?.sections.map((section) => `${section}:\n`).join("\n")} /></label>
                    {canEditTasks ? <>
                      <label className="foundation-field"><span>Action items (one per line)</span><textarea name="actionItems" maxLength={4000} rows={3} placeholder="Summarize one task on each line" /></label>
                      <label className="foundation-field"><span>Assign action items to</span><select name="assignedToId" defaultValue={assignOptions.find((person) => person.userId === user.id)?.userId ?? assignOptions[0]?.userId ?? ""}>{assignOptions.map((person) => <option key={person.userId} value={person.userId}>{person.user.name}</option>)}</select></label>
                      <label className="foundation-field"><span>Shared task due date (optional)</span><input type="date" name="dueAt" /></label>
                    </> : <p className="foundation-muted">Task edit permission is required to create meeting action items.</p>}
                    <SubmitButton>Save minutes{canEditTasks ? " and actions" : ""}</SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              {meetingMinutes?.savedAt ? <p className="foundation-notice">Minutes saved · {meeting.actionItems.length} task(s) created.</p> : null}
            </article>
          );
        })}
        {!visibleMeetings.length ? <section className="foundation-panel"><p>No meetings match your search.</p></section> : null}
        {visibleMeetings.length === 100 ? <p className="foundation-muted">Showing the latest 100 meetings. Search to narrow the list.</p> : null}
      </div>
      {canEditPeople ? (
        <section className="foundation-panel">
          <h2>Schedule a meeting</h2>
          {templates.length && people.length ? (
            <ActionForm action={createTeamMeeting} className="foundation-form">
              <label className="foundation-field"><span>Meeting title</span><input name="title" required maxLength={160} /></label>
              <label className="foundation-field"><span>Date and time</span><input type="datetime-local" name="startsAt" required /></label>
              <label className="foundation-field"><span>Minutes template</span><select name="templateName" required defaultValue={templates[0].name}>{templates.map((template) => <option key={template.name} value={template.name}>{template.name}</option>)}</select></label>
              <label className="foundation-field"><span>Participants</span><select name="participantIds" multiple size={Math.min(6, Math.max(2, people.length))}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><small>You are included automatically. Choose colleagues within your people scope.</small></label>
              {canViewMatters ? <label className="foundation-field"><span>Related matter (optional)</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label> : null}
              <label className="team-checkbox"><input type="checkbox" name="urgent" /> Mark as urgent</label>
              <SubmitButton>Schedule meeting</SubmitButton>
            </ActionForm>
          ) : <p className="foundation-muted">Publish at least one minutes template in Setup Centre and ensure permitted colleagues are available.</p>}
        </section>
      ) : <p className="foundation-muted">Your people permission allows viewing but not scheduling meetings.</p>}
    </section>
  );
}
