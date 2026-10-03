import Link from "next/link";
import { createDuty, returnDuty } from "@/app/actions/module-e";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DUTY_METHODS } from "@/lib/module-e-rules";

type Search = { q?: string; status?: string; method?: string };

export default async function DutiesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = ["All", "Scheduled", "Returned"].includes(query.status ?? "") ? query.status ?? "All" : "All";
  const method = DUTY_METHODS.includes(query.method as (typeof DUTY_METHODS)[number]) ? query.method : "All";
  const matterScope = permissionScope(user, "matters");
  const taskScope = permissionScope(user, "tasks");
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
  const duties = await getDb().dutyRecord.findMany({
    where: {
      firmId: user.firmId,
      ...(status !== "All" ? { status } : {}),
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
    select: { id: true, title: true, method: true, dueAt: true, status: true, returnedAt: true, returnNotes: true, assignedToId: true, assignedTo: { select: { name: true } }, matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } } },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], take: 500,
  });
  const canEditMatters = hasPermission(user, "matters", "Edit");
  const canEditTasks = hasPermission(user, "tasks", "Edit");
  const assigneeIds = taskAssigneeIds;
  const [matters, assignees] = await Promise.all([
    canEditMatters ? getDb().matter.findMany({
      where: { firmId: user.firmId, ...(matterScope === "Firm" ? {} : { responsibleId: { in: matterScope === "Team" ? [user.id, ...matterReports.map((row) => row.userId)] : [user.id] } }) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true }, orderBy: { matterNumber: "asc" }, take: 1000,
    }) : [],
    canEditTasks ? getDb().user.findMany({
      where: { firmId: user.firmId, active: true, ...(assigneeIds ? { id: { in: assigneeIds } } : {}) },
      select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500,
    }) : [],
  ]);
  return (
    <section className="foundation-page">
      <FoundationHeader title="Duties" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Assign duties using the required delivery method. When a sheriff or other duty return is recorded, Parlia creates both internal and external update tasks in the same transaction.</p>
      {canEditMatters && canEditTasks ? <section className="foundation-panel">
        <h2>Schedule a duty</h2>
        <ActionForm action={createDuty} className="foundation-form">
          <label className="foundation-field"><span>Duty</span><input name="title" maxLength={240} required /></label>
          <label className="foundation-field"><span>Method</span><select name="method" required defaultValue=""><option value="" disabled>Select method</option>{DUTY_METHODS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
          <label className="foundation-field"><span>Matter (optional)</span><select name="matterId" defaultValue=""><option value="">No matter link</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label>
          <label className="foundation-field"><span>Assignee</span><select name="assignedToId" required defaultValue=""><option value="" disabled>Select person</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="foundation-field"><span>Due date (optional)</span><input name="dueAt" type="date" /></label>
          <SubmitButton>Create duty</SubmitButton>
        </ActionForm>
      </section> : null}
      <form action="/duties" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search duties</span><input name="q" defaultValue={q} maxLength={120} placeholder="Title, method or matter number" /></label>
        <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status}><option>All</option><option>Scheduled</option><option>Returned</option></select></label>
        <label className="foundation-field"><span>Method</span><select name="method" defaultValue={method}><option>All</option>{DUTY_METHODS.map((entry) => <option key={entry}>{entry}</option>)}</select></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">
        {duties.map((duty) => <article className="todo-card" key={duty.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">{duty.method} · {duty.status}</p><h2>{duty.title}</h2>{duty.matter ? <p><Link href={`/matters/${duty.matter.id}`}>{duty.matter.matterNumber} · {duty.matter.clientName} {duty.matter.clientSurname}</Link></p> : null}</div><span>{duty.dueAt?.toLocaleDateString() ?? "No due date"}</span></div>
          <p className="foundation-muted">Assigned to {duty.assignedTo.name}{duty.returnedAt ? ` · Returned ${duty.returnedAt.toLocaleDateString()}` : ""}</p>
          {duty.returnNotes ? <p>{duty.returnNotes}</p> : null}
          {duty.status === "Scheduled" && canEditMatters && canEditTasks ? <details><summary>Record sheriff / duty return</summary><ActionForm action={returnDuty} className="foundation-form">
            <input type="hidden" name="dutyId" value={duty.id} />
            <label className="foundation-field"><span>Return notes (optional)</span><textarea name="returnNotes" maxLength={1000} /></label>
            <label className="foundation-field"><span>Internal update assignee</span><select name="internalAssigneeId" required defaultValue={duty.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>Internal update due date (optional)</span><input name="internalDueAt" type="date" /></label>
            <label className="foundation-field"><span>External update assignee</span><select name="externalAssigneeId" required defaultValue={duty.assignedToId}>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>External update due date (optional)</span><input name="externalDueAt" type="date" /></label>
            <p className="foundation-muted">Two tasks will be created: Updates internal and Updates external.</p>
            <SubmitButton>Save return and create tasks</SubmitButton>
          </ActionForm></details> : null}
        </article>)}
        {!duties.length ? <section className="foundation-panel"><p>No duties match this search.</p></section> : null}
        {duties.length === 500 ? <p className="foundation-muted">Showing the first 500 duties. Narrow your search to find older entries.</p> : null}
      </div>
    </section>
  );
}
