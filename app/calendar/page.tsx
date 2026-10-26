import type { CSSProperties } from "react";
import Link from "next/link";
import {
  addCalendarChecklistItem, createCalendar, createCalendarEvent, createCalendarFollowUpTask, deleteCalendar, deleteCalendarEvent,
  syncCalendarFromOutlook, toggleCalendarChecklistItem, updateCalendar, updateCalendarEvent,
} from "@/app/actions/calendar";
import { completeTask } from "@/app/actions/matters";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConsultationRequestsPanel } from "@/components/consultation-requests";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { calendarRange, dateKey, effectiveCalendarVisibility, parseCalendarDate, validCalendarView } from "@/lib/calendar";
import { CALENDAR_COLOURS, calendarRight, type CalendarRight } from "@/lib/calendar-access";
import { getDb } from "@/lib/db";
import { hasMicrosoftConnection } from "@/lib/microsoft-graph";

type Search = {
  date?: string; view?: string; types?: string | string[]; calendars?: string | string[]; shared?: string | string[]; filtered?: string;
  audienceFiltered?: string; audience?: string | string[]; agendaWeek?: string; newAt?: string; event?: string; hours?: string;
  newCalendar?: string; manage?: string;
};
type CalendarRecord = {
  id: string; title: string; startAt: Date; endAt: Date; kind: "manual" | "meeting" | "task" | "duty"; audience: "Internal" | "Client";
  responsible: string; ownerId: string; matterId: string | null; matterNumber: string | null; meetingUrl: string | null; description: string | null;
  checklist: { id: string; label: string; completed: boolean }[]; documents: { label: string; url: string }[]; attendees: string[]; attendeeIds: string[];
  createdById: string; taskId?: string; calendarId: string | null; calendarName: string; colour: string | null; canEdit: boolean;
};
type SharedCalendar = { id: string; name: string; colour: string; description: string | null; firmAccess: "View" | "Edit" | null; createdById: string; createdBy: string; right: CalendarRight; shares: { userId: string; access: "View" | "Edit" }[] };

const DAY = 86_400_000;
const dayLabel = (date: Date) => new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(date);
const timeLabel = (date: Date) => new Intl.DateTimeFormat("en-ZA", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(date);
function dateTimeInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
const list = (value: string | string[] | undefined) => value === undefined ? undefined : Array.isArray(value) ? value : [value];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("calendar");
  const query = await searchParams;
  const db = getDb();
  const canViewTasks = hasPermission(user, "tasks");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const canViewMatters = hasPermission(user, "matters");
  const canEditCalendar = user.isOwner || hasPermission(user, "calendar", "Edit");
  const matterScope = permissionScope(user, "matters");
  const taskScope = permissionScope(user, "tasks");

  // Everything that does not depend on another query runs at the same time.
  const [teamsReady, setup, reportLinks, sharedCalendarRows] = await Promise.all([
    hasMicrosoftConnection(user.firmId),
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
    db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } }),
    db.calendar.findMany({
      where: { firmId: user.firmId, ...(user.isOwner ? {} : { OR: [{ createdById: user.id }, { firmAccess: { not: null } }, { shares: { some: { userId: user.id } } }] }) },
      select: { id: true, name: true, colour: true, description: true, firmAccess: true, createdById: true, createdBy: { select: { name: true } }, shares: { select: { userId: true, access: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const published = setup?.published && typeof setup.published === "object" ? setup.published as { calendarVisibility?: { roles?: { role?: string; visibility?: string }[] } } : {};
  const allowedVisibility = published.calendarVisibility?.roles?.find((item) => item.role === user.role?.name)?.visibility;
  const visibility = effectiveCalendarVisibility(permissionScope(user, "calendar"), allowedVisibility === "Team" || allowedVisibility === "Firm" ? allowedVisibility : "Own", user.isOwner);
  const reportIds = reportLinks.map((item) => item.userId);
  const sharedCalendars: SharedCalendar[] = sharedCalendarRows.flatMap((calendar) => {
    const right = calendarRight(calendar, user.id, user.isOwner);
    return right ? [{ ...calendar, createdBy: calendar.createdBy.name, right }] : [];
  });
  const [colleagues, allColleagues] = await Promise.all([
    visibility === "Firm"
      ? db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
      : visibility === "Team"
        ? db.user.findMany({ where: { firmId: user.firmId, active: true, id: { in: [user.id, ...reportIds] } }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
        : Promise.resolve([{ id: user.id, name: user.name, email: user.email }]),
    db.user.findMany({ where: { firmId: user.firmId, active: true, id: { not: user.id } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const requestedPeople = list(query.calendars) ?? [user.id];
  const ownerIds = requestedPeople.filter((id) => colleagues.some((person) => person.id === id));
  const requestedShared = list(query.shared) ?? sharedCalendars.map((calendar) => calendar.id);
  const sharedIds = requestedShared.filter((id) => sharedCalendars.some((calendar) => calendar.id === id));
  const taskOwnerIds = taskScope === "Firm" ? ownerIds : taskScope === "Team" ? ownerIds.filter((id) => id === user.id || reportIds.includes(id)) : ownerIds.filter((id) => id === user.id);
  const date = parseCalendarDate(query.date);
  const view = validCalendarView(query.view);
  const agendaWeek = query.agendaWeek === "next" ? "next" : "this";
  const fullDay = query.hours === "all";
  const range = view === "agenda" ? (() => {
    const start = new Date(date);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7) + (agendaWeek === "next" ? 7 : 0));
    return { start, end: new Date(start.getTime() + 7 * DAY) };
  })() : calendarRange(date, view);
  const requestedTypes = list(query.types) ?? [];
  const activeTypes = (query.filtered ? requestedTypes : ["manual", "meetings", "tasks", "duties"])
    .filter((type) => ["manual", "meetings", "tasks", "duties"].includes(type) && (type !== "tasks" || canViewTasks) && (type !== "duties" || canViewMatters || canViewTasks));
  const requestedAudiences = list(query.audience) ?? [];
  const activeAudiences = query.audienceFiltered ? requestedAudiences.filter((audience) => audience === "Internal" || audience === "Client") : ["Internal", "Client"];
  const matterFilter = matterScope === "Own" ? { responsibleId: user.id } : matterScope === "Team" ? { responsibleId: { in: [user.id, ...reportIds] } } : {};

  const [manualEvents, meetings, tasks, matters, duties] = await Promise.all([
    activeTypes.includes("manual") && (ownerIds.length || sharedIds.length) ? db.calendarEvent.findMany({
      where: {
        firmId: user.firmId, startAt: { lt: range.end }, endAt: { gte: range.start },
        OR: [
          ...(ownerIds.length ? [{ calendarId: null, OR: [{ ownerId: { in: ownerIds } }, { attendees: { some: { firmId: user.firmId, userId: { in: ownerIds } } } }] }] : []),
          ...(sharedIds.length ? [{ calendarId: { in: sharedIds } }] : []),
        ],
      },
      include: {
        responsible: { select: { name: true } },
        attendees: { where: { firmId: user.firmId }, select: { user: { select: { id: true, name: true } } } },
        checklist: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, completed: true } },
        documents: { orderBy: { createdAt: "asc" }, select: { label: true, url: true } },
      },
      orderBy: { startAt: "asc" }, take: 800,
    }) : [],
    activeTypes.includes("meetings") && ownerIds.length ? db.teamMeeting.findMany({
      where: { firmId: user.firmId, startsAt: { gte: range.start, lt: range.end }, OR: [{ createdById: { in: ownerIds } }, { participants: { some: { firmId: user.firmId, userId: { in: ownerIds } } } }] },
      include: { createdBy: { select: { id: true, name: true } }, participants: { where: { firmId: user.firmId }, select: { user: { select: { id: true, name: true } } } } },
      orderBy: { startsAt: "asc" }, take: 500,
    }) : [],
    activeTypes.includes("tasks") && taskOwnerIds.length ? db.task.findMany({
      where: { firmId: user.firmId, status: "Open", dueAt: { gte: range.start, lt: range.end }, assignedToId: { in: taskOwnerIds } },
      select: { id: true, title: true, dueAt: true, assignedToId: true, matterId: true, assignedTo: { select: { name: true } } },
      orderBy: { dueAt: "asc" }, take: 500,
    }) : [],
    canViewMatters ? db.matter.findMany({ where: { firmId: user.firmId, status: { not: "Closed" }, ...matterFilter }, select: { id: true, matterNumber: true }, orderBy: { matterNumber: "asc" }, take: 1000 }) : [],
    activeTypes.includes("duties") && ownerIds.length ? db.dutyRecord.findMany({
      where: {
        firmId: user.firmId, status: { notIn: ["Completed", "Returned"] }, dueAt: { gte: range.start, lt: range.end }, assignedToId: { in: ownerIds },
        OR: [...(canViewMatters ? [{ matter: { is: matterFilter } }] : []), ...(canViewTasks ? [{ matterId: null, assignedToId: { in: taskOwnerIds } }] : [])],
      },
      select: { id: true, title: true, method: true, dueAt: true, assignedToId: true, location: true, assignedTo: { select: { name: true } }, matter: { select: { id: true, matterNumber: true } } },
      orderBy: { dueAt: "asc" }, take: 500,
    }) : [],
  ]);

  const matterById = new Map(matters.map((matter) => [matter.id, matter]));
  const calendarById = new Map(sharedCalendars.map((calendar) => [calendar.id, calendar]));
  const personalEditable = new Set(visibility === "Own" ? [user.id] : colleagues.map((person) => person.id));
  const events: CalendarRecord[] = [
    ...manualEvents.map((event) => {
      const calendar = event.calendarId ? calendarById.get(event.calendarId) : undefined;
      return {
        id: event.id, title: event.title, startAt: event.startAt, endAt: event.endAt, kind: "manual" as const, audience: event.audience,
        responsible: event.responsible.name, ownerId: event.ownerId,
        matterId: event.matterId && matterById.has(event.matterId) ? event.matterId : null,
        matterNumber: event.matterId ? matterById.get(event.matterId)?.matterNumber ?? null : null,
        meetingUrl: event.meetingUrl, description: event.description, checklist: event.checklist, documents: event.documents, createdById: event.createdById,
        attendees: event.attendees.map((item) => item.user.name), attendeeIds: event.attendees.map((item) => item.user.id),
        calendarId: event.calendarId, calendarName: calendar?.name ?? "Personal", colour: calendar?.colour ?? null,
        canEdit: canEditCalendar && (calendar ? calendar.right !== "View" || event.createdById === user.id : personalEditable.has(event.ownerId)),
      };
    }),
    ...meetings.map((meeting) => ({
      id: `meeting-${meeting.id}`, title: meeting.title, startAt: meeting.startsAt, endAt: meeting.startsAt, kind: "meeting" as const, audience: "Internal" as const,
      responsible: meeting.createdBy.name, ownerId: meeting.createdById,
      matterId: meeting.matterId && matterById.has(meeting.matterId) ? meeting.matterId : null,
      matterNumber: meeting.matterId ? matterById.get(meeting.matterId)?.matterNumber ?? null : null,
      meetingUrl: null, description: `${meeting.templateName}${meeting.urgent ? " · Urgent" : ""}`, checklist: [], documents: [], createdById: meeting.createdById,
      attendees: meeting.participants.map((participant) => participant.user.name), attendeeIds: meeting.participants.map((participant) => participant.user.id),
      calendarId: null, calendarName: "Team meetings", colour: null, canEdit: false,
    })),
    ...tasks.map((task) => ({
      id: `task-${task.id}`, taskId: task.id, title: task.title, startAt: task.dueAt!, endAt: task.dueAt!, kind: "task" as const, audience: "Internal" as const,
      responsible: task.assignedTo.name, ownerId: task.assignedToId,
      matterId: task.matterId && matterById.has(task.matterId) ? task.matterId : null,
      matterNumber: task.matterId ? matterById.get(task.matterId)?.matterNumber ?? null : null,
      meetingUrl: null, description: null, checklist: [], documents: [], createdById: "", attendees: [], attendeeIds: [],
      calendarId: null, calendarName: "Tasks", colour: null, canEdit: false,
    })),
    ...duties.map((duty) => ({
      id: `duty-${duty.id}`, title: duty.title, startAt: duty.dueAt!, endAt: duty.dueAt!, kind: "duty" as const, audience: "Internal" as const,
      responsible: duty.assignedTo.name, ownerId: duty.assignedToId,
      matterId: duty.matter && matterById.has(duty.matter.id) ? duty.matter.id : null, matterNumber: duty.matter?.matterNumber ?? null,
      meetingUrl: null, description: `Court run · ${duty.method}${duty.location ? ` · ${duty.location}` : ""}`, checklist: [], documents: [], createdById: "",
      attendees: [], attendeeIds: [], calendarId: null, calendarName: "Court runs", colour: null, canEdit: false,
    })),
  ].filter((event) => event.kind === "manual" ? activeAudiences.includes(event.audience) : activeAudiences.includes("Internal"))
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

  const calendarDays: Date[] = [];
  if (view === "month") {
    for (let day = range.start; day < range.end; day = new Date(day.getTime() + DAY)) calendarDays.push(day);
  } else {
    const count = view === "day" ? 1 : view === "three-day" ? 3 : 7;
    const start = view === "agenda" || view === "week" ? range.start : date;
    for (let offset = 0; offset < count; offset++) calendarDays.push(new Date(start.getTime() + offset * DAY));
  }
  const navigationDate = view === "agenda" ? range.start : date;
  const shift = view === "month" ? 0 : view === "week" || view === "agenda" ? 7 : view === "three-day" ? 3 : 1;
  const prev = new Date(navigationDate); const next = new Date(navigationDate);
  if (view === "month") { prev.setUTCMonth(prev.getUTCMonth() - 1, 1); next.setUTCMonth(next.getUTCMonth() + 1, 1); }
  else { prev.setUTCDate(prev.getUTCDate() - shift); next.setUTCDate(next.getUTCDate() + shift); }

  const todayKey = dateKey(new Date());
  const href = (changes: Partial<{ date: Date; view: string; agendaWeek: string; hours: string; extra: Record<string, string> }> = {}) => {
    const params = new URLSearchParams({ date: dateKey(changes.date ?? date), view: changes.view ?? view, filtered: "1", audienceFiltered: "1" });
    const week = changes.agendaWeek ?? (view === "agenda" ? agendaWeek : undefined);
    if (week && (changes.view ?? view) === "agenda") params.set("agendaWeek", week);
    if ((changes.hours ?? (fullDay ? "all" : "")) === "all") params.set("hours", "all");
    if (!ownerIds.length) params.append("calendars", "none");
    for (const id of ownerIds) params.append("calendars", id);
    if (!sharedIds.length) params.append("shared", "none");
    for (const id of sharedIds) params.append("shared", id);
    for (const type of activeTypes) params.append("types", type);
    for (const audience of activeAudiences) params.append("audience", audience);
    for (const [key, value] of Object.entries(changes.extra ?? {})) params.set(key, value);
    return `/calendar?${params.toString()}`;
  };
  const currentHref = href();
  const addEventHref = (day: Date, hour = 9, minute = 0) => href({ date: day, extra: { newAt: `${dateKey(day)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` } });
  const eventHref = (event: CalendarRecord) => href({ extra: { event: event.id } });
  const selectedEvent = query.event ? events.find((event) => event.id === query.event) ?? null : null;
  const newEventStart = query.newAt && !Number.isNaN(new Date(query.newAt).getTime()) ? query.newAt : dateTimeInput(new Date(date.getTime() + 9 * 3600000));
  const newEventEnd = new Date(newEventStart); newEventEnd.setHours(newEventEnd.getHours() + 1);
  const eventsOnDay = (day: Date) => events.filter((event) => event.startAt < new Date(day.getTime() + DAY) && event.endAt >= day);
  const firstHour = fullDay ? 0 : 6; const lastHour = fullDay ? 24 : 20;
  const timeSlots = Array.from({ length: (lastHour - firstHour) * 2 }, (_, index) => {
    const hour = firstHour + Math.floor(index / 2); const minute = index % 2 ? 30 : 0;
    return { hour, minute, label: minute ? "" : new Intl.DateTimeFormat("en", { hour: "numeric", hour12: true, timeZone: "UTC" }).format(new Date(Date.UTC(2000, 0, 1, hour))) };
  });
  const outsideHours = !fullDay ? events.filter((event) => event.startAt.getUTCHours() < firstHour || event.startAt.getUTCHours() >= lastHour) : [];
  const displayedAgendaDays = view === "agenda" ? calendarDays.filter((day) => eventsOnDay(day).length > 0) : calendarDays;
  const editableCalendars = sharedCalendars.filter((calendar) => calendar.right !== "View");
  const taskAssignees = colleagues.filter((person) => taskScope === "Firm" || person.id === user.id || taskScope === "Team" && reportIds.includes(person.id));
  const managed = query.manage ? sharedCalendars.find((calendar) => calendar.id === query.manage && calendar.right === "Manage") ?? null : null;
  const style = (event: CalendarRecord) => (event.colour ? { "--event-colour": event.colour } : undefined) as CSSProperties | undefined;
  const EventChip = ({ event, compact = false }: { event: CalendarRecord; compact?: boolean }) => (
    <Link prefetch={false} className={`calendar-event calendar-${event.audience.toLowerCase()} calendar-${event.kind}${event.colour ? " has-colour" : ""}${compact ? " is-compact" : ""}`} style={style(event)} href={eventHref(event)} title={`${event.title} · ${event.calendarName}`}>
      <span className="calendar-event-time">{event.kind === "manual" ? timeLabel(event.startAt) : event.kind === "duty" ? "Court run" : event.kind === "task" ? "Due" : timeLabel(event.startAt)}</span>{event.title}
    </Link>
  );

  return (
    <section className="foundation-page calendar-page">
      <FoundationHeader title="Calendar" firm={user.firm.name} />
      {canViewMatters ? <ConsultationRequestsPanel firmId={user.firmId} canHandle={hasPermission(user, "matters", "Edit")} /> : null}
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <Link prefetch={false} href={href({ date: prev, agendaWeek: "this" })} aria-label="Previous">‹</Link>
          <Link prefetch={false} href={href({ date: new Date() })}>Today</Link>
          <Link prefetch={false} href={href({ date: next, agendaWeek: "this" })} aria-label="Next">›</Link>
          <strong>{view === "day" ? dayLabel(date) : new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(date)}</strong>
        </div>
        <nav className="calendar-view-switch" aria-label="Calendar view">
          {(["day", "three-day", "week", "month", "agenda"] as const).map((option) => (
            <Link prefetch={false} key={option} aria-current={view === option ? "page" : undefined} href={href({ view: option })}>{option === "three-day" ? "3 days" : option[0].toUpperCase() + option.slice(1)}</Link>
          ))}
        </nav>
        {view === "agenda" ? <nav className="calendar-agenda-range" aria-label="Agenda week">
          <Link prefetch={false} aria-current={agendaWeek === "this" ? "page" : undefined} href={href({ agendaWeek: "this" })}>This week</Link>
          <Link prefetch={false} aria-current={agendaWeek === "next" ? "page" : undefined} href={href({ agendaWeek: "next" })}>Next week</Link>
        </nav> : null}
        {canEditCalendar ? <Link prefetch={false} className="button-primary calendar-add-trigger" href={addEventHref(date)}>+ Add event</Link> : null}
      </div>

      <div className="calendar-layout">
        <aside className="calendar-sidebar">
          <form action="/calendar" className="calendar-control calendar-picker">
            <input type="hidden" name="date" value={dateKey(date)} />
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="filtered" value="1" />
            <input type="hidden" name="audienceFiltered" value="1" />
            {fullDay ? <input type="hidden" name="hours" value="all" /> : null}
            <input type="hidden" name="calendars" value="none" />
            <input type="hidden" name="shared" value="none" />
            <p className="calendar-picker-heading">People</p>
            <label className="calendar-list-item"><input type="checkbox" name="calendars" value={user.id} defaultChecked={ownerIds.includes(user.id)} /><i style={{ background: "#bfd3c1" }} /> My calendar</label>
            {colleagues.filter((person) => person.id !== user.id).map((person) => (
              <label className="calendar-list-item" key={person.id}><input type="checkbox" name="calendars" value={person.id} defaultChecked={ownerIds.includes(person.id)} /><i style={{ background: "#e5dccb" }} /> {person.name}</label>
            ))}
            <p className="calendar-picker-heading">Shared calendars <Link prefetch={false} href={href({ extra: { newCalendar: "1" } })} className="calendar-new-link">+ New</Link></p>
            {sharedCalendars.map((calendar) => (
              <div className="calendar-list-row" key={calendar.id}>
                <label className="calendar-list-item"><input type="checkbox" name="shared" value={calendar.id} defaultChecked={sharedIds.includes(calendar.id)} /><i style={{ background: calendar.colour }} /> {calendar.name}</label>
                {calendar.right === "Manage" ? <Link prefetch={false} className="calendar-manage-link" href={href({ extra: { manage: calendar.id } })} aria-label={`Settings for ${calendar.name}`}>Settings</Link> : <small>{calendar.right === "Edit" ? "Can edit" : "View only"}</small>}
              </div>
            ))}
            {!sharedCalendars.length ? <p className="foundation-muted calendar-hint">No shared calendars yet. Create one for court dates, the boardroom or a team.</p> : null}
            <p className="calendar-picker-heading">Show</p>
            <label className="calendar-filter"><input type="checkbox" name="types" value="manual" defaultChecked={activeTypes.includes("manual")} /> Events</label>
            <label className="calendar-filter"><input type="checkbox" name="types" value="meetings" defaultChecked={activeTypes.includes("meetings")} /> Team meetings</label>
            {canViewTasks ? <label className="calendar-filter"><input type="checkbox" name="types" value="tasks" defaultChecked={activeTypes.includes("tasks")} /> Task due dates</label> : null}
            {canViewMatters || canViewTasks ? <label className="calendar-filter"><input type="checkbox" name="types" value="duties" defaultChecked={activeTypes.includes("duties")} /> Court runs</label> : null}
            <label className="calendar-filter"><input type="checkbox" name="audience" value="Internal" defaultChecked={activeAudiences.includes("Internal")} /> Internal</label>
            <label className="calendar-filter"><input type="checkbox" name="audience" value="Client" defaultChecked={activeAudiences.includes("Client")} /> Client-facing</label>
            <button className="button-secondary" type="submit">Update view</button>
          </form>
          {teamsReady ? <ActionForm action={syncCalendarFromOutlook} className="calendar-control calendar-sync"><SubmitButton className="button-secondary">Update Teams meetings</SubmitButton></ActionForm> : null}
          <div className="calendar-legend">
            <span><i className="legend-event" />Event</span><span><i className="legend-client" />Client</span><span><i className="legend-task" />Task due</span><span><i className="legend-duty" />Court run</span><span><i className="legend-meeting" />Meeting</span>
          </div>
        </aside>

        <div className={`calendar-grid calendar-${view}`}>
          {view === "day" || view === "three-day" || view === "week" ? (
            <>
              {outsideHours.length ? <p className="calendar-outside">{outsideHours.length} item{outsideHours.length === 1 ? "" : "s"} outside 6am–8pm · <Link prefetch={false} href={href({ hours: "all" })}>Show full day</Link></p> : null}
              <div className="calendar-time-grid" style={{ "--calendar-day-count": calendarDays.length } as CSSProperties}>
                <span className="calendar-time-corner">{fullDay ? <Link prefetch={false} href={href({ hours: "day" })}>Work hours</Link> : null}</span>
                {calendarDays.map((day) => {
                  const dueItems = eventsOnDay(day).filter((event) => event.kind === "task" || event.kind === "duty");
                  return <div className={`calendar-time-date${dateKey(day) === todayKey ? " is-today" : ""}`} key={dateKey(day)}>
                    <strong>{dayLabel(day)}</strong>
                    {dueItems.length ? <div className="calendar-all-day">{dueItems.map((event) => <EventChip key={event.id} event={event} compact />)}</div> : null}
                  </div>;
                })}
                {timeSlots.map((slot) => (
                  <div className={`calendar-time-row${slot.minute ? " is-half" : ""}`} key={`${slot.hour}-${slot.minute}`}>
                    <time className="calendar-time-label">{slot.label}</time>
                    {calendarDays.map((day) => {
                      const slotStart = new Date(day); slotStart.setUTCHours(slot.hour, slot.minute, 0, 0);
                      const slotEnd = new Date(slotStart.getTime() + 30 * 60000);
                      const slotEvents = events.filter((event) => (event.kind === "manual" || event.kind === "meeting") && event.startAt >= slotStart && event.startAt < slotEnd);
                      return <div className={`calendar-time-slot${dateKey(day) === todayKey ? " is-today" : ""}`} key={`${dateKey(day)}-${slot.hour}-${slot.minute}`}>
                        {canEditCalendar ? <Link prefetch={false} className="calendar-time-add" href={addEventHref(day, slot.hour, slot.minute)} aria-label={`Add event ${dayLabel(day)} ${String(slot.hour).padStart(2, "0")}:${slot.minute ? "30" : "00"}`} /> : null}
                        {slotEvents.map((event) => <EventChip key={event.id} event={event} />)}
                      </div>;
                    })}
                  </div>
                ))}
              </div>
            </>
          ) : view === "month" ? (
            <>
              <div className="calendar-day-headings">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => <strong key={label}>{label}</strong>)}</div>
              <div className="calendar-day-grid">
                {calendarDays.map((day) => {
                  const items = eventsOnDay(day);
                  return <section className={`calendar-day-cell${day.getUTCMonth() !== date.getUTCMonth() ? " is-adjacent-month" : ""}${dateKey(day) === todayKey ? " is-today" : ""}`} key={dateKey(day)}>
                    <h3>
                      <Link prefetch={false} className="calendar-month-day" href={href({ date: day, view: "day" })} aria-label={`Open ${dayLabel(day)}`}>{day.getUTCDate()}</Link>
                      {canEditCalendar ? <Link prefetch={false} className="calendar-month-add" href={addEventHref(day)} aria-label={`Add event on ${dayLabel(day)}`}>+</Link> : null}
                    </h3>
                    <ul>{items.slice(0, 4).map((event) => <li key={event.id}><EventChip event={event} compact /></li>)}</ul>
                    {items.length > 4 ? <Link prefetch={false} className="calendar-more" href={href({ date: day, view: "day" })}>+{items.length - 4} more</Link> : null}
                  </section>;
                })}
              </div>
            </>
          ) : (
            <div className="calendar-agenda-list">
              {displayedAgendaDays.map((day) => <section className={`calendar-agenda-day${dateKey(day) === todayKey ? " is-today" : ""}`} key={dateKey(day)}>
                <h3><Link prefetch={false} href={href({ date: day, view: "day" })}>{dayLabel(day)}</Link></h3>
                <ul>{eventsOnDay(day).map((event) => <li key={event.id}><EventChip event={event} /><small>{event.calendarName} · {event.responsible}</small></li>)}</ul>
              </section>)}
              {!displayedAgendaDays.length ? <p className="foundation-muted calendar-empty">Nothing scheduled this week.</p> : null}
            </div>
          )}
          {!events.length && view !== "agenda" ? <p className="foundation-muted calendar-empty">Nothing in this view yet. Click a time or a day to add an event.</p> : null}
        </div>
      </div>

      {canEditCalendar && query.newAt ? <div className="calendar-modal-backdrop">
        <section aria-labelledby="calendar-modal-title" aria-modal="true" className="calendar-modal" role="dialog">
          <header><div><p className="eyebrow">CALENDAR</p><h2 id="calendar-modal-title">Add event</h2></div><Link prefetch={false} href={currentHref} aria-label="Close add event dialog">Close</Link></header>
          <ActionForm action={createCalendarEvent} className="foundation-form calendar-event-form">
            <input type="hidden" name="returnTo" value={currentHref} />
            <label className="foundation-field"><span>Event name</span><input name="title" maxLength={160} required autoFocus /></label>
            <div className="calendar-modal-fields">
              <label className="foundation-field"><span>Starts</span><input name="startAt" type="datetime-local" defaultValue={newEventStart} required /></label>
              <label className="foundation-field"><span>Ends</span><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(newEventEnd)} required /></label>
            </div>
            <div className="calendar-modal-fields">
              <label className="foundation-field"><span>Calendar</span><select name="calendarId" defaultValue={sharedIds.length === 1 && editableCalendars.some((calendar) => calendar.id === sharedIds[0]) ? sharedIds[0] : ""}>
                <option value="">Personal (responsible person's calendar)</option>
                {editableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
              </select></label>
              <label className="foundation-field"><span>Responsible person</span><select name="responsibleId" defaultValue={user.id} required>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            </div>
            <div className="calendar-modal-fields">
              <label className="foundation-field"><span>Who is it for?</span><select name="audience"><option value="Internal">Internal</option><option value="Client">Client-facing</option></select></label>
              <label className="foundation-field"><span>Attending colleagues</span><select name="attendeeIds" multiple size={Math.min(4, Math.max(2, colleagues.length))}>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            </div>
            <details><summary>More details (matter, link, notes, document)</summary>
              {canViewMatters ? <label className="foundation-field"><span>Matter</span><select name="matterId" defaultValue=""><option value="">No matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber}</option>)}</select></label> : null}
              <label className="foundation-field"><span>Meeting link (HTTPS)</span><input name="meetingUrl" type="url" /></label>
              {teamsReady ? <label className="setup-checkbox-field"><input type="checkbox" name="createTeams" /><span>Create a Teams meeting if no link is entered</span></label> : null}
              <label className="foundation-field"><span>Notes</span><textarea name="description" maxLength={4000} /></label>
              <label className="foundation-field"><span>Document link label</span><input name="documentLabel" maxLength={160} /></label>
              <label className="foundation-field"><span>Document link (HTTPS)</span><input name="documentUrl" type="url" /></label>
            </details>
            <div className="calendar-modal-actions"><Link prefetch={false} className="button-secondary" href={currentHref}>Cancel</Link><SubmitButton>Add event</SubmitButton></div>
          </ActionForm>
        </section>
      </div> : null}

      {query.newCalendar || managed ? <div className="calendar-modal-backdrop">
        <section aria-labelledby="calendar-settings-title" aria-modal="true" className="calendar-modal" role="dialog">
          <header><div><p className="eyebrow">{managed ? "CALENDAR SETTINGS" : "NEW CALENDAR"}</p><h2 id="calendar-settings-title">{managed ? managed.name : "Create a calendar"}</h2></div><Link prefetch={false} href={currentHref} aria-label="Close">Close</Link></header>
          <p className="foundation-muted">You manage this calendar. Choose who may see it and who may add or change events in it.</p>
          <ActionForm action={managed ? updateCalendar : createCalendar} className="foundation-form calendar-event-form">
            <input type="hidden" name="returnTo" value={currentHref} />
            {managed ? <input type="hidden" name="calendarId" value={managed.id} /> : null}
            <div className="calendar-modal-fields">
              <label className="foundation-field"><span>Name</span><input name="name" maxLength={80} required defaultValue={managed?.name ?? ""} placeholder="e.g. Court dates" autoFocus /></label>
              <fieldset className="calendar-colours"><legend>Colour</legend>
                {CALENDAR_COLOURS.map((colour, index) => <label key={colour} style={{ background: colour }}><input type="radio" name="colour" value={colour} defaultChecked={managed ? managed.colour === colour : index === 0} aria-label={colour} /></label>)}
              </fieldset>
            </div>
            <label className="foundation-field"><span>Description (optional)</span><input name="description" maxLength={500} defaultValue={managed?.description ?? ""} /></label>
            <label className="foundation-field"><span>Everyone in the firm</span><select name="firmAccess" defaultValue={managed?.firmAccess ?? ""}>
              <option value="">Only the people chosen below</option><option value="View">Can see it</option><option value="Edit">Can see and add events</option>
            </select></label>
            <div className="calendar-share-list">
              <p><strong>People</strong></p>
              {allColleagues.map((person) => (
                <label key={person.id} className="calendar-share-row"><span>{person.name}</span>
                  <select name={`access-${person.id}`} defaultValue={managed?.shares.find((share) => share.userId === person.id)?.access ?? ""}>
                    <option value="">No access</option><option value="View">Can view</option><option value="Edit">Can edit</option>
                  </select>
                </label>
              ))}
            </div>
            <div className="calendar-modal-actions"><Link prefetch={false} className="button-secondary" href={currentHref}>Cancel</Link><SubmitButton>{managed ? "Save calendar" : "Create calendar"}</SubmitButton></div>
          </ActionForm>
          {managed ? <ActionForm action={deleteCalendar} className="calendar-danger" confirmationMessage={`Delete the ${managed.name} calendar? Its events stay on the responsible people's personal calendars.`}>
            <input type="hidden" name="returnTo" value={currentHref} /><input type="hidden" name="calendarId" value={managed.id} />
            <SubmitButton className="button-secondary">Delete calendar</SubmitButton>
          </ActionForm> : null}
        </section>
      </div> : null}

      {selectedEvent ? <div className="calendar-modal-backdrop">
        <section aria-labelledby="calendar-event-title" aria-modal="true" className="calendar-modal" role="dialog">
          <header><div><p className="eyebrow">{selectedEvent.calendarName.toUpperCase()}</p><h2 id="calendar-event-title">{selectedEvent.title}</h2></div><Link prefetch={false} href={currentHref} aria-label="Close event details">Close</Link></header>
          <dl className="calendar-event-facts">
            <dt>When</dt><dd>{selectedEvent.kind === "manual" ? `${dayLabel(selectedEvent.startAt)}, ${timeLabel(selectedEvent.startAt)}–${timeLabel(selectedEvent.endAt)}` : `Due ${dayLabel(selectedEvent.startAt)}`}</dd>
            <dt>Responsible</dt><dd>{selectedEvent.responsible} · {selectedEvent.audience === "Client" ? "Client-facing" : "Internal"}</dd>
            {selectedEvent.attendees.length ? <><dt>Attending</dt><dd>{selectedEvent.attendees.join(", ")}</dd></> : null}
            {selectedEvent.matterId && selectedEvent.matterNumber ? <><dt>Matter</dt><dd><Link href={`/matters/${selectedEvent.matterId}`}>{selectedEvent.matterNumber}</Link></dd></> : null}
            {selectedEvent.description ? <><dt>Notes</dt><dd>{selectedEvent.description}</dd></> : null}
          </dl>
          {selectedEvent.meetingUrl ? <p><a className="button-secondary" href={selectedEvent.meetingUrl} target="_blank" rel="noreferrer">Join online meeting</a></p> : null}
          {selectedEvent.documents.map((document) => <p key={`${selectedEvent.id}-${document.url}`}><a href={document.url} target="_blank" rel="noreferrer">{document.label}</a></p>)}
          {selectedEvent.kind === "duty" ? <p><Link href="/duties?tab=mine">Open court runs</Link></p> : null}
          {selectedEvent.taskId && canEditTasks ? <ActionForm action={completeTask}><input type="hidden" name="taskId" value={selectedEvent.taskId} /><SubmitButton>Complete task</SubmitButton></ActionForm> : null}
          {selectedEvent.checklist.length ? <ul className="calendar-checklist">{selectedEvent.checklist.map((item) => <li key={item.id}><ActionForm action={toggleCalendarChecklistItem} className="calendar-check-form"><input type="hidden" name="itemId" value={item.id} /><button className="button-secondary" type="submit">{item.completed ? "✓" : "○"} {item.label}</button></ActionForm></li>)}</ul> : null}
          {selectedEvent.kind === "manual" && selectedEvent.canEdit ? <details className="calendar-edit-details"><summary>Edit event</summary>
            <ActionForm action={updateCalendarEvent} className="foundation-form calendar-event-form">
              <input type="hidden" name="eventId" value={selectedEvent.id} /><input type="hidden" name="returnTo" value={currentHref} />
              <label className="foundation-field"><span>Event name</span><input name="title" maxLength={160} defaultValue={selectedEvent.title} required /></label>
              <div className="calendar-modal-fields">
                <label className="foundation-field"><span>Starts</span><input name="startAt" type="datetime-local" defaultValue={dateTimeInput(selectedEvent.startAt)} required /></label>
                <label className="foundation-field"><span>Ends</span><input name="endAt" type="datetime-local" defaultValue={dateTimeInput(selectedEvent.endAt)} required /></label>
              </div>
              <div className="calendar-modal-fields">
                <label className="foundation-field"><span>Calendar</span><select name="calendarId" defaultValue={selectedEvent.calendarId ?? ""}>
                  <option value="">Personal</option>
                  {editableCalendars.map((calendar) => <option key={calendar.id} value={calendar.id}>{calendar.name}</option>)}
                </select></label>
                <label className="foundation-field"><span>Responsible person</span><select name="responsibleId" defaultValue={selectedEvent.ownerId} required>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              </div>
              <div className="calendar-modal-fields">
                <label className="foundation-field"><span>Who is it for?</span><select name="audience" defaultValue={selectedEvent.audience}><option value="Internal">Internal</option><option value="Client">Client-facing</option></select></label>
                <label className="foundation-field"><span>Attending colleagues</span><select name="attendeeIds" multiple size={Math.min(4, Math.max(2, colleagues.length))} defaultValue={selectedEvent.attendeeIds}>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              </div>
              <label className="foundation-field"><span>Notes</span><textarea name="description" maxLength={4000} defaultValue={selectedEvent.description ?? ""} /></label>
              <div className="calendar-modal-actions"><span /><SubmitButton>Save changes</SubmitButton></div>
            </ActionForm>
            <ActionForm action={deleteCalendarEvent} className="calendar-danger" confirmationMessage="Delete this event?">
              <input type="hidden" name="eventId" value={selectedEvent.id} /><input type="hidden" name="returnTo" value={currentHref} />
              <SubmitButton className="button-secondary">Delete event</SubmitButton>
            </ActionForm>
          </details> : null}
          {selectedEvent.kind === "manual" && selectedEvent.createdById === user.id ? <details className="calendar-edit-details"><summary>Checklist and follow-up</summary>
            <ActionForm action={addCalendarChecklistItem} className="calendar-add-check"><input type="hidden" name="eventId" value={selectedEvent.id} /><label className="foundation-field"><span>Add a preparation item</span><input name="label" maxLength={160} required /></label><SubmitButton>Add item</SubmitButton></ActionForm>
            {canEditTasks ? <ActionForm action={createCalendarFollowUpTask} className="calendar-add-check"><input type="hidden" name="eventId" value={selectedEvent.id} /><label className="foundation-field"><span>Follow-up task</span><input name="title" maxLength={160} required defaultValue={`Follow up: ${selectedEvent.title}`} /></label><label className="foundation-field"><span>Assign to</span><select name="assignedToId">{taskAssignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="foundation-field"><span>Due</span><input name="dueAt" type="datetime-local" required /></label><SubmitButton>Create follow-up task</SubmitButton></ActionForm> : null}
          </details> : null}
        </section>
      </div> : null}
    </section>
  );
}
