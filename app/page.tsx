import Link from "next/link";
import { completeTask } from "@/app/actions/matters";
import { TaskCompleteForm } from "@/components/matter-forms";
import { requireUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ConsultationRequestsPanel } from "@/components/consultation-requests";
import { taskUrgency, type UrgencyBand } from "@/lib/matter-rules";
import { describeActivity, FEED_ACTIONS, timeAgo } from "@/lib/activity-labels";

export default async function HomePage() {
  const user = await requireUser();
  const db = getDb();
  const canViewTasks = hasPermission(user, "tasks");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const canViewMatters = hasPermission(user, "matters");
  const canViewCalendar = hasPermission(user, "calendar");
  const taskScope = permissionScope(user, "tasks");
  const matterScope = permissionScope(user, "matters");
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const [taskReports, matterReports, configuration, staffCount, pendingInvitations] = await Promise.all([
    canViewTasks && taskScope !== "Firm"
      ? db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
      : Promise.resolve([]),
    canViewMatters && matterScope === "Team"
      ? db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
      : Promise.resolve([]),
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } }),
    user.isOwner || hasPermission(user, "people") && permissionScope(user, "people") === "Firm"
      ? db.user.count({ where: { firmId: user.firmId, active: true, isOwner: false } })
      : Promise.resolve(null),
    user.isOwner || hasPermission(user, "people") && permissionScope(user, "people") === "Firm"
      ? db.invitation.count({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } } })
      : Promise.resolve(null),
  ]);
  const taskReportIds = taskReports.map((report) => report.userId);
  const matterReportIds = matterReports.map((report) => report.userId);
  const matterResponsibleIds = matterScope === "Firm" ? undefined : matterScope === "Team" ? [user.id, ...matterReportIds] : [user.id];
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, unknown> : {};
  const urgencyBands = Array.isArray(published.urgencyBands) ? published.urgencyBands as UrgencyBand[] : [];
  const [tasks, matterCount, onHoldCount, openTaskCount, draftingCount, overdueTaskCount, dueTodayCount, reviewDueCount, upcomingTasks] = await Promise.all([
    canViewTasks
      ? db.task.findMany({
            where: { firmId: user.firmId, status: "Open", assignedToId: user.id },
          select: {
            id: true, title: true, category: true, dueAt: true, assignedToId: true,
            assignedTo: { select: { name: true } },
            ...(canViewMatters ? { matter: { select: { id: true, responsibleId: true, matterNumber: true, clientName: true, clientSurname: true } } } : {}),
          },
          orderBy: { dueAt: "asc" },
          take: 200,
        })
      : Promise.resolve([]),
    canViewMatters ? db.matter.count({ where: { firmId: user.firmId, status: { not: "Closed" }, ...(matterResponsibleIds ? { responsibleId: { in: matterResponsibleIds } } : {}) } }) : Promise.resolve(null),
    canViewMatters ? db.matter.count({ where: { firmId: user.firmId, status: "OnHold", ...(matterResponsibleIds ? { responsibleId: { in: matterResponsibleIds } } : {}) } }) : Promise.resolve(null),
    canViewTasks ? db.task.count({ where: { firmId: user.firmId, status: "Open", assignedToId: user.id } }) : Promise.resolve(null),
    canViewTasks ? db.task.count({ where: { firmId: user.firmId, status: "Open", category: "Drafting", assignedToId: user.id } }) : Promise.resolve(null),
    canViewTasks ? db.task.count({ where: { firmId: user.firmId, status: "Open", assignedToId: user.id, dueAt: { lt: todayStart } } }) : Promise.resolve(null),
    canViewTasks ? db.task.count({ where: { firmId: user.firmId, status: "Open", assignedToId: user.id, dueAt: { gte: todayStart, lt: tomorrowStart } } }) : Promise.resolve(null),
    canViewMatters ? db.matter.count({ where: { firmId: user.firmId, status: { not: "Closed" }, reviewDate: { gte: todayStart, lt: weekEnd }, ...(matterResponsibleIds ? { responsibleId: { in: matterResponsibleIds } } : {}) } }) : Promise.resolve(null),
    canViewTasks ? db.task.findMany({
      where: { firmId: user.firmId, status: "Open", assignedToId: user.id, dueAt: { gte: todayStart, lt: weekEnd } },
      select: { id: true, title: true, category: true, dueAt: true },
      orderBy: { dueAt: "asc" },
      take: 8,
    }) : Promise.resolve([]),
  ]);
  const [upcomingEvents, upcomingMeetings] = canViewCalendar ? await Promise.all([
    db.calendarEvent.findMany({
      where: {
        firmId: user.firmId,
        startAt: { gte: todayStart, lt: weekEnd },
        OR: [{ ownerId: user.id }, { attendees: { some: { firmId: user.firmId, userId: user.id } } }],
      },
      select: { id: true, title: true, startAt: true },
      orderBy: { startAt: "asc" },
      take: 8,
    }),
    db.teamMeeting.findMany({
      where: {
        firmId: user.firmId,
        startsAt: { gte: todayStart, lt: weekEnd },
        OR: [{ createdById: user.id }, { participants: { some: { firmId: user.firmId, userId: user.id } } }],
      },
      select: { id: true, title: true, startsAt: true },
      orderBy: { startsAt: "asc" },
      take: 8,
    }),
  ]) : [[], []];
  const agenda = [
    ...upcomingEvents.map((event) => ({ id: `event-${event.id}`, title: event.title, date: event.startAt, type: "Calendar event", href: "/calendar" })),
    ...upcomingMeetings.map((meeting) => ({ id: `meeting-${meeting.id}`, title: meeting.title, date: meeting.startsAt, type: "Team meeting", href: "/team/meetings" })),
    ...upcomingTasks.flatMap((task) => task.dueAt ? [{ id: `task-${task.id}`, title: task.title, date: task.dueAt, type: `${task.category} task due`, href: "/tasks" }] : []),
  ].sort((left, right) => left.date.getTime() - right.date.getTime()).slice(0, 8);
  const sortedTasks = tasks.map((task) => ({ ...task, urgency: taskUrgency(task.dueAt, urgencyBands) }))
    .sort((left, right) => (left.urgency.daysUntilDue ?? Number.POSITIVE_INFINITY) - (right.urgency.daysUntilDue ?? Number.POSITIVE_INFINITY))
    .slice(0, 8);
  const showTeamSummary = user.isOwner || taskScope === "Firm" || taskReportIds.length > 0 || matterScope === "Firm" || matterScope === "Team" && matterReportIds.length > 0;
  const [teamMatterCount, teamTaskCount] = showTeamSummary
    ? await Promise.all([
        canViewMatters && (user.isOwner || matterScope === "Firm" || matterReportIds.length > 0)
          ? db.matter.count({ where: { firmId: user.firmId, status: { not: "Closed" }, ...(user.isOwner || matterScope === "Firm" ? { responsible: { isOwner: false } } : { responsibleId: { in: matterReportIds } }) } })
          : Promise.resolve(null),
        canViewTasks && (user.isOwner || taskScope === "Firm" || taskReportIds.length > 0)
          ? db.task.count({ where: { firmId: user.firmId, status: "Open", ...(user.isOwner || taskScope === "Firm" ? { assignedTo: { isOwner: false } } : { assignedToId: { in: taskReportIds } }) } })
          : Promise.resolve(null),
      ])
    : [null, null];

  // Recent changes (Staff Hub style). The owner sees the whole firm; everyone else sees changes on matters in their scope.
  const saToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  const workDate = new Date(`${saToday}T00:00:00.000Z`);
  const isWeekday = ![0, 6].includes(workDate.getUTCDay());
  const since = new Date(Date.now() - 14 * 86_400_000);
  const [auditFeed, matterFeed, myRunsDue, onLeave, pendingLeave, clockedIn, activeStaff, overdueRuns, runsToday] = await Promise.all([
    user.isOwner ? db.auditLog.findMany({ where: { firmId: user.firmId, action: { in: FEED_ACTIONS }, createdAt: { gte: since } }, select: { id: true, action: true, details: true, createdAt: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 25 }) : Promise.resolve([]),
    !user.isOwner && canViewMatters ? db.matterActivity.findMany({ where: { firmId: user.firmId, createdAt: { gte: since }, ...(matterResponsibleIds ? { matter: { responsibleId: { in: matterResponsibleIds } } } : {}) }, select: { id: true, action: true, createdAt: true, actor: { select: { name: true } }, matter: { select: { id: true, matterNumber: true } } }, orderBy: { createdAt: "desc" }, take: 15 }) : Promise.resolve([]),
    canViewMatters ? db.dutyRecord.count({ where: { firmId: user.firmId, assignedToId: user.id, completedAt: null, returnedAt: null, dueAt: { lt: new Date(workDate.getTime() + 86_400_000) } } }) : Promise.resolve(0),
    user.isOwner ? db.leaveRequest.findMany({ where: { firmId: user.firmId, status: "Approved", startDate: { lte: workDate }, endDate: { gte: workDate }, returnedAt: null }, select: { id: true, type: true, endDate: true, requesterId: true, requester: { select: { name: true } } }, take: 20 }) : Promise.resolve([]),
    user.isOwner ? db.leaveRequest.count({ where: { firmId: user.firmId, status: "Pending" } }) : Promise.resolve(0),
    user.isOwner && isWeekday ? db.attendanceDay.findMany({ where: { firmId: user.firmId, workDate, events: { some: { type: "ClockIn" } } }, select: { userId: true } }) : Promise.resolve([]),
    user.isOwner && isWeekday ? db.user.findMany({ where: { firmId: user.firmId, active: true, isOwner: false }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 300 }) : Promise.resolve([]),
    user.isOwner ? db.dutyRecord.count({ where: { firmId: user.firmId, completedAt: null, returnedAt: null, dueAt: { lt: workDate } } }) : Promise.resolve(0),
    user.isOwner ? db.dutyRecord.count({ where: { firmId: user.firmId, completedAt: null, returnedAt: null, dueAt: { gte: workDate, lt: new Date(workDate.getTime() + 86_400_000) } } }) : Promise.resolve(0),
  ]);
  const changes = user.isOwner
    ? auditFeed.flatMap((row) => { const line = describeActivity(row.action, row.details as Record<string, unknown> | null); return line ? [{ id: row.id, who: row.actor?.name ?? "Someone", text: line.text, group: line.group, href: line.href, at: row.createdAt }] : []; })
    : matterFeed.map((row) => ({ id: row.id, who: row.actor?.name ?? "Someone", text: `${row.action.charAt(0).toLowerCase()}${row.action.slice(1)} · ${row.matter.matterNumber}`, group: "Matters", href: `/matters/${row.matter.id}`, at: row.createdAt }));
  const onLeaveIds = new Set(onLeave.map((leave) => leave.requesterId));
  const clockedInIds = new Set(clockedIn.map((day) => day.userId));
  const notClockedIn = activeStaff.filter((person) => !clockedInIds.has(person.id) && !onLeaveIds.has(person.id));

  return (
    <section className="dashboard-page">
      <header className="dashboard-header dashboard-hero">
        <div>
          <p className="eyebrow">{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())}</p>
          <h1>Welcome, {user.name}</h1>
          <p>{user.firm.name} · {user.isOwner ? "Owner" : user.role?.name ?? "Staff"}</p>
        </div>
        <Link className="button-primary dashboard-calendar-link" href="/calendar">Open calendar</Link>
      </header>
      {user.isOwner && !configuration?.publishedAt ? (
        <section className="dashboard-setup-banner" aria-label="Finish setting up">
          <div>
            <h2>Finish setting up {user.firm.name}</h2>
            <p>Five short steps – choose your types of work, roles and office rules. Parlia fills in the rest.</p>
          </div>
          <Link className="button-primary dashboard-calendar-link" href="/setup/start">Start guided set-up</Link>
        </section>
      ) : null}
      <section className="dashboard-pulse" aria-label="Today's overview">
        {canViewTasks ? <Link href="/tasks?status=Open"><strong>{overdueTaskCount}</strong><span>Overdue tasks</span></Link> : null}
        {canViewTasks ? <Link href="/tasks?status=Open"><strong>{dueTodayCount}</strong><span>Due today</span></Link> : null}
        {canViewMatters ? <Link href="/matters"><strong>{reviewDueCount}</strong><span>Matter reviews this week</span></Link> : null}
        {canViewCalendar ? <Link href="/calendar"><strong>{agenda.length}</strong><span>Upcoming items this week</span></Link> : null}
        {canViewMatters ? <Link href="/duties"><strong>{myRunsDue}</strong><span>My court runs due</span></Link> : null}
      </section>
      {user.isOwner ? (
        <section className="dashboard-owner" aria-label="Firm today">
          <article className="dashboard-block">
            <h2>Court runs</h2>
            <p><strong>{overdueRuns}</strong> overdue · <strong>{runsToday}</strong> due today</p>
            <Link className="back-link" href="/duties?tab=all&state=Overdue">See overdue runs</Link>
          </article>
          <article className="dashboard-block">
            <h2>On leave today</h2>
            {onLeave.length ? <ul className="dashboard-names">{onLeave.map((leave) => <li key={leave.id}>{leave.requester.name} <small>{leave.type} · back after {new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" }).format(leave.endDate)}</small></li>)}</ul> : <p>Everyone is in.</p>}
            <Link className="back-link" href="/leave">{pendingLeave ? `${pendingLeave} leave request${pendingLeave === 1 ? "" : "s"} waiting for you` : "Open leave"}</Link>
          </article>
          {isWeekday ? <article className="dashboard-block">
            <h2>Not clocked in yet</h2>
            {notClockedIn.length ? <ul className="dashboard-names">{notClockedIn.slice(0, 8).map((person) => <li key={person.id}>{person.name}</li>)}{notClockedIn.length > 8 ? <li><small>and {notClockedIn.length - 8} more</small></li> : null}</ul> : <p>Everyone has clocked in.</p>}
            <Link className="back-link" href="/attendance">Open attendance</Link>
          </article> : null}
        </section>
      ) : null}
      <div className="foundation-cards">
        {canViewMatters ? (
          <article className="dashboard-block">
            <h2>Matters in progress</h2>
            <p>{matterCount} active or on-hold matters · {onHoldCount} on hold</p>
            <Link className="back-link" href="/matters">Open matter list</Link>
          </article>
        ) : null}
        {canViewTasks ? (
          <article className="dashboard-block">
            <h2>Open tasks in your scope</h2>
            <p>{openTaskCount} open · {draftingCount} drafting</p>
            <Link className="back-link" href="/tasks">Open My to-do</Link>
          </article>
        ) : null}
        {user.isOwner || canViewMatters || canViewTasks ? (
          <article className="dashboard-block">
            <h2>Your account</h2>
            <p>{user.email}</p>
            <p>{user.isOwner ? "Owner verification by email is required each time you sign in." : "Your work list and firm records follow the permissions assigned to your role."}</p>
          </article>
        ) : null}
        {staffCount !== null && pendingInvitations !== null ? (
          <article className="dashboard-block">
            <h2>Team access</h2>
            <p>{staffCount} active staff · {pendingInvitations} pending invitations</p>
            <Link className="back-link" href="/staff">Manage staff</Link>
          </article>
        ) : null}
        {user.isOwner ? (
          <article className="dashboard-block">
            <h2>Roles and permissions</h2>
            <p>Set what each staff role can view and edit, and the scope of that access.</p>
            <Link className="back-link" href="/settings/permissions">Open permissions</Link>
          </article>
        ) : null}
      </div>
      {canViewMatters ? <ConsultationRequestsPanel firmId={user.firmId} canHandle={hasPermission(user, "matters", "Edit")} /> : null}
      <section className="foundation-panel dashboard-agenda">
        <div className="dashboard-panel-heading"><div><p className="eyebrow">NEXT SEVEN DAYS</p><h2>Coming up</h2></div><Link href={canViewCalendar ? "/calendar" : "/tasks"}>Open schedule</Link></div>
        {agenda.length ? <ol className="dashboard-agenda-list">
          {agenda.map((item) => (
            <li key={item.id}>
              <time dateTime={item.date.toISOString()}><strong>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(item.date)}</strong><span>{new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(item.date)}</span></time>
              <div><span className="dashboard-agenda-type">{item.type}</span><strong>{item.title}</strong></div>
              <Link href={item.href} aria-label={`Open ${item.type.toLowerCase()}: ${item.title}`}>Open</Link>
            </li>
          ))}
        </ol> : <p className="foundation-muted">No upcoming events or task deadlines in the next seven days.</p>}
      </section>
      {changes.length || user.isOwner ? (
        <section className="foundation-panel dashboard-changes">
          <div className="dashboard-panel-heading"><div><p className="eyebrow">LAST TWO WEEKS</p><h2>Recent changes</h2></div>{user.isOwner ? <span className="foundation-muted">Whole firm</span> : <span className="foundation-muted">Your matters</span>}</div>
          {changes.length ? <ol className="dashboard-change-list">
            {changes.map((change) => <li key={change.id}>
              <span className="dashboard-change-group">{change.group}</span>
              <p><strong>{change.who}</strong> {change.href ? <Link prefetch={false} href={change.href}>{change.text}</Link> : change.text}</p>
              <time dateTime={change.at.toISOString()}>{timeAgo(change.at)}</time>
            </li>)}
          </ol> : <p className="foundation-muted">No changes yet. As your team works, new matters, tasks, court runs and calendar changes show here.</p>}
        </section>
      ) : null}
      {showTeamSummary ? (
        <section className="foundation-panel">
          <h2>Team work</h2>
          <p>Counts reflect current work visible to your firm or direct-report scope.</p>
          <div className="dashboard-metrics">
            {teamMatterCount !== null ? <p><strong>{teamMatterCount}</strong><span>matters assigned to staff</span></p> : null}
            {teamTaskCount !== null ? <p><strong>{teamTaskCount}</strong><span>open staff tasks</span></p> : null}
          </div>
        </section>
      ) : null}
      {canViewTasks ? (
        <section className="foundation-panel dashboard-todo">
          <div className="dashboard-panel-heading"><h2>My to-do</h2><Link href="/tasks">View all tasks</Link></div>
          {sortedTasks.map((task) => (
            <article className="dashboard-task" key={task.id}>
              <div>
                <p className="eyebrow">{task.category} · {task.urgency.label}</p>
                <strong>{task.title}</strong>
                {canViewMatters && task.matter && (user.isOwner || matterScope === "Firm" || task.matter.responsibleId === user.id || matterScope === "Team" && matterReportIds.includes(task.matter.responsibleId)) ? <p><Link href={`/matters/${task.matter.id}`}>{task.matter.matterNumber} · {task.matter.clientName} {task.matter.clientSurname}</Link></p> : null}
                {taskScope !== "Own" ? <small>Assigned to {task.assignedTo.name}</small> : null}
              </div>
              {canEditTasks && task.assignedToId === user.id ? <TaskCompleteForm action={completeTask} taskId={task.id} /> : null}
            </article>
          ))}
          {!sortedTasks.length ? <p className="foundation-muted">There are no open tasks in your current scope.</p> : null}
        </section>
      ) : null}
    </section>
  );
}
