import Link from "next/link";
import { createTeamMeeting, saveTeamMeetingMinutes } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { TeamMeetingMinutesEditor } from "@/components/team-meeting-minutes-editor";
import { hasPermission, permissionScope, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { meetingVisibleInPeopleScope } from "@/lib/team-rules";

type Search = { q?: string; tab?: string; from?: string; to?: string };

export default async function TeamMeetingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("people");
  const db = getDb();
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 100) ?? "";
  const tab = query.tab === "record" ? "record" : "older";
  const from = query.from && /^\d{4}-\d{2}-\d{2}$/.test(query.from) ? new Date(`${query.from}T00:00:00.000Z`) : null;
  const to = query.to && /^\d{4}-\d{2}-\d{2}$/.test(query.to) ? new Date(`${query.to}T00:00:00.000Z`) : null;
  if (to) to.setUTCDate(to.getUTCDate() + 1);
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
    const item = raw as { name?: unknown; layout?: unknown; sections?: unknown };
    if (typeof item.name !== "string" || !Array.isArray(item.sections)) return [];
    const layout = item.layout === "formal" || item.layout === "editorial" ? item.layout : "modern";
    return [{ name: item.name, layout, sections: item.sections.filter((section): section is string => typeof section === "string") }];
  }) : [];
  const published = setup?.published && typeof setup.published === "object" ? setup.published as Record<string, unknown> : {};
  const firmProfile = published.firmProfile && typeof published.firmProfile === "object" ? published.firmProfile as Record<string, unknown> : {};
  const logoUrl = typeof firmProfile.logoUrl === "string" ? firmProfile.logoUrl : "";
  const brandColour = typeof firmProfile.brandColour === "string" ? firmProfile.brandColour : "#b8913f";
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
        ...(from || to ? { startsAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } } : {}),
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
        actionItems: { where: { firmId: user.firmId }, orderBy: { createdAt: "asc" }, select: { id: true, title: true, assignedTo: { select: { name: true } }, taskId: true, task: { select: { status: true, dueAt: true } } } },
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
  const unsavedMeetings = visibleMeetings.filter((meeting) => {
    const minutes = meeting.minutes && typeof meeting.minutes === "object" ? meeting.minutes as Record<string, unknown> : {};
    return !minutes.savedAt;
  });
  const checkIns = visibleMeetings
    .filter((meeting) => meeting.startsAt < new Date())
    .flatMap((meeting) => meeting.actionItems.map((item) => ({ ...item, meetingTitle: meeting.title, meetingDate: meeting.startsAt })))
    .slice(0, 60);
  return (
    <section className="foundation-page team-meetings-page">
      <FoundationHeader title="Meetings & minutes" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Record team meetings using the firm’s branded minutes templates. Meeting visibility follows your Own, Team or Firm people scope.</p>
      <nav className="team-meeting-tabs" aria-label="Meeting views">
        <Link aria-current={tab === "older" ? "page" : undefined} href="/team/meetings?tab=older">Older Meetings</Link>
        <Link aria-current={tab === "record" ? "page" : undefined} href="/team/meetings?tab=record">Record a Meeting</Link>
      </nav>

      {tab === "older" ? <>
        <form action="/team/meetings" className="foundation-inline-form matter-search team-meeting-search">
          <input type="hidden" name="tab" value="older" />
          <label className="foundation-field"><span>Search meeting title</span><input name="q" defaultValue={q} maxLength={100} placeholder="Meeting title or template" /></label>
          <label className="foundation-field"><span>From date</span><input name="from" type="date" defaultValue={query.from ?? ""} /></label>
          <label className="foundation-field"><span>To date</span><input name="to" type="date" defaultValue={query.to ?? ""} /></label>
          <button className="button-primary" type="submit">Search meetings</button>
        </form>
        <div className="team-meeting-list">
          {visibleMeetings.filter((meeting) => {
            const minutes = meeting.minutes && typeof meeting.minutes === "object" ? meeting.minutes as Record<string, unknown> : {};
            return Boolean(minutes.savedAt);
          }).map((meeting) => {
            const minutes = meeting.minutes && typeof meeting.minutes === "object" ? meeting.minutes as Record<string, unknown> : {};
            const layout = minutes.layout === "formal" || minutes.layout === "editorial" ? minutes.layout : templates.find((template) => template.name === meeting.templateName)?.layout ?? "modern";
            const sections = Array.isArray(minutes.sections) ? minutes.sections as { heading?: string; topics?: string[] }[] : [];
            const attendingIds = Array.isArray(minutes.attendingIds) ? minutes.attendingIds as string[] : meeting.participants.map((participant) => participant.userId);
            const messageOfWeek = typeof minutes.messageOfWeek === "string" ? minutes.messageOfWeek : "";
            const legacyNotes = typeof minutes.notes === "string" ? minutes.notes : "";
            const matterAllowed = !!meeting.matter && canViewMatters && (user.isOwner || matterScope === "Firm" || meeting.matter.responsibleId === user.id || matterScope === "Team" && matterReports.some((item) => item.userId === meeting.matter!.responsibleId));
            return <article className={`team-meeting-card minutes-paper minutes-layout-${layout}`} style={{ "--minutes-brand": brandColour } as React.CSSProperties} key={meeting.id}>
              <header className="minutes-paper-header">{logoUrl ? <img alt={`${user.firm.name} logo`} src={logoUrl} /> : <span className="minutes-paper-wordmark">{user.firm.name}</span>}<span className="minutes-layout-label">{meeting.templateName}</span></header>
              <p className="minutes-paper-date">{meeting.startsAt.toLocaleString()}</p>
              <h2 className="minutes-paper-title">{meeting.title}</h2>
              <p className="foundation-muted">Organized by {meeting.createdBy.name}{meeting.urgent ? " · Urgent" : ""}</p>
              {matterAllowed ? <p className="foundation-muted">Matter: {meeting.matter!.matterNumber} · {meeting.matter!.clientName} {meeting.matter!.clientSurname}</p> : null}
              <section className="minutes-paper-attendees"><h3>Present</h3><p>{meeting.participants.filter((participant) => attendingIds.includes(participant.userId)).map((participant) => participant.user.name).join(", ") || "No attendees recorded"}</p></section>
              {messageOfWeek ? <section className="minutes-message-week"><h3>Message of the week</h3><p>{messageOfWeek}</p></section> : null}
              {sections.map((section, sectionIndex) => <section className="minutes-discussion-section" key={`${meeting.id}-${sectionIndex}`}><h3 className="minutes-section-heading-display">{section.heading}</h3>{(section.topics ?? []).map((topic, topicIndex) => <p className="minutes-saved-topic" key={`${meeting.id}-${sectionIndex}-${topicIndex}`}><span>{sectionIndex + 1}.{topicIndex + 1}</span>{topic}</p>)}</section>)}
              {legacyNotes ? <section className="team-minutes"><h3>Minutes</h3><pre>{legacyNotes}</pre></section> : null}
              {meeting.actionItems.length ? <section className="minutes-assigned-tasks"><h3>Assigned tasks and check-ins</h3><ul>{meeting.actionItems.map((item) => <li key={item.id}><strong>{item.title}</strong> · {item.assignedTo.name} · {item.task?.status === "Complete" ? "Completed" : "Check in"}{item.task?.dueAt ? ` · Due ${item.task.dueAt.toLocaleDateString()}` : ""}</li>)}</ul></section> : null}
            </article>;
          })}
          {!visibleMeetings.some((meeting) => meeting.minutes && typeof meeting.minutes === "object" && Boolean((meeting.minutes as Record<string, unknown>).savedAt)) ? <section className="foundation-panel"><p>No older meetings match these filters.</p></section> : null}
        </div>
      </> : <>
        {checkIns.length ? <section className="foundation-panel meeting-checkins">
          <div className="team-meeting-heading"><div><p className="eyebrow">FOLLOW-UP FROM PREVIOUS MEETINGS</p><h2>Check-ins</h2></div></div>
          <div className="foundation-table-wrap"><table className="foundation-table"><thead><tr><th>Status</th><th>Previous meeting</th><th>Task</th><th>Assigned to</th><th>Due</th></tr></thead><tbody>
            {checkIns.map((item) => <tr key={item.id}><td>{item.task?.status === "Complete" ? "Completed" : "Check in"}</td><td>{item.meetingTitle} · {item.meetingDate.toLocaleDateString()}</td><td>{item.title}</td><td>{item.assignedTo.name}</td><td>{item.task?.dueAt?.toLocaleDateString() ?? "No due date"}</td></tr>)}
          </tbody></table></div>
        </section> : <section className="foundation-panel meeting-checkins"><p className="foundation-muted">No follow-up tasks from previous meetings.</p></section>}

        {canEditPeople ? <section className="foundation-panel meeting-record-panel">
          <h2>Meeting details</h2>
          {templates.length && people.length ? <ActionForm action={createTeamMeeting} className="foundation-form">
            <label className="foundation-field"><span>Meeting heading</span><input name="title" required maxLength={160} /></label>
            <label className="foundation-field"><span>Date and time</span><input type="datetime-local" name="startsAt" required /></label>
            <label className="foundation-field"><span>Minutes template</span><select name="templateName" required defaultValue={templates[0].name}>{templates.map((template) => <option key={template.name} value={template.name}>{template.name} · {template.layout[0].toUpperCase() + template.layout.slice(1)}</option>)}</select></label>
            <fieldset className="meeting-attendee-picker"><legend>Employees attending</legend><label className="setup-checkbox-field"><input type="checkbox" checked disabled /><span>{user.name} (organizer)</span></label>{people.map((person) => <label className="setup-checkbox-field" key={person.id}><input type="checkbox" name="participantIds" value={person.id} /><span>{person.name}</span></label>)}</fieldset>
            {canViewMatters ? <label className="foundation-field"><span>Related matter (optional)</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label> : null}
            <label className="team-checkbox"><input type="checkbox" name="urgent" /> Mark as urgent</label>
            <SubmitButton>Start meeting record</SubmitButton>
          </ActionForm> : <p className="foundation-muted">Publish at least one minutes template in Setup Centre and ensure permitted colleagues are available.</p>}
        </section> : <p className="foundation-muted">Your people permission allows viewing but not recording meetings.</p>}

        {unsavedMeetings.length ? <section className="team-meeting-list meeting-needs-minutes">
          <h2>Meetings ready for minutes</h2>
          {unsavedMeetings.map((meeting) => {
            const template = templates.find((item) => item.name === meeting.templateName) ?? { name: meeting.templateName, layout: "modern", sections: ["Discussion"] };
            const participants = meeting.participants.map((participant) => ({ id: participant.userId, name: participant.user.name }));
            const matterAllowed = !!meeting.matter && canViewMatters && (user.isOwner || matterScope === "Firm" || meeting.matter.responsibleId === user.id || matterScope === "Team" && matterReports.some((item) => item.userId === meeting.matter!.responsibleId));
            return <article className="foundation-panel team-meeting-card" key={meeting.id}>
              <div className="team-meeting-heading"><div><p className="eyebrow">{meeting.templateName} · {meeting.startsAt.toLocaleString()}</p><h2>{meeting.title}</h2></div>{meeting.urgent ? <span className="team-urgent-badge">Urgent</span> : null}</div>
              <p className="foundation-muted">Organized by {meeting.createdBy.name} · Invited: {participants.map((person) => person.name).join(", ")}</p>
              {matterAllowed ? <p className="foundation-muted">Matter: {meeting.matter!.matterNumber} · {meeting.matter!.clientName} {meeting.matter!.clientSurname}</p> : null}
              {canEditPeople && (user.isOwner || meeting.createdById === user.id) ? <TeamMeetingMinutesEditor action={saveTeamMeetingMinutes} meetingId={meeting.id} meetingTitle={meeting.title} meetingDate={meeting.startsAt.toLocaleString()} firmName={user.firm.name} logoUrl={logoUrl} brandColour={brandColour} template={template} participants={participants} canAssignTasks={canEditTasks} /> : <p className="foundation-muted">Only the meeting organizer or firm owner can record these minutes.</p>}
            </article>;
          })}
        </section> : null}
      </>}
    </section>
  );
}
