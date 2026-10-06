import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { saveQuietMatterThreshold } from "@/app/actions/reports";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { findQuietMatters } from "@/lib/report-data";

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export default async function ReportsPage() {
  const user = await requireUser();
  if (!user.isOwner) return <section className="foundation-page"><FoundationHeader title="Inactive matters" firm={user.firm.name} /><section className="foundation-panel"><h2>Owner access required</h2><p>This weekly firm overview is available to the firm owner.</p></section></section>;
  const db = getDb();
  const today = new Date();
  const weekStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const settings = await db.firmReportSettings.findUnique({ where: { firmId: user.firmId }, select: { quietMatterDays: true } });
  const threshold = settings?.quietMatterDays ?? 30;
  const [quietReport, attendance, uncompletedRuns, completedRuns, completedTasks] = await Promise.all([
    findQuietMatters(user, threshold),
    db.attendanceDay.findMany({
      where: { firmId: user.firmId, workDate: { gte: weekStart, lt: weekEnd } },
      select: { workDate: true, user: { select: { name: true } }, events: { where: { type: "ClockIn" }, orderBy: { occurredAt: "asc" }, take: 1, select: { occurredAt: true, locationName: true } } },
      orderBy: [{ workDate: "desc" }, { user: { name: "asc" } }],
      take: 5000,
    }),
    db.dutyRecord.findMany({
      where: { firmId: user.firmId, dueAt: { gte: weekStart, lt: weekEnd }, status: { notIn: ["Completed", "Returned"] } },
      select: { id: true, title: true, method: true, dueAt: true, status: true, returnNotes: true, assignedTo: { select: { name: true } }, matter: { select: { matterNumber: true } } },
      orderBy: [{ dueAt: "asc" }, { assignedTo: { name: "asc" } }],
      take: 1000,
    }),
    db.dutyRecord.findMany({
      where: { firmId: user.firmId, returnedAt: { gte: weekStart, lt: weekEnd } },
      select: { id: true, title: true, returnedAt: true, assignedTo: { select: { name: true } }, matter: { select: { matterNumber: true } } },
      orderBy: { returnedAt: "desc" }, take: 1000,
    }),
    db.task.findMany({
      where: { firmId: user.firmId, status: "Complete", completedAt: { gte: weekStart, lt: weekEnd } },
      select: { id: true, title: true, category: true, completedAt: true, completedBy: { select: { name: true } }, assignedTo: { select: { name: true } } },
      orderBy: { completedAt: "desc" }, take: 1000,
    }),
  ]);
  const clockIns = attendance.flatMap((day) => day.events.map((event) => ({ staff: day.user.name, date: day.workDate, time: event.occurredAt, location: event.locationName })));

  return (
    <section className="foundation-page inactive-report-page">
      <FoundationHeader title="Inactive matters" firm={user.firm.name} isOwner />
      <p className="foundation-intro">Weekly owner overview · {dateLabel(weekStart)}–{dateLabel(new Date(weekEnd.getTime() - 1))}. Review matters needing attention, unfinished court runs, staff attendance, and completed work.</p>
      <section className="foundation-panel">
        <h2>Report settings</h2>
        <p className="foundation-muted">An active matter is listed when it has no recorded activity for the selected number of days.</p>
        <ActionForm action={saveQuietMatterThreshold} className="foundation-inline-form">
          <label className="foundation-field"><span>Inactive after (days)</span><input type="number" name="quietMatterDays" min={1} max={3650} step={1} required defaultValue={threshold} /></label>
          <SubmitButton>Save threshold</SubmitButton>
        </ActionForm>
      </section>

      <section className="inactive-report-metrics" aria-label="Weekly summary">
        <a href="#inactive-matters"><strong>{quietReport.matters.length}</strong><span>Inactive matters</span></a>
        <a href="#unfinished-runs"><strong>{uncompletedRuns.length}</strong><span>Unfinished court runs due this week</span></a>
        <a href="#attendance"><strong>{clockIns.length}</strong><span>Clock-ins recorded this week</span></a>
        <a href="#positive-work"><strong>{completedTasks.length + completedRuns.length}</strong><span>Completed tasks and court runs</span></a>
      </section>

      <section className="foundation-panel" id="inactive-matters">
        <div className="attendance-report-heading"><div><p className="eyebrow">NEEDS ATTENTION</p><h2>Inactive matters</h2><p className="foundation-muted">{quietReport.matters.length} active matters have no recorded activity for at least {threshold} days.</p></div></div>
        <div className="foundation-table-wrap"><table className="foundation-table matter-table">
          <thead><tr><th>Reference</th><th>Client</th><th>Type / stage</th><th>Responsible</th><th>Last activity</th></tr></thead>
          <tbody>{quietReport.matters.map((matter) => <tr key={matter.id}><td><Link href={`/matters/${matter.id}`}>{matter.matterNumber}</Link></td><td>{matter.clientName} {matter.clientSurname}</td><td>{matter.matterType} / {matter.stage}</td><td>{matter.responsible.name}</td><td>{dateLabel(matter.lastActivityAt)}</td></tr>)}{!quietReport.matters.length ? <tr><td colSpan={5}>No active matters have crossed the inactive threshold.</td></tr> : null}</tbody>
        </table></div>
      </section>

      <section className="foundation-panel" id="unfinished-runs">
        <div className="attendance-report-heading"><div><p className="eyebrow">FOLLOW UP</p><h2>Court runs not completed</h2><p className="foundation-muted">Scheduled runs due this week that still need an update from the assignee.</p></div></div>
        <div className="foundation-table-wrap"><table className="foundation-table">
          <thead><tr><th>Due</th><th>Matter</th><th>Court run</th><th>Method</th><th>Assigned to</th><th>Status</th><th>Reason / update</th></tr></thead>
          <tbody>{uncompletedRuns.map((run) => <tr key={run.id}><td>{run.dueAt ? dateLabel(run.dueAt) : "—"}</td><td>{run.matter?.matterNumber ?? "—"}</td><td>{run.title}</td><td>{run.method}</td><td>{run.assignedTo.name}</td><td>{run.status}</td><td>{run.returnNotes || "No update recorded"}</td></tr>)}{!uncompletedRuns.length ? <tr><td colSpan={7}>No unfinished court runs are due this week.</td></tr> : null}</tbody>
        </table></div>
      </section>

      <section className="foundation-panel" id="attendance">
        <div className="attendance-report-heading"><div><p className="eyebrow">TEAM</p><h2>Clock-in records</h2><p className="foundation-muted">Times are factual records. The firm has no expected start-time setting yet, so this report does not label employees late.</p></div></div>
        <div className="foundation-table-wrap"><table className="foundation-table">
          <thead><tr><th>Date</th><th>Employee</th><th>Clock-in</th><th>Location</th></tr></thead>
          <tbody>{clockIns.map((entry, index) => <tr key={`${entry.staff}-${entry.date.toISOString()}-${index}`}><td>{dateLabel(entry.date)}</td><td>{entry.staff}</td><td>{entry.time.toLocaleTimeString()}</td><td>{entry.location}</td></tr>)}{!clockIns.length ? <tr><td colSpan={4}>No clock-ins were recorded this week.</td></tr> : null}</tbody>
        </table></div>
      </section>

      <section className="foundation-panel" id="positive-work">
        <div className="attendance-report-heading"><div><p className="eyebrow">GOOD WORK</p><h2>Completed this week</h2></div></div>
        <div className="foundation-table-wrap"><table className="foundation-table">
          <thead><tr><th>Completed</th><th>Employee</th><th>Task</th><th>Category</th></tr></thead>
          <tbody>{completedTasks.map((task) => <tr key={task.id}><td>{task.completedAt ? dateLabel(task.completedAt) : "—"}</td><td>{task.completedBy?.name ?? task.assignedTo.name}</td><td>{task.title}</td><td>{task.category}</td></tr>)}{!completedTasks.length ? <tr><td colSpan={4}>No tasks were marked complete this week.</td></tr> : null}</tbody>
        </table></div>
        {completedRuns.length ? <div className="foundation-table-wrap"><h3>Documents returned on court runs</h3><table className="foundation-table"><thead><tr><th>Date</th><th>Employee</th><th>Matter</th><th>Court run</th></tr></thead><tbody>{completedRuns.map((run) => <tr key={run.id}><td>{run.returnedAt ? dateLabel(run.returnedAt) : "—"}</td><td>{run.assignedTo.name}</td><td>{run.matter?.matterNumber ?? "—"}</td><td>{run.title}</td></tr>)}</tbody></table></div> : null}
      </section>
    </section>
  );
}