import Link from "next/link";
import { completeTask } from "@/app/actions/matters";
import { TaskCompleteForm } from "@/components/matter-forms";
import { requireUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ConsultationRequestsPanel } from "@/components/consultation-requests";
import { taskUrgency, type UrgencyBand } from "@/lib/matter-rules";

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
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
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
      <section className="dashboard-pulse" aria-label="Today's overview">
        {canViewTasks ? <Link href="/tasks?status=Open"><strong>{overdueTaskCount}</strong><span>Overdue tasks</span></Link> : null}
        {canViewTasks ? <Link href="/tasks?status=Open"><strong>{dueTodayCount}</strong><span>Due today</span></Link> : null}
        {canViewMatters ? <Link href="/matters"><strong>{reviewDueCount}</strong><span>Matter reviews this week</span></Link> : null}
        {canViewCalendar ? <Link href="/calendar"><strong>{agenda.length}</strong><span>Upcoming items this week</span></Link> : null}
      </section>
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
