import Link from "next/link";
import { changeCourtRun, confirmCourtRunReturned, removeCourtRun, updateCourtRun } from "@/app/actions/court-runs";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CourtRunBatch } from "@/components/court-run-batch";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { canChangeCourtRun, canConfirmReturn, canUpdateCourtRun, COURT_RUN_DEPARTMENTS, COURT_RUN_METHODS, courtRunState } from "@/lib/court-run-rules";
import { getDb } from "@/lib/db";

type Search = { q?: string; state?: string; tab?: string; who?: string };
const STATES = ["Open", "To do", "Overdue", "Done", "Returned", "All"] as const;
const day = (date: Date | null) => date ? new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(date) : "—";
const stamp = (date: Date | null) => date ? new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg" }).format(date) : "";
const iso = (date: Date | null) => date ? date.toISOString().slice(0, 10) : "";

export default async function CourtRunsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const db = getDb();
  const q = query.q?.trim().slice(0, 120) ?? "";
  const stateFilter = (STATES as readonly string[]).includes(query.state ?? "") ? query.state! : "Open";
  const matterScope = permissionScope(user, "matters");
  const taskScope = permissionScope(user, "tasks");
  const canSignOut = hasPermission(user, "matters", "Edit") && hasPermission(user, "tasks", "Edit");
  const tab = query.tab === "all" || (query.tab === "new" && canSignOut) ? query.tab : "mine";
  const reports = matterScope === "Team" || taskScope === "Team"
    ? (await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } })).map((row) => row.userId)
    : [];
  const team = [user.id, ...reports];
  const seeEverything = user.isOwner || matterScope === "Firm" || taskScope === "Firm";
  // Everyone sees runs they signed out or were given; wider access follows their matter/task scope.
  const access = seeEverything ? {} : { OR: [{ createdById: user.id }, { assignedToId: { in: taskScope === "Team" ? team : [user.id] } }, ...(matterScope === "Team" ? [{ matter: { is: { responsibleId: { in: team } } } }] : [])] };
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const stateWhere = stateFilter === "Open" ? { completedAt: null, returnedAt: null }
    : stateFilter === "To do" ? { completedAt: null, returnedAt: null, OR: [{ dueAt: null }, { dueAt: { gte: today } }] }
    : stateFilter === "Overdue" ? { completedAt: null, returnedAt: null, dueAt: { lt: today } }
    : stateFilter === "Done" ? { completedAt: { not: null }, returnedAt: null }
    : stateFilter === "Returned" ? { returnedAt: { not: null } } : {};
  const select = {
    id: true, title: true, method: true, dueAt: true, status: true, jurisdiction: true, location: true, reason: true, department: true, matterId: true,
    updateNotes: true, returnNotes: true, completedAt: true, returnedAt: true, assignedToId: true, createdById: true, createdAt: true,
    assignedTo: { select: { name: true } }, createdBy: { select: { name: true } }, returnedBy: { select: { name: true } },
    matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } },
  } as const;
  const search = q ? { OR: [
    { title: { contains: q, mode: "insensitive" as const } }, { jurisdiction: { contains: q, mode: "insensitive" as const } },
    { location: { contains: q, mode: "insensitive" as const } }, { reason: { contains: q, mode: "insensitive" as const } },
    { matter: { is: { matterNumber: { contains: q, mode: "insensitive" as const } } } },
  ] } : {};
  const matterWhere = matterScope === "Firm" || user.isOwner ? {} : { responsibleId: { in: matterScope === "Team" ? team : [user.id] } };

  const [mine, all, matters, people] = await Promise.all([
    db.dutyRecord.findMany({ where: { firmId: user.firmId, assignedToId: user.id, returnedAt: null, OR: [{ completedAt: null }, { completedAt: { gte: new Date(Date.now() - 7 * 86_400_000) } }] }, select, orderBy: [{ completedAt: { sort: "desc", nulls: "first" } }, { dueAt: "asc" }], take: 200 }),
    tab === "all" ? db.dutyRecord.findMany({ where: { firmId: user.firmId, AND: [access, stateWhere, search, query.who === "me" ? { createdById: user.id } : {}] }, select, orderBy: [{ dueAt: "desc" }, { createdAt: "desc" }], take: 300 }) : Promise.resolve([]),
    canSignOut ? db.matter.findMany({ where: { firmId: user.firmId, ...matterWhere }, select: { id: true, matterNumber: true, clientName: true, clientSurname: true }, orderBy: { matterNumber: "asc" }, take: 2000 }) : Promise.resolve([]),
    canSignOut ? db.user.findMany({ where: { firmId: user.firmId, active: true, ...(taskScope === "Firm" || user.isOwner ? {} : { id: { in: team } }) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }) : Promise.resolve([]),
  ]);
  const matterOptions = matters.map((matter) => ({ id: matter.id, label: `${matter.matterNumber} · ${[matter.clientName, matter.clientSurname].filter(Boolean).join(" ")}` }));
  const personOptions = people.map((person) => ({ id: person.id, label: person.name }));
  const openMine = mine.filter((run) => !run.completedAt);
  const now = new Date();
  const tabLink = (name: string, label: string, count?: number) => <Link key={name} aria-current={tab === name ? "page" : undefined} href={`/duties?tab=${name}`}>{label}{count ? <span className="court-run-count">{count}</span> : null}</Link>;

  return (
    <section className="foundation-page court-runs-page">
      <FoundationHeader title="Court runs" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Sign out court, sheriff and filing runs, tick them off with an update, and confirm when documents are back. Only the person who signed a run out can change it.</p>
      <nav className="court-run-tabs" aria-label="Court run views">
        {tabLink("mine", "My court runs", openMine.length)}
        {canSignOut ? tabLink("new", "Sign out court runs") : null}
        {tabLink("all", "All court runs")}
      </nav>

      {tab === "mine" ? <section className="court-run-checklist" aria-label="My court runs checklist">
        <h2>My checklist</h2>
        <p className="foundation-muted">Give an update for each run. Ticking it off needs an update too – say what happened (issued, served, postponed, filed).</p>
        {!mine.length ? <p className="foundation-panel">Nothing on your list. Runs assigned to you will show here.</p> : null}
        <ul>{mine.map((run) => {
          const state = courtRunState(run, now);
          return <li key={run.id} className={`court-run-item state-${state.toLowerCase().replace(" ", "-")}`}>
            <div className="court-run-item-head">
              <span className="court-run-tick" aria-hidden>{run.completedAt ? "✓" : ""}</span>
              <div>
                <strong>{run.title}</strong>
                <p>{[day(run.dueAt), run.matter?.matterNumber, run.jurisdiction, run.location, run.method].filter(Boolean).join(" · ")}</p>
                {run.reason ? <p className="foundation-muted">Reason: {run.reason}</p> : null}
                <p className="foundation-muted">Signed out by {run.createdBy.name}{run.department ? ` · ${run.department}` : ""}</p>
              </div>
              <span className={`court-run-status status-${state.toLowerCase().replace(" ", "-")}`}>{state}</span>
            </div>
            {run.updateNotes ? <pre className="court-run-notes">{run.updateNotes}</pre> : null}
            {!run.completedAt && canUpdateCourtRun(run, user.id) ? <ActionForm action={updateCourtRun} className="court-run-update-form">
              <input type="hidden" name="dutyId" value={run.id} />
              <label className="foundation-field"><span>Update</span><textarea name="update" maxLength={1000} required rows={2} placeholder="e.g. Summons issued, case number 1234/26" /></label>
              <div className="court-run-buttons">
                <button className="button-primary" type="submit" name="intent" value="done">✓ Done</button>
                <button className="button-secondary" type="submit" name="intent" value="update">Save update only</button>
              </div>
            </ActionForm> : null}
            {run.completedAt && canConfirmReturn(run, user.id, user.isOwner) ? <ActionForm action={confirmCourtRunReturned} className="court-run-inline-form">
              <input type="hidden" name="dutyId" value={run.id} />
              <span className="foundation-muted">Done {stamp(run.completedAt)}.</span>
              <SubmitButton className="button-secondary">Documents back at the office</SubmitButton>
            </ActionForm> : null}
          </li>;
        })}</ul>
      </section> : null}

      {tab === "new" && canSignOut ? <section className="foundation-panel">
        <h2>Sign out court runs</h2>
        <CourtRunBatch today={iso(now)} matters={matterOptions} people={personOptions} departments={COURT_RUN_DEPARTMENTS} methods={COURT_RUN_METHODS} />
      </section> : null}

      {tab === "all" ? <section className="court-run-table-section">
        <form action="/duties" className="foundation-inline-form matter-search">
          <input type="hidden" name="tab" value="all" />
          <label className="foundation-field"><span>Search</span><input name="q" defaultValue={q} maxLength={120} placeholder="Ref nr, court, location or reason" /></label>
          <label className="foundation-field"><span>Show</span><select name="state" defaultValue={stateFilter}>{STATES.map((name) => <option key={name}>{name}</option>)}</select></label>
          <label className="foundation-field"><span>Signed out by</span><select name="who" defaultValue={query.who === "me" ? "me" : ""}><option value="">Anyone</option><option value="me">Me</option></select></label>
          <button className="button-primary" type="submit">Filter</button>
        </form>
        <div className="court-run-table-scroll"><table className="court-run-table">
          <thead><tr><th>Date</th><th>Signed out by</th><th>Assigned to</th><th>Jurisdiction</th><th>Location</th><th>Ref nr</th><th>Reason</th><th>Department</th><th>Done</th><th>Update</th><th>Returned</th><th aria-label="Change" /></tr></thead>
          <tbody>{all.map((run) => {
            const state = courtRunState(run, now);
            return <tr key={run.id}>
              <td>{day(run.dueAt)}<br /><span className={`court-run-status status-${state.toLowerCase().replace(" ", "-")}`}>{state}</span></td>
              <td>{run.createdBy.name}</td><td>{run.assignedTo.name}</td><td>{run.jurisdiction ?? "—"}</td><td>{run.location ?? "—"}</td>
              <td>{run.matter ? <Link prefetch={false} href={`/matters/${run.matter.id}`}>{run.matter.matterNumber}</Link> : "—"}</td>
              <td><strong>{run.title}</strong>{run.reason ? <><br />{run.reason}</> : null}</td>
              <td>{run.department ?? "—"}</td>
              <td>{run.completedAt ? `✓ ${stamp(run.completedAt)}` : "—"}</td>
              <td className="court-run-update-cell">{run.updateNotes ?? run.returnNotes ?? "—"}</td>
              <td>{run.returnedAt ? `✓ ${stamp(run.returnedAt)}${run.returnedBy ? ` · ${run.returnedBy.name}` : ""}` : canConfirmReturn(run, user.id, user.isOwner) && run.completedAt ? <ActionForm action={confirmCourtRunReturned}><input type="hidden" name="dutyId" value={run.id} /><SubmitButton className="button-link">Confirm</SubmitButton></ActionForm> : "—"}</td>
              <td>{canChangeCourtRun(run, user.id) ? <details className="court-run-update">
                <summary>Change</summary>
                <ActionForm action={changeCourtRun} className="court-run-update-form">
                  <input type="hidden" name="dutyId" value={run.id} />
                  <label className="foundation-field"><span>Date</span><input type="date" name="dueAt" defaultValue={iso(run.dueAt)} required /></label>
                  <label className="foundation-field"><span>Ref nr</span><select name="matterId" defaultValue={run.matterId ?? ""}><option value="">No matter</option>{matterOptions.map((matter) => <option key={matter.id} value={matter.id}>{matter.label}</option>)}</select></label>
                  <label className="foundation-field"><span>What must be done</span><input name="title" defaultValue={run.title} maxLength={240} required /></label>
                  <label className="foundation-field"><span>Jurisdiction</span><input name="jurisdiction" defaultValue={run.jurisdiction ?? ""} maxLength={160} /></label>
                  <label className="foundation-field"><span>Location</span><input name="location" defaultValue={run.location ?? ""} maxLength={160} /></label>
                  <label className="foundation-field"><span>Reason</span><input name="reason" defaultValue={run.reason ?? ""} maxLength={500} /></label>
                  <label className="foundation-field"><span>Department</span><select name="department" defaultValue={run.department ?? ""}><option value="">—</option>{COURT_RUN_DEPARTMENTS.map((name) => <option key={name}>{name}</option>)}</select></label>
                  <label className="foundation-field"><span>Method</span><select name="method" defaultValue={run.method}>{COURT_RUN_METHODS.map((name) => <option key={name}>{name}</option>)}</select></label>
                  <label className="foundation-field"><span>Assigned to</span><select name="assignedToId" defaultValue={run.assignedToId}>{personOptions.map((person) => <option key={person.id} value={person.id}>{person.label}</option>)}</select></label>
                  <SubmitButton>Save changes</SubmitButton>
                </ActionForm>
                <ActionForm action={removeCourtRun} confirmationMessage="Remove this court run?"><input type="hidden" name="dutyId" value={run.id} /><SubmitButton className="button-link danger">Remove</SubmitButton></ActionForm>
              </details> : null}</td>
            </tr>;
          })}</tbody>
        </table></div>
        {!all.length ? <p className="foundation-panel">No court runs match these filters.</p> : null}
        {all.length === 300 ? <p className="foundation-muted">Showing the latest 300. Search to find older runs.</p> : null}
      </section> : null}
    </section>
  );
}
