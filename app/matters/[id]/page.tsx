import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addDocumentReference,
  addMatterNote,
  addMatterTask,
  changeMatterStage,
  completeTask,
  nudgeTask,
  updateMatterStatus,
  updateTaskAssignment,
} from "@/app/actions/matters";
import { createClientPortalUpdate, revokeClientMatterAccess } from "@/app/actions/client-portal";
import { cancelPortalInvitation, inviteClientToMatter, sendPortalInvitation } from "@/app/actions/client-auth";
import { portalInviteStatus } from "@/lib/portal-status";
import { portalSettingsFromConfig } from "@/lib/portal-settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MatterFieldForm, MatterStageForm, TaskCategories, TaskCompleteForm } from "@/components/matter-forms";
import { FoundationHeader } from "@/components/foundation";
import { getDb } from "@/lib/db";
import { hasPermission, permissionScope, requirePermission } from "@/lib/auth";
import { matterTypesFromConfig, taskCategoriesFromConfig } from "@/lib/matter-config";
import { taskUrgency, type UrgencyBand } from "@/lib/matter-rules";

export default async function MatterDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("matters");
  const { id } = await params;
  const db = getDb();
  const matter = await db.matter.findFirst({
    where: { id, firmId: user.firmId },
    select: {
      id: true,
      firmId: true,
      matterNumber: true,
      clientName: true,
      clientSurname: true,
      clientEmail: true,
      matterType: true,
      stage: true,
      stageKind: true,
      responsibleId: true,
      clientNumber: true,
      otherReferences: true,
      caseNumber: true,
      status: true,
      onHoldReason: true,
      reviewDate: true,
      lastActivityAt: true,
      createdAt: true,
      responsible: { select: { name: true, email: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!matter) notFound();

  const matterScope = permissionScope(user, "matters");
  const matterReports = matterScope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
    : [];
  if (!user.isOwner && matterScope !== "Firm" && matter.responsibleId !== user.id &&
    !(matterScope === "Team" && matterReports.some((report) => report.userId === matter.responsibleId))) notFound();

  const canViewTasks = hasPermission(user, "tasks");
  const canEditMatter = hasPermission(user, "matters", "Edit");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const taskScope = permissionScope(user, "tasks");
  const taskReports = canViewTasks
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
    : [];
  const visibleTaskAssignees = taskScope === "Firm" ? undefined : taskScope === "Team" ? [user.id, ...taskReports.map((report) => report.userId)] : [user.id];
  const [configuration, notes, activities, documentReferences, tasks, assignees] = await Promise.all([
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
    db.matterNote.findMany({ where: { firmId: user.firmId, matterId: matter.id }, select: { id: true, body: true, createdAt: true, author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.matterActivity.findMany({ where: { firmId: user.firmId, matterId: matter.id }, select: { id: true, action: true, createdAt: true, details: true, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.documentReference.findMany({ where: { firmId: user.firmId, matterId: matter.id }, select: { id: true, label: true, reference: true, createdAt: true, createdBy: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    canViewTasks
      ? db.task.findMany({
          where: { firmId: user.firmId, matterId: matter.id, ...(visibleTaskAssignees ? { assignedToId: { in: visibleTaskAssignees } } : {}) },
          select: {
            id: true, title: true, category: true, stage: true, status: true, dueAt: true, assignedToId: true,
            assignedTo: { select: { name: true } },
            nudges: { where: { firmId: user.firmId }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, sender: { select: { name: true } } } },
          },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }],
          take: 500,
        })
      : Promise.resolve([]),
    canEditTasks
      ? taskScope === "Firm"
        ? db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } })
        : db.user.findMany({ where: { firmId: user.firmId, active: true, id: { in: visibleTaskAssignees ?? [user.id] } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);
  const types = matterTypesFromConfig(configuration?.published);
  const stages = types.find((type) => type.name === matter.matterType)?.stages ?? [];
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, unknown> : {};
  const urgencyBands = Array.isArray(published.urgencyBands) ? published.urgencyBands as UrgencyBand[] : [];
  const categories = taskCategoriesFromConfig(configuration?.published);
  const portalSettings = portalSettingsFromConfig(configuration?.published);
  const [portalAccess, portalUpdates, latestInvitation, removedAccessCount] = canEditMatter ? await Promise.all([
    db.clientMatterAccess.findMany({
      where: { firmId: user.firmId, matterId: matter.id, revokedAt: null },
      include: { client: { select: { id: true, name: true, email: true, active: true } } },
      orderBy: { grantedAt: "desc" },
    }),
    db.clientPortalUpdate.findMany({
      where: { firmId: user.firmId, matterId: matter.id },
      select: { id: true, title: true, body: true, sharedAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.clientPortalInvitation.findFirst({ where: { firmId: user.firmId, matterId: matter.id }, orderBy: { createdAt: "desc" }, select: { createdAt: true, expiresAt: true, acceptedAt: true } }),
    db.clientMatterAccess.count({ where: { firmId: user.firmId, matterId: matter.id, revokedAt: { not: null } } }),
  ]) : [[], [], null, 0] as const;
  const portalStatus = portalInviteStatus({ activeAccessCount: portalAccess.filter((access) => access.client.active).length, removedAccessCount, latestInvitation, reminderDays: portalSettings.inviteReminderDays });

  return (
    <section className="foundation-page">
      <FoundationHeader title={matter.matterNumber} firm={user.firm.name} isOwner={user.isOwner} />
      <div className="work-actions">
        <Link className="button-secondary link-button" href="/matters">All matters</Link>
        <Link className="button-secondary link-button" href={`/matters/board`}>Stages board</Link>
      </div>
      <section className="foundation-panel matter-summary">
        <div className="matter-summary-heading">
          <div><p className="eyebrow">{matter.matterType} · {matter.stage} ({matter.stageKind})</p><h2>{matter.clientName} {matter.clientSurname}</h2></div>
          <span className={`matter-status status-${matter.status.toLowerCase()}`}>{matter.status === "OnHold" ? "On hold" : matter.status}</span>
        </div>
        <dl className="matter-facts">
          <div><dt>Responsible person</dt><dd>{matter.responsible.name}</dd></div>
          <div><dt>Client email</dt><dd>{matter.clientEmail || "Not supplied"}</dd></div>
          <div><dt>Client number</dt><dd>{matter.clientNumber || "Not supplied"}</dd></div>
          <div><dt>Case number</dt><dd>{matter.caseNumber || "Not supplied"}</dd></div>
          <div><dt>Other references</dt><dd>{matter.otherReferences || "Not supplied"}</dd></div>
          <div><dt>Last meaningful activity</dt><dd>{matter.lastActivityAt.toLocaleString()}</dd></div>
          {matter.status === "OnHold" ? <><div><dt>On-hold reason</dt><dd>{matter.onHoldReason || "Not recorded"}</dd></div><div><dt>Review date</dt><dd>{matter.reviewDate?.toLocaleDateString() || "Not set"}</dd></div></> : null}
        </dl>
      </section>

      {canEditMatter ? <section className="foundation-panel">
        <h2>Client portal</h2>
        <p className="foundation-muted">Access is connected to this matter only. The client sees only updates you explicitly share. Documents stay in the firm’s approved system; Parlia stores references and review status, not files.</p>
        <p><strong>Portal status: {portalStatus.status}{portalStatus.invitedAt ? ` (${portalStatus.invitedAt.toLocaleDateString()})` : ""}</strong></p>
        {portalStatus.needsReminder ? <p className="foundation-notice">{portalStatus.expired ? "The invitation link has expired and was not accepted." : "The client has not accepted the invitation yet."} Send it again or contact the client.</p> : null}
        {matter.clientEmail ? <div className="work-actions">
          <ActionForm action={sendPortalInvitation} className="foundation-form">
            <input type="hidden" name="matterId" value={matter.id} />
            <SubmitButton>{portalStatus.status === "Invited" ? "Resend invitation" : "Send portal invitation"}</SubmitButton>
          </ActionForm>
          {portalStatus.status === "Invited" ? <ActionForm action={cancelPortalInvitation} className="foundation-form">
            <input type="hidden" name="matterId" value={matter.id} />
            <SubmitButton className="button-secondary">Cancel invitation</SubmitButton>
          </ActionForm> : null}
          <ActionForm action={inviteClientToMatter} className="foundation-form">
            <input type="hidden" name="matterId" value={matter.id} />
            <SubmitButton className="button-secondary">Connect an existing portal account</SubmitButton>
          </ActionForm>
        </div> : <p className="foundation-notice">Add a client email to this matter before inviting the client.</p>}
        {matter.clientEmail ? <p className="foundation-muted">Invitations go only to {matter.clientEmail}, the email on this matter. Links work once and expire after {portalSettings.inviteExpiryDays} days.</p> : null}
        {portalAccess.length ? <div className="todo-list">{portalAccess.map((access) => (
          <article className="todo-card" key={access.id}>
            <div className="todo-card-heading"><div><h3>{access.client.name}</h3><p className="foundation-muted">{access.client.email}</p></div><span>{access.client.active ? "Active account" : "Account pending"}</span></div>
            <ActionForm action={revokeClientMatterAccess}>
              <input type="hidden" name="matterId" value={matter.id} />
              <input type="hidden" name="accessId" value={access.id} />
              <SubmitButton className="button-secondary">Revoke matter access</SubmitButton>
            </ActionForm>
          </article>
        ))}</div> : <p>No client account is connected to this matter.</p>}
        <details>
          <summary>More · prepare a portal update</summary>
          <ActionForm action={createClientPortalUpdate} className="foundation-form">
            <input type="hidden" name="matterId" value={matter.id} />
            <label className="foundation-field"><span>Update title</span><input name="title" maxLength={160} required /></label>
            <label className="foundation-field"><span>Update for the client</span><textarea name="body" maxLength={3000} required /></label>
            <label className="foundation-field"><span><input type="checkbox" name="shareNow" /> Share this update with the connected client now</span></label>
            <SubmitButton>Save update</SubmitButton>
          </ActionForm>
          {portalUpdates.map((update) => (
            <article className="matter-timeline" key={update.id}>
              <h3>{update.title} · {update.sharedAt ? "Shared" : "Private draft"}</h3>
              <p>{update.body}</p>
              <small>{update.createdAt.toLocaleString()}</small>
            </article>
          ))}
        </details>
        <Link href="/client-review">Review client document references</Link>
      </section> : null}

      {canEditMatter ? (
        <section className="foundation-panel matter-control-grid">
          {stages.length ? <div><h2>Stage</h2><MatterStageForm action={changeMatterStage} matterId={matter.id} stages={stages} currentStage={matter.stage} /></div> : null}
          <div>
            <h2>Matter status</h2>
            <MatterFieldForm action={updateMatterStatus} matterId={matter.id} className="foundation-form matter-status-form">
              <label className="foundation-field"><span>Status</span><select name="status" defaultValue={matter.status}><option value="Active">Active</option><option value="OnHold">On hold</option><option value="Closed">Closed</option></select></label>
              <label className="foundation-field"><span>On-hold reason (required when on hold)</span><input name="onHoldReason" maxLength={500} defaultValue={matter.onHoldReason ?? ""} /></label>
              <label className="foundation-field"><span>Review date (required when on hold)</span><input name="reviewDate" type="date" defaultValue={matter.reviewDate?.toISOString().slice(0, 10) ?? ""} /></label>
            </MatterFieldForm>
          </div>
        </section>
      ) : null}

      <nav className="matter-section-nav" aria-label="Matter sections">
        {canViewTasks ? <a href="#matter-tasks">Tasks</a> : null}
        <a href="#matter-followups">Follow-ups</a><a href="#matter-notes">Notes & activity</a><a href="#matter-documents">Document references</a>
      </nav>

      {canViewTasks ? (
        <section className="foundation-panel" id="matter-tasks">
          <h2>Tasks</h2>
          {canEditTasks && categories.length ? (
            <details className="matter-add-task">
              <summary>Add a task</summary>
              <MatterFieldForm action={addMatterTask} matterId={matter.id} className="foundation-form matter-task-form">
                <label className="foundation-field"><span>Task title</span><input name="title" maxLength={160} required /></label>
                <TaskCategories categories={categories} />
                <label className="foundation-field"><span>Assigned person</span><select name="assignedToId" required>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="foundation-field"><span>Due date (optional)</span><input name="dueAt" type="date" /></label>
              </MatterFieldForm>
            </details>
          ) : null}
          <div className="matter-task-list">
            {tasks.map((task) => {
              const urgency = taskUrgency(task.dueAt, urgencyBands);
              const supervisorCanNudge = task.status === "Open" && taskReports.some((report) => report.userId === task.assignedToId);
              return (
                <article className="matter-task-row" key={task.id}>
                  <div><strong>{task.title}</strong><small>{task.category}{task.stage ? ` · ${task.stage}` : ""} · {task.assignedTo.name} · Due {task.dueAt?.toLocaleDateString() ?? "No date"}</small></div>
                  <span className="task-urgency" style={{ "--urgency-colour": urgency.colour } as React.CSSProperties}>{task.status === "Complete" ? "Complete" : urgency.label}</span>
                  {task.status === "Open" && canEditTasks ? (
                    <div className="matter-task-controls">
                      <TaskCompleteForm action={completeTask} taskId={task.id} />
                      <details><summary>Edit</summary>
                        <ActionForm action={updateTaskAssignment} className="foundation-form">
                          <input type="hidden" name="taskId" value={task.id} />
                          <label className="foundation-field"><span>Assigned person</span><select name="assignedToId" defaultValue={task.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                          <label className="foundation-field"><span>Due date</span><input name="dueAt" type="date" defaultValue={task.dueAt?.toISOString().slice(0, 10) ?? ""} /></label>
                          <label className="foundation-field"><span>Reason (required when changed)</span><input name="reason" maxLength={500} /></label>
                          <SubmitButton>Save task changes</SubmitButton>
                        </ActionForm>
                      </details>
                      {supervisorCanNudge ? <ActionForm action={nudgeTask}><input type="hidden" name="taskId" value={task.id} /><SubmitButton className="button-secondary">Nudge</SubmitButton></ActionForm> : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
            {!tasks.length ? <p className="foundation-muted">No tasks are visible for this matter under your task scope.</p> : null}
          </div>
        </section>
      ) : null}

      <section className="foundation-panel" id="matter-followups">
        <h2>Follow-ups</h2>
        {canViewTasks ? (
          tasks.filter((task) => task.category === "Follow up").length
            ? <ul className="matter-reference-list">{tasks.filter((task) => task.category === "Follow up").map((task) => <li key={task.id}><strong>{task.title}</strong> · {task.status === "Complete" ? "Complete" : task.dueAt?.toLocaleDateString() ?? "No due date"} · {task.assignedTo.name}</li>)}</ul>
            : <p className="foundation-muted">No follow-up tasks have been configured for this matter.</p>
        ) : <p className="foundation-muted">Your role does not include task access for this matter.</p>}
      </section>

      <section className="foundation-panel" id="matter-notes">
        <h2>Notes & activity</h2>
        {canEditMatter ? (
          <MatterFieldForm action={addMatterNote} matterId={matter.id} className="foundation-form">
            <label className="foundation-field"><span>Add an internal note</span><textarea name="body" maxLength={5000} required /></label>
          </MatterFieldForm>
        ) : null}
        <div className="matter-timeline">
          {notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{note.author.name} · {note.createdAt.toLocaleString()}</small></article>)}
          {activities.map((activity) => <article className="matter-activity" key={activity.id}><p><strong>{activity.action}</strong>{activity.details && typeof activity.details === "object" && "from" in activity.details && "to" in activity.details ? ` · ${String(activity.details.from)} → ${String(activity.details.to)}` : ""}</p><small>{activity.actor?.name ?? "System"} · {activity.createdAt.toLocaleString()}</small></article>)}
          {!notes.length && !activities.length ? <p className="foundation-muted">No notes or activity yet.</p> : null}
        </div>
      </section>

      <section className="foundation-panel" id="matter-documents">
        <h2>Document references</h2>
        <p className="foundation-muted">References only. Parlia does not upload or store document content here.</p>
        {canEditMatter ? (
          <MatterFieldForm action={addDocumentReference} matterId={matter.id} className="foundation-form matter-task-form">
            <label className="foundation-field"><span>Document label</span><input name="label" maxLength={160} required /></label>
            <label className="foundation-field"><span>Reference or location</span><input name="reference" maxLength={1000} required /></label>
          </MatterFieldForm>
        ) : null}
        {documentReferences.length ? <ul className="matter-reference-list">{documentReferences.map((reference) => <li key={reference.id}><strong>{reference.label}</strong> · {reference.reference} <small>{reference.createdBy.name} · {reference.createdAt.toLocaleDateString()}</small></li>)}</ul> : <p className="foundation-muted">No document references recorded.</p>}
      </section>
    </section>
  );
}
