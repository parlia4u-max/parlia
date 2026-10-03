import Link from "next/link";
import { completeTask, nudgeTask, updateTaskAssignment } from "@/app/actions/matters";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { TaskCompleteForm } from "@/components/matter-forms";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { taskUrgency, type UrgencyBand } from "@/lib/matter-rules";

type TaskSearch = { q?: string; status?: string };

export default async function MyTodoPage({ searchParams }: { searchParams: Promise<TaskSearch> }) {
  const user = await requirePermission("tasks");
  const query = await searchParams;
  const db = getDb();
  const canViewMatters = hasPermission(user, "matters");
  const matterScope = permissionScope(user, "matters");
  const matterReports = canViewMatters && matterScope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
    : [];
  const matterReportIds = matterReports.map((report) => report.userId);
  const scope = permissionScope(user, "tasks");
  const reports = await db.supervisorLink.findMany({
        where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } },
        select: { userId: true },
      });
  const reportIds = reports.map((report) => report.userId);
  const taskIds = scope === "Firm" ? undefined : [user.id, ...reportIds];
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = ["Open", "Complete", "All"].includes(query.status ?? "") ? query.status ?? "Open" : "Open";
  const [tasks, configuration, assignees] = await Promise.all([
    db.task.findMany({
      where: {
        firmId: user.firmId,
        ...(taskIds ? { assignedToId: { in: taskIds } } : {}),
        ...(status === "All" ? {} : { status: status as "Open" | "Complete" }),
        ...(q ? { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { category: { contains: q, mode: "insensitive" } },
          { stage: { contains: q, mode: "insensitive" } },
        ] } : {}),
      },
      select: {
        id: true,
        title: true,
        category: true,
        stage: true,
        status: true,
        dueAt: true,
        assignedToId: true,
        assignedTo: { select: { name: true } },
        ...(canViewMatters ? { matter: { select: { id: true, responsibleId: true, matterNumber: true, clientName: true, clientSurname: true } } } : {}),
        nudges: { where: { firmId: user.firmId }, orderBy: { createdAt: "desc" }, take: 1, select: { sender: { select: { name: true } }, createdAt: true } },
      },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "asc" }],
      take: 500,
    }),
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
    taskIds
      ? db.user.findMany({ where: { firmId: user.firmId, active: true, id: { in: taskIds } }, select: { id: true, name: true } })
      : db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, unknown> : {};
  const urgencyBands = Array.isArray(published.urgencyBands) ? published.urgencyBands as UrgencyBand[] : [];
  const canEdit = hasPermission(user, "tasks", "Edit");
  const tasksWithUrgency = tasks.map((task) => ({ ...task, urgency: taskUrgency(task.dueAt, urgencyBands) }))
    .sort((left, right) => (left.urgency.daysUntilDue ?? Number.POSITIVE_INFINITY) - (right.urgency.daysUntilDue ?? Number.POSITIVE_INFINITY));

  return (
    <section className="foundation-page">
      <FoundationHeader title="My to-do" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Your assigned tasks are ordered using this firm’s published due-date urgency bands. Supervisors see tasks assigned to their direct reports where their role scope allows it.</p>
      <form action="/tasks" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search tasks</span><input name="q" defaultValue={q} maxLength={120} placeholder="Task title, category or stage" /></label>
        <label className="foundation-field"><span>Task status</span><select name="status" defaultValue={status}><option value="Open">Open</option><option value="Complete">Complete</option><option value="All">All</option></select></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">
        {tasksWithUrgency.map((task) => {
          const isDirectReport = reportIds.includes(task.assignedToId);
          const canSeeMatter = canViewMatters && task.matter && (user.isOwner || matterScope === "Firm" || task.matter.responsibleId === user.id || matterScope === "Team" && matterReportIds.includes(task.matter.responsibleId));
          const latestNudge = task.nudges[0];
          return (
            <article className="todo-card" key={task.id}>
              <div className="todo-card-heading">
                <div>
                  <p className="eyebrow">{task.category}{task.stage ? ` · ${task.stage}` : ""}</p>
                  <h2>{task.title}</h2>
                  {canSeeMatter ? <p><Link href={`/matters/${task.matter!.id}`}>{task.matter!.matterNumber} · {task.matter!.clientName} {task.matter!.clientSurname}</Link></p> : null}
                </div>
                <span className="task-urgency" style={{ "--urgency-colour": task.urgency.colour } as React.CSSProperties}>{task.status === "Complete" ? "Complete" : task.urgency.label}</span>
              </div>
              <p className="foundation-muted">Assigned to {task.assignedTo.name} · Due {task.dueAt?.toLocaleDateString() ?? "No due date"}</p>
              {latestNudge ? <p className="task-nudge-notice">Nudged by {latestNudge.sender.name} on {latestNudge.createdAt.toLocaleDateString()}.</p> : null}
              {task.status === "Open" && canEdit ? (
                <div className="todo-card-actions">
                  <TaskCompleteForm action={completeTask} taskId={task.id} />
                  <details className="task-edit-details">
                    <summary>Change assignment or due date</summary>
                    <ActionForm action={updateTaskAssignment} className="foundation-form">
                      <input type="hidden" name="taskId" value={task.id} />
                      <label className="foundation-field"><span>Assigned person</span><select name="assignedToId" defaultValue={task.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                      <label className="foundation-field"><span>Due date</span><input type="date" name="dueAt" defaultValue={task.dueAt?.toISOString().slice(0, 10) ?? ""} /></label>
                      <label className="foundation-field"><span>Reason (required when either value changes)</span><input name="reason" maxLength={500} /></label>
                      <SubmitButton>Save task changes</SubmitButton>
                    </ActionForm>
                  </details>
                  {isDirectReport ? <ActionForm action={nudgeTask}><input type="hidden" name="taskId" value={task.id} /><SubmitButton className="button-secondary">Nudge assignee</SubmitButton></ActionForm> : null}
                </div>
              ) : null}
            </article>
          );
        })}
        {!tasks.length ? <section className="foundation-panel"><p>No tasks match this search.</p></section> : null}
        {tasks.length === 500 ? <p className="foundation-muted">Showing the first 500 matching tasks. Narrow your search for additional results.</p> : null}
      </div>
    </section>
  );
}
