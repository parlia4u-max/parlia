import Link from "next/link";
import { createDuty, returnDuty, updateMyDuty } from "@/app/actions/module-e";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { courtRunStatus, DUTY_METHODS } from "@/lib/module-e-rules";

type Search = { q?: string; status?: string; method?: string; tab?: string };
const TABS = ["assign", "mine", "all"] as const;

export default async function DutiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = ["All", "Assigned", "Attending", "Completed"].includes(query.status ?? "") ? query.status ?? "All" : "All";
  const method = DUTY_METHODS.includes(query.method as (typeof DUTY_METHODS)[number]) ? query.method : "All";
  const matterScope = permissionScope(user, "matters");
  const taskScope = permissionScope(user, "tasks");
  const canEditMatters = hasPermission(user, "matters", "Edit");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const canAssign = canEditMatters && canEditTasks;
  const tab = query.tab === "mine" || query.tab === "all" ? query.tab : canAssign ? "assign" : "mine";
  const [matterReports, taskReports] = await Promise.all([
    matterScope === "Team" ? getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } }) : [],
    taskScope === "Team" ? getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } }) : [],
  ]);
  const matterIds = await getDb().matter.findMany({
    where: { firmId: user.firmId, ...(matterScope === "Firm" ? {} : { responsibleId: { in: matterScope === "Team" ? [user.id, ...matterReports.map((row) => row.userId)] : [user.id] } }) },
    select: { id: true }, take: 5000,
  });
  const taskAssigneeIds = taskScope === "Firm" ? undefined : taskScope === "Team" ? [user.id, ...taskReports.map((row) => row.userId)] : [user.id];
  const matterFilter = matterIds.length ? { matterId: { in: matterIds.map((row) => row.id) } } : null;
  const accessClauses = [
    ...(matterFilter ? [matterFilter] : []),
    ...(taskAssigneeIds ? [{ matterId: null, assignedToId: { in: taskAssigneeIds } }] : [{ matterId: null }]),
  ];
  const allDuties = await getDb().dutyRecord.findMany({
    where: {
      firmId: user.firmId,
      ...(method !== "All" ? { method } : {}),
      AND: [
        { OR: accessClauses },
        ...(q ? [{ OR: [
          { title: { contains: q, mode: "insensitive" as const } },
          { method: { contains: q, mode: "insensitive" as const } },
          { matter: { is: { matterNumber: { contains: q, mode: "insensitive" as const } } } },
        ] }] : []),
      ],
    },
    select: { id: true, title: true, method: true, dueAt: true, status: true, returnedAt: true, returnNotes: true, assignedToId: true, createdById: true, assignedTo: { select: { name: true } }, matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } } },
    orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 500,
  });
  const duties = allDuties.map((duty) => ({ ...duty, displayStatus: courtRunStatus(duty.status, duty.dueAt) }));
  const filteredDuties = duties.filter((duty) => status === "All" || duty.displayStatus === status);
  const myDuties = filteredDuties.filter((duty) => duty.assignedToId === user.id);
  const canViewAll = user.isOwner || matterScope !== "Own" || taskScope !== "Own";
  const visibleAllDuties = canViewAll ? filteredDuties : myDuties;
  const assigneeIds = taskAssigneeIds;
  const [matters, assignees] = await Promise.all([
    canAssign ? getDb().matter.findMany({
      where: { firmId: user.firmId, ...(matterScope === "Firm" ? {} : { responsibleId: { in: matterScope === "Team" ? [user.id, ...matterReports.map((row) => row.userId)] : [user.id] } }) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true }, orderBy: { matterNumber: "asc" }, take: 1000,
    }) : [],
    canAssign ? getDb().user.findMany({
      where: { firmId: user.firmId, active: true, ...(assigneeIds ? { id: { in: assigneeIds } } : {}) },
      select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500,
    }) : [],
  ]);
  const tabHref = (nextTab: (typeof TABS)[number]) => `/duties?tab=${nextTab}`;

  return (
    <section className="foundation-page court-runs-page">
      <FoundationHeader title="Court Runs" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Assign and track court runs by matter reference. Assignees update their own runs; recording returned documents is a separate action.</p>
      <nav className="court-run-tabs" aria-label="Court run views">
        {TABS.filter((name) => name !== "assign" || canAssign).map((name) => <Link key={name} aria-current={tab === name ? "page" : undefined} href={tabHref(name)}>{name === "assign" ? "Assign Duties" : name === "mine" ? "My Duties" : "All Duties"}</Link>)}
      </nav>

      {tab === "assign" && canAssign ? <>
        <section className="foundation-panel" id="court-run-assignment">
          <h2>Assign a court run</h2>
          <ActionForm action={createDuty} className="foundation-form court-run-assignment-form">
            <label className="foundation-field"><span>Court run</span><input name="title" maxLength={240} required /></label>
            <label className="foundation-field"><span>Method</span><select name="method" required defaultValue=""><option value="" disabled>Select method</option>{DUTY_METHODS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
            <label className="foundation-field"><span>Matter reference number</span><select name="matterId" required defaultValue=""><option value="" disabled>Select matter reference</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label>
            <label className="foundation-field"><span>Assignee</span><select name="assignedToId" required defaultValue=""><option value="" disabled>Select person</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>Due date</span><input name="dueAt" type="date" required /></label>
            <SubmitButton>Assign court run</SubmitButton>
          </ActionForm>
        </section>
        <section className="court-run-add-more">
          <div><h2>Need to assign another?</h2><p>Start another court run for a different matter or assignee.</p></div>
          <Link className="button-secondary" href="#court-run-assignment">Add more</Link>
        </section>
      </> : null}

      {tab === "mine" ? <section className="court-run-table-section">
        <h2>My Duties</h2>
        <div className="court-run-table-scroll"><table className="court-run-table">
          <thead><tr><th>Status</th><th>Matter reference</th><th>Court run</th><th>Method</th><th>Due date</th><th>Update</th></tr></thead>
          <tbody>{myDuties.map((duty) => <tr key={duty.id}>
            <td><span className={`court-run-status status-${duty.displayStatus.toLowerCase()}`}>{duty.displayStatus}</span></td>
            <td>{duty.matter ? <Link href={`/matters/${duty.matter.id}`}>{duty.matter.matterNumber}</Link> : "Not linked"}</td>
            <td>{duty.title}</td><td>{duty.method}</td><td>{duty.dueAt?.toLocaleDateString() ?? "No due date"}</td>
            <td>{duty.displayStatus === "Completed" ? <span>{duty.returnNotes || "Completed"}</span> : <details className="court-run-update">
              <summary>Update</summary>
              <ActionForm action={updateMyDuty} className="court-run-update-form">
                <input type="hidden" name="dutyId" value={duty.id} />
                <label className="setup-checkbox-field"><input type="checkbox" name="complete" /><span>Mark completed</span></label>
                <label className="foundation-field"><span>Update notes</span><textarea name="updateNotes" maxLength={1000} defaultValue={duty.returnNotes ?? ""} /></label>
                <SubmitButton>Save update</SubmitButton>
              </ActionForm>
            </details>}</td>
          </tr>)}</tbody>
        </table></div>
        {!myDuties.length ? <p className="foundation-panel">No court runs are assigned to you.</p> : null}
      </section> : null}

      {tab === "all" || tab === "assign" ? <section className="court-run-table-section">
        <div className="court-run-table-heading"><h2>{tab === "all" ? "All Duties" : "Assigned court runs"}</h2>{tab === "assign" && canAssign ? <Link href="#court-run-assignment">Add more</Link> : null}</div>
        {tab === "all" ? <form action="/duties" className="foundation-inline-form matter-search">
          <input type="hidden" name="tab" value="all" />
          <label className="foundation-field"><span>Search court runs</span><input name="q" defaultValue={q} maxLength={120} placeholder="Title, method or matter reference" /></label>
          <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status}><option>All</option><option>Assigned</option><option>Attending</option><option>Completed</option></select></label>
          <label className="foundation-field"><span>Method</span><select name="method" defaultValue={method}><option>All</option>{DUTY_METHODS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <button className="button-primary" type="submit">Filter</button>
        </form> : null}
        <div className="court-run-table-scroll"><table className="court-run-table">
          <thead><tr><th>Status</th><th>Matter reference</th><th>Court run</th><th>Method</th><th>Assigned to</th><th>Due date</th><th>Update</th>{canAssign ? <th>Actions</th> : null}</tr></thead>
          <tbody>{(tab === "all" ? visibleAllDuties : filteredDuties).map((duty) => <tr key={duty.id}>
            <td><span className={`court-run-status status-${duty.displayStatus.toLowerCase()}`}>{duty.displayStatus}</span></td>
            <td>{duty.matter ? <Link href={`/matters/${duty.matter.id}`}>{duty.matter.matterNumber}</Link> : "Not linked"}</td>
            <td>{duty.title}</td><td>{duty.method}</td><td>{duty.assignedTo.name}</td><td>{duty.dueAt?.toLocaleDateString() ?? "No due date"}</td>
            <td>{duty.returnNotes || (duty.returnedAt ? `Documents returned ${duty.returnedAt.toLocaleDateString()}` : "—")}</td>
            {canAssign ? <td>{!duty.returnedAt ? <details className="court-run-update">
              <summary>Return documents</summary>
              <ActionForm action={returnDuty} className="court-run-update-form">
                <input type="hidden" name="dutyId" value={duty.id} />
                <label className="foundation-field"><span>Return notes (optional)</span><textarea name="returnNotes" maxLength={1000} /></label>
                <label className="foundation-field"><span>Internal update assignee</span><select name="internalAssigneeId" required defaultValue={duty.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="foundation-field"><span>Internal update due date</span><input name="internalDueAt" type="date" /></label>
                <label className="foundation-field"><span>External update assignee</span><select name="externalAssigneeId" required defaultValue={duty.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
                <label className="foundation-field"><span>External update due date</span><input name="externalDueAt" type="date" /></label>
                <p className="foundation-muted">Returning documents creates internal and external update tasks.</p>
                <SubmitButton>Record return</SubmitButton>
              </ActionForm>
            </details> : duty.returnedAt?.toLocaleDateString() ?? "—"}</td> : null}
          </tr>)}</tbody>
        </table></div>
        {tab === "all" && !visibleAllDuties.length ? <p className="foundation-panel">No court runs match these filters.</p> : null}
        {allDuties.length === 500 ? <p className="foundation-muted">Showing the first 500 court runs. Narrow your filters to find older entries.</p> : null}
      </section> : null}
    </section>
  );
}