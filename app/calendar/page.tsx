import { ConsultationRequestsPanel } from "@/components/consultation-requests";
import Link from "next/link";
import { addCalendarChecklistItem, createCalendarEvent, createCalendarFollowUpTask, toggleCalendarChecklistItem } from "@/app/actions/calendar";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { completeTask } from "@/app/actions/matters";
import { calendarRange, dateKey, effectiveCalendarVisibility, parseCalendarDate, validCalendarView } from "@/lib/calendar";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

type Search = { date?: string; view?: string; types?: string | string[]; calendars?: string | string[]; filtered?: string; audienceFiltered?: string; audience?: string | string[] };
type CalendarRecord = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  kind: "manual" | "meeting" | "task" | "duty";
  audience: "Internal" | "Client";
  responsible: string;
  ownerId: string;
  matterId: string | null;
  matterNumber: string | null;
  meetingUrl: string | null;
  description: string | null;
  checklist: { id: string; label: string; completed: boolean }[];
  documents: { label: string; url: string }[];
  attendees: string[];
  createdById: string;
  taskId?: string;
};

function dateParam(date: Date) {
  return dateKey(date);
}

function dayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
}

function calendarHref(date: Date, view: string, calendars: string[], types: string[], audiences: string[]) {
  const params = new URLSearchParams({ date: dateParam(date), view, filtered: "1", audienceFiltered: "1" });
  for (const id of calendars) params.append("calendars", id);
  for (const type of types) params.append("types", type);
  for (const audience of audiences) params.append("audience", audience);
  return `/calendar?${params.toString()}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("calendar");
  const canViewTasks = hasPermission(user, "tasks");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const canViewMatters = hasPermission(user, "matters");
  const query = await searchParams;
  const db = getDb();
  const setup = await db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } });
  const published = setup?.published && typeof setup.published === "object" ? setup.published as {
    calendarVisibility?: { roles?: { role?: string; visibility?: string }[] };
  } : {};
  const allowedVisibility = published.calendarVisibility?.roles?.find((item) => item.role === user.role?.name)?.visibility;
  const configuredVisibility = allowedVisibility === "Team" || allowedVisibility === "Firm" ? allowedVisibility : "Own";
  const visibility = effectiveCalendarVisibility(permissionScope(user, "calendar"), configuredVisibility, user.isOwner);
  const reports = visibility === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const matterScope = permissionScope(user, "matters");
  const matterReports = matterScope === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const taskScope = permissionScope(user, "tasks");
  const taskReports = taskScope === "Team" && canViewTasks ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const colleagues = visibility === "Firm"
    ? await db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
    : visibility === "Team"
      ? await db.user.findMany({ where: { firmId: user.firmId, active: true, id: { in: [user.id, ...reports.map((item) => item.userId)] } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
      : [{ id: user.id, name: user.name, email: user.email }];
  const requestedCalendars = query.calendars === undefined ? [user.id] : Array.isArray(query.calendars) ? query.calendars : [query.calendars];
  const selectedIds = requestedCalendars.filter((id) => colleagues.some((person) => person.id === id));
  const ownerIds = selectedIds.length ? selectedIds : [user.id];
  const taskOwnerIds = taskScope === "Firm"
    ? ownerIds
    : taskScope === "Team"
      ? ownerIds.filter((id) => id === user.id || taskReports.some((report) => report.userId === id))
      : ownerIds.filter((id) => id === user.id);
  const date = parseCalendarDate(query.date);
  const view = validCalendarView(query.view);
  const range = calendarRange(date, view);
  const requestedTypes = query.types === undefined ? [] : Array.isArray(query.types) ? query.types : [query.types];
  const activeTypes = (query.filtered ? requestedTypes : ["manual", "meetings", "tasks", "duties"])
    .filter((type) => (type === "manual" || type === "meetings" || type === "tasks" || type === "duties") &&
      (type !== "tasks" || canViewTasks) && (type !== "duties" || canViewMatters || canViewTasks));
  const requestedAudiences = query.audience === undefined ? [] : Array.isArray(query.audience) ? query.audience : [query.audience];
  const activeAudiences = query.audienceFiltered
    ? requestedAudiences.filter((audience) => audience === "Internal" || audience === "Client")
    : ["Internal", "Client"];
  const [manualEvents, meetings, tasks, matters, dutyMatterIds] = await Promise.all([
    activeTypes.includes("manual") ? db.calendarEvent.findMany({
      where: {
        firmId: user.firmId,
        startAt: { lt: range.end },
        endAt: { gte: range.start },
        OR: [{ ownerId: { in: ownerIds } }, { attendees: { some: { firmId: user.firmId, userId: { in: ownerIds } } } }],
      },
      include: {
        responsible: { select: { name: true } },
        matter: { select: { id: true, matterNumber: true, responsibleId: true } },
        attendees: { where: { firmId: user.firmId }, include: { user: { select: { id: true, name: true } } } },
        checklist: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, completed: true } },
        documents: { orderBy: { createdAt: "asc" }, select: { label: true, url: true } },
      },
      orderBy: { startAt: "asc" },
      take: 500,
    }) : [],
    activeTypes.includes("meetings") ? db.teamMeeting.findMany({
      where: {
        firmId: user.firmId,
        startsAt: { gte: range.start, lt: range.end },
        OR: [
          { createdById: { in: ownerIds } },
          { participants: { some: { firmId: user.firmId, userId: { in: ownerIds } } } },
        ],
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        participants: { where: { firmId: user.firmId }, include: { user: { select: { name: true } } } },
      },
      orderBy: { startsAt: "asc" },
      take: 500,
    }) : [],
    activeTypes.includes("tasks") ? db.task.findMany({
      where: {
        firmId: user.firmId,
        status: "Open",
        dueAt: { gte: range.start, lt: range.end },
        assignedToId: { in: taskOwnerIds },
      },
      include: {
        assignedTo: { select: { name: true } },
        matter: { select: { id: true, matterNumber: true, responsibleId: true } },
      },
      orderBy: { dueAt: "asc" },
      take: 500,
    }) : [],
    canViewMatters ? db.matter.findMany({
      where: { firmId: user.firmId, status: { not: "Closed" }, ...(matterScope === "Own" ? { responsibleId: user.id } : matterScope === "Team" ? { responsibleId: { in: [user.id, ...matterReports.map((item) => item.userId)] } } : {}) },
      select: { id: true, matterNumber: true, responsibleId: true },
      orderBy: { matterNumber: "asc" },
      take: 500,
    }) : [],
    canViewMatters ? db.matter.findMany({
      where: { firmId: user.firmId, ...(matterScope === "Own" ? { responsibleId: user.id } : matterScope === "Team" ? { responsibleId: { in: [user.id, ...matterReports.map((item) => item.userId)] } } : {}) },
      select: { id: true },
    }) : [],
  ]);
  const duties = activeTypes.includes("duties") ? await db.dutyRecord.findMany({
    where: {
      firmId: user.firmId,
      status: "Scheduled",
      dueAt: { gte: range.start, lt: range.end },
      assignedToId: { in: ownerIds },
      OR: [
        ...(dutyMatterIds.length ? [{ matterId: { in: dutyMatterIds.map((matter) => matter.id) } }] : []),
        ...(canViewTasks ? [{ matterId: null, assignedToId: { in: taskOwnerIds } }] : []),
      ],
    },
    select: {
      id: true, title: true, method: true, dueAt: true, assignedToId: true,
      assignedTo: { select: { name: true } },
      matter: { select: { id: true, matterNumber: true } },
    },
    orderBy: { dueAt: "asc" }, take: 500,
  }) : [];
  const matterById = new Map(matters.map((matter) => [matter.id, matter]));
  const events: CalendarRecord[] = [
    ...manualEvents.map((event) => ({
      id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt, kind: "manual" as const,
      audience: event.audience, responsible: event.responsible.name, ownerId: event.ownerId,
      matterId: event.matterId && matterById.has(event.matterId) ? event.matterId : null,
      matterNumber: event.matterId ? matterById.get(event.matterId)?.matterNumber ?? null : null, meetingUrl: event.meetingUrl,
      description: event.description, checklist: event.checklist, documents: event.documents, createdById: event.createdById,
      attendees: event.attendees.map((item) => item.user.name),
    })),
    ...meetings.map((meeting) => ({
      id: `meeting-${meeting.id}`,
      title: meeting.title,
      startAt: meeting.startsAt,
      endAt: meeting.startsAt,
      kind: "meeting" as const,
      audience: "Internal" as const,
      responsible: meeting.createdBy.name,
      ownerId: meeting.createdById,
      matterId: meeting.matterId && matterById.has(meeting.matterId) ? meeting.matterId : null,
      matterNumber: meeting.matterId ? matterById.get(meeting.matterId)?.matterNumber ?? null : null,
      meetingUrl: null,
      description: `${meeting.templateName}${meeting.urgent ? " · Urgent" : ""}`,
      checklist: [],
      documents: [],
      createdById: meeting.createdById,
      attendees: meeting.participants.map((participant) => participant.user.name),
    })),
    ...tasks.map((task) => ({
      id: `task-${task.id}`, taskId: task.id, title: task.title, startAt: task.dueAt!, endAt: task.dueAt!,
      kind: "task" as const, audience: "Internal" as const, responsible: task.assignedTo.name, ownerId: task.assignedToId,
      matterId: task.matterId && matterById.has(task.matterId) ? task.matterId : null,
      matterNumber: task.matterId ? matterById.get(task.matterId)?.matterNumber ?? null : null, meetingUrl: null, description: null,
      checklist: [], documents: [], createdById: "",
      attendees: [],
    })),
    ...duties.map((duty) => ({
      id: `duty-${duty.id}`, title: duty.title, startAt: duty.dueAt!, endAt: duty.dueAt!,
      kind: "duty" as const, audience: "Internal" as const, responsible: duty.assignedTo.name, ownerId: duty.assignedToId,
      matterId: duty.matter && matterById.has(duty.matter.id) ? duty.matter.id : null,
      matterNumber: duty.matter ? matterById.get(duty.matter.id)?.matterNumber ?? null : null,
      meetingUrl: null, description: `Duty method: ${duty.method}`, checklist: [], documents: [], createdById: "", attendees: [],
    })),
  ].filter((event) => event.kind === "task" || event.kind === "duty" || event.kind === "meeting" ? activeAudiences.includes("Internal") : activeAudiences.includes(event.audience))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const calendarDays: Date[] = [];
  if (view === "month") {
    for (let day = range.start; day < range.end; day = new Date(day.getTime() + 86400000)) calendarDays.push(day);
  } else {
    const dayCount = view === "day" ? 1 : view === "three-day" ? 3 : view === "week" ? 7 : 31;
    for (let offset = 0; offset < dayCount; offset++) calendarDays.push(new Date(date.getTime() + offset * 86400000));
  }
  const prev = new Date(date);
  const next = new Date(date);
  const shift = view === "month" ? 1 : view === "week" ? 7 : view === "three-day" ? 3 : 1;
  prev.setUTCDate(prev.getUTCDate() - shift);
  next.setUTCDate(next.getUTCDate() + shift);
  const matterAllowed = user.isOwner || user.role?.permissions.some((permission) => permission.module === "matters" && permission.level !== "None");
  const taskAllowed = canEditTasks;
  const taskAssigneeIds = taskScope === "Firm"
    ? colleagues.map((person) => person.id)
    : taskScope === "Team"
      ? [user.id, ...taskReports.map((report) => report.userId)]
      : [user.id];
  const taskAssignees = colleagues.filter((person) => taskAssigneeIds.includes(person.id));

  return (
    <section className="foundation-page calendar-page">
      <FoundationHeader title="Calendar" firm={user.firm.name} />
      {canViewMatters ? <ConsultationRequestsPanel firmId={user.firmId} canHandle={hasPermission(user, "matters", "Edit")} /> : null}
      <div className="calendar-toolbar">
        <div className="calendar-month-number" aria-label={date.toLocaleDateString("en-ZA", { month: "long", timeZone: "UTC" })}>
          <strong>{date.getUTCMonth() + 1}</strong>
        </div>
        <div className="calendar-nav">
          <Link href={calendarHref(prev, view, ownerIds, activeTypes, activeAudiences)}>Previous</Link>
          <Link href={calendarHref(new Date(), view, ownerIds, activeTypes, activeAudiences)}>Today</Link>
          <Link href={calendarHref(next, view, ownerIds, activeTypes, activeAudiences)}>Next</Link>
          <strong>{new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)}</strong>
        </div>
        <nav className="calendar-view-switch" aria-label="Calendar view">
          {(["day", "three-day", "week", "month", "agenda"] as const).map((option) => (
            <Link key={option} aria-current={view === option ? "page" : undefined} href={calendarHref(date, option, ownerIds, activeTypes, activeAudiences)}>{option === "three-day" ? "3-day" : option[0].toUpperCase() + option.slice(1)}</Link>
          ))}
        </nav>
      </div>
      <div className="calendar-layout">
        <aside className="calendar-sidebar">
          <section className="foundation-panel">
            <h2>Calendars</h2>
            <form action="/calendar" className="calendar-list">
              <input type="hidden" name="date" value={dateParam(date)} />
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="filtered" value="1" />
              <input type="hidden" name="audienceFiltered" value="1" />
              {activeTypes.map((type) => <input key={type} type="hidden" name="types" value={type} />)}
              {activeAudiences.map((audience) => <input key={audience} type="hidden" name="audience" value={audience} />)}
              <label><input type="checkbox" name="calendars" value={user.id} defaultChecked={ownerIds.includes(user.id)} /> My calendar</label>
              {colleagues.filter((person) => person.id !== user.id).map((person) => (
                <label key={person.id}><input type="checkbox" name="calendars" value={person.id} defaultChecked={ownerIds.includes(person.id)} /> {person.name}</label>
              ))}
              <button className="button-secondary" type="submit">Show selected</button>
            </form>
          </section>
          <section className="foundation-panel">
            <h2>Event types</h2>
            <form action="/calendar">
              <input type="hidden" name="date" value={dateParam(date)} />
              <input type="hidden" name="view" value={view} />
              {ownerIds.map((id) => <input key={id} type="hidden" name="calendars" value={id} />)}
              <input type="hidden" name="filtered" value="1" />
              <input type="hidden" name="audienceFiltered" value="1" />
              <label className="calendar-filter"><input type="checkbox" name="types" value="manual" defaultChecked={activeTypes.includes("manual")} /> Events</label>
              <label className="calendar-filter"><input type="checkbox" name="types" value="meetings" defaultChecked={activeTypes.includes("meetings")} /> Team meetings</label>
              {canViewTasks ? <label className="calendar-filter"><input type="checkbox" name="types" value="tasks" defaultChecked={activeTypes.includes("tasks")} /> Task due dates</label> : null}
              {canViewMatters || canViewTasks ? <label className="calendar-filter"><input type="checkbox" name="types" value="duties" defaultChecked={activeTypes.includes("duties")} /> Scheduled duty dates</label> : null}
              <label className="calendar-filter"><input type="checkbox" name="audience" value="Internal" defaultChecked={activeAudiences.includes("Internal")} /> Internal events</label>
              <label className="calendar-filter"><input type="checkbox" name="audience" value="Client" defaultChecked={activeAudiences.includes("Client")} /> Client-facing events</label>
              <button className="button-secondary" type="submit">Apply filters</button>
            </form>
          </section>
          {user.role?.permissions.some((permission) => permission.module === "calendar" && permission.level === "Edit") || user.isOwner ? (
            <section className="foundation-panel">
              <h2>Add an event</h2>
              <ActionForm action={createCalendarEvent} className="foundation-form calendar-event-form">
                <label className="foundation-field"><span>Event name</span><input name="title" maxLength={160} required /></label>
                <label className="foundation-field"><span>Starts</span><input name="startAt" type="datetime-local" required /></label>
                <label className="foundation-field"><span>Ends</span><input name="endAt" type="datetime-local" required /></label>
                <label className="foundation-field"><span>Responsible person</span><select name="responsibleId" required>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="foundation-field"><span>Attending colleagues</span><select name="attendeeIds" multiple size={Math.min(4, Math.max(2, colleagues.length))}>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="foundation-field"><span>Audience</span><select name="audience"><option value="Internal">Internal</option><option value="Client">Client</option></select></label>
                <details><summary>More event details</summary>
                  {matterAllowed ? <label className="foundation-field"><span>Matter</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber}</option>)}</select></label> : null}
                  <label className="foundation-field"><span>Meeting link (HTTPS)</span><input name="meetingUrl" type="url" /></label>
                  <label className="foundation-field"><span>Notes</span><textarea name="description" maxLength={4000} /></label>
                  <label className="foundation-field"><span>Document link label</span><input name="documentLabel" maxLength={160} /></label>
                  <label className="foundation-field"><span>Document link (HTTPS)</span><input name="documentUrl" type="url" /></label>
                </details>
                <SubmitButton>Add event</SubmitButton>
              </ActionForm>
            </section>
          ) : null}
        </aside>
        <div className={`calendar-grid calendar-${view}`}>
          {view !== "agenda" ? (
            <div className="calendar-day-headings">{(view === "month"
              ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
              : calendarDays.map((day) => dayLabel(day))).map((label, index) => <strong key={`${label}-${index}`}>{label}</strong>)}</div>
          ) : null}
          <div className="calendar-day-grid">
            {calendarDays.map((day) => (
              <section className={`calendar-day-cell${day.getUTCMonth() !== date.getUTCMonth() && view === "month" ? " is-adjacent-month" : ""}`} key={dateKey(day)}>
                <h3><span className="calendar-month-day">{view === "month" ? day.getUTCDate() : dayLabel(day)}</span></h3>
                <ul>
                  {events.filter((event) => event.startAt < new Date(day.getTime() + 86400000) && event.endAt >= day).map((event) => (
                    <li key={event.id} className={`calendar-event calendar-${event.audience.toLowerCase()} calendar-${event.kind}`}>
                      {event.kind !== "manual" ? <span className="calendar-event-time">Due</span> : <span className="calendar-event-time">{timeLabel(event.startAt)}</span>}
                      <details>
                        <summary>{event.title}</summary>
                        <div className="calendar-event-panel">
                          <p>{event.kind === "manual" ? `${timeLabel(event.startAt)}–${timeLabel(event.endAt)}` : `Due ${event.startAt.toLocaleDateString()}`}</p>
                          <p>{event.audience === "Client" ? "Client-facing event" : "Internal event"} · {event.responsible}</p>
                          {event.attendees.length ? <p>Attending: {event.attendees.join(", ")}</p> : null}
                          {event.matterId && event.matterNumber ? <p><Link href={`/matters/${event.matterId}`}>Matter {event.matterNumber}</Link></p> : null}
                          {event.description ? <p>{event.description}</p> : null}
                          {event.meetingUrl ? <p><a href={event.meetingUrl} target="_blank" rel="noreferrer">Join online meeting</a></p> : null}
                          {event.documents.map((document) => <p key={`${event.id}-${document.url}`}><a href={document.url} target="_blank" rel="noreferrer">{document.label}</a></p>)}
                          {event.taskId && hasPermission(user, "tasks", "Edit") ? <ActionForm action={completeTask}><input type="hidden" name="taskId" value={event.taskId} /><SubmitButton>Complete task</SubmitButton></ActionForm> : null}
                          {event.checklist.length ? <ul className="calendar-checklist">{event.checklist.map((item) => (
                            <li key={item.id}><ActionForm action={toggleCalendarChecklistItem} className="calendar-check-form"><input type="hidden" name="itemId" value={item.id} /><button className="button-secondary" type="submit">{item.completed ? "Done" : "To do"}: {item.label}</button></ActionForm></li>
                          ))}</ul> : null}
                          {event.kind === "manual" && event.createdById === user.id ? (
                            <>
                              <ActionForm action={addCalendarChecklistItem} className="calendar-add-check"><input type="hidden" name="eventId" value={event.id} /><label className="foundation-field"><span>Add preparation checklist item</span><input name="label" maxLength={160} required /></label><SubmitButton>Add item</SubmitButton></ActionForm>
                              {taskAllowed ? <ActionForm action={createCalendarFollowUpTask} className="calendar-add-check"><input type="hidden" name="eventId" value={event.id} /><label className="foundation-field"><span>Follow-up task</span><input name="title" maxLength={160} required defaultValue={`Follow up: ${event.title}`} /></label><label className="foundation-field"><span>Assign to</span><select name="assignedToId">{taskAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="foundation-field"><span>Due date</span><input name="dueAt" type="datetime-local" required /></label><SubmitButton>Create follow-up task</SubmitButton></ActionForm> : null}
                            </>
                          ) : null}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {!events.length ? <p className="foundation-muted calendar-empty">No events or due tasks in this view. Add an event or widen the date range.</p> : null}
        </div>
      </div>
    </section>
  );
}
