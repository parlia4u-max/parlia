import Link from "next/link";
import { addServiceTrace, createServiceRecord, updateServiceOutcome } from "@/app/actions/module-e";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { tracingPolicy } from "@/lib/module-e-rules";

type Search = { q?: string; status?: string };

export default async function ServiceTracingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = ["All", "Pending", "Needs tracing", "Served", "Closed"].includes(query.status ?? "") ? query.status ?? "All" : "All";
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team" ? await getDb().supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true },
  }) : [];
  const responsibleIds = scope === "Firm" ? undefined : [user.id, ...reports.map((row) => row.userId)];
  const [matters, configuration] = await Promise.all([
    getDb().matter.findMany({
      where: { firmId: user.firmId, ...(responsibleIds ? { responsibleId: { in: responsibleIds } } : {}) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true },
      orderBy: { matterNumber: "asc" }, take: 1000,
    }),
    getDb().setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
  ]);
  const matterIds = matters.map((matter) => matter.id);
  const records = matterIds.length ? await getDb().serviceRecord.findMany({
    where: {
      firmId: user.firmId,
      matterId: { in: matterIds },
      ...(status !== "All" ? { status } : {}),
      ...(q ? { OR: [
        { recipient: { contains: q, mode: "insensitive" } },
        { serviceType: { contains: q, mode: "insensitive" } },
        { outcome: { contains: q, mode: "insensitive" } },
        { matter: { matterNumber: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    },
    select: {
      id: true, recipient: true, serviceType: true, status: true, outcome: true, serviceDate: true, details: true, createdAt: true,
      matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } },
      _count: { select: { traces: true } },
      traces: { orderBy: { attempt: "desc" }, take: 1, select: { attempt: true, attemptedAt: true, note: true, createdBy: { select: { name: true } } } },
    },
    orderBy: { updatedAt: "desc" }, take: 500,
  }) : [];
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, unknown> : {};
  const rules = published.followUpRules && typeof published.followUpRules === "object" ? published.followUpRules as { tracingAfterDays?: number; maxTracingAttempts?: number } : {};
  const canEdit = hasPermission(user, "matters", "Edit");

  return (
    <section className="foundation-page">
      <FoundationHeader title="Service & tracing" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Record service activity against accessible matters, capture an outcome, and enforce this firm’s published tracing wait and maximum attempts.</p>
      {canEdit ? (
        <section className="foundation-panel">
          <h2>Record service</h2>
          <ActionForm action={createServiceRecord} className="foundation-form">
            <label className="foundation-field"><span>Matter</span><select name="matterId" required defaultValue=""><option value="" disabled>Select a matter</option>{matters.map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label>
            <label className="foundation-field"><span>Recipient</span><input name="recipient" maxLength={240} required /></label>
            <label className="foundation-field"><span>Service type</span><input name="serviceType" maxLength={120} required placeholder="Describe the service" /></label>
            <label className="foundation-field"><span>Service date (optional)</span><input name="serviceDate" type="date" /></label>
            <label className="foundation-field"><span>Details (optional)</span><textarea name="details" maxLength={1000} /></label>
            <SubmitButton>Save service record</SubmitButton>
          </ActionForm>
        </section>
      ) : null}
      <form action="/service-tracing" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search service records</span><input name="q" maxLength={120} defaultValue={q} placeholder="Recipient, type, outcome or matter number" /></label>
        <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status}><option>All</option><option>Pending</option><option>Needs tracing</option><option>Served</option><option>Closed</option></select></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">
        {records.map((record) => {
          const latestTrace = record.traces[0];
          const attemptCount = record._count.traces;
          const tracing = tracingPolicy({
            attemptCount,
            maxAttempts: Number(rules.maxTracingAttempts ?? 0),
            waitDays: Number(rules.tracingAfterDays ?? 0),
            lastAttemptAt: latestTrace?.attemptedAt ?? null,
            startedAt: record.serviceDate ?? record.createdAt,
          });
          return (
            <article className="todo-card" key={record.id}>
              <div className="todo-card-heading"><div><p className="eyebrow">{record.serviceType} · {record.status}</p><h2>{record.recipient}</h2><p><Link href={`/matters/${record.matter.id}`}>{record.matter.matterNumber} · {record.matter.clientName} {record.matter.clientSurname}</Link></p></div><span>{record.serviceDate?.toLocaleDateString() ?? "Date not recorded"}</span></div>
              {record.outcome ? <p><strong>Outcome:</strong> {record.outcome}</p> : null}
              {record.details ? <p>{record.details}</p> : null}
              {latestTrace ? <p className="foundation-muted">Last trace attempt {latestTrace.attempt} · {latestTrace.attemptedAt.toLocaleDateString()} by {latestTrace.createdBy.name}: {latestTrace.note}</p> : <p className="foundation-muted">No tracing attempts recorded · {attemptCount}/{rules.maxTracingAttempts ?? "—"} attempts configured</p>}
              {canEdit ? <div className="todo-card-actions">
                <details><summary>Record outcome</summary><ActionForm action={updateServiceOutcome} className="foundation-form">
                  <input type="hidden" name="serviceId" value={record.id} />
                  <label className="foundation-field"><span>Status</span><select name="status" defaultValue={record.status}><option>Pending</option><option>Needs tracing</option><option>Served</option><option>Closed</option></select></label>
                  <label className="foundation-field"><span>Outcome (plain language)</span><input name="outcome" maxLength={500} defaultValue={record.outcome ?? ""} /></label>
                  <label className="foundation-field"><span>Service date</span><input name="serviceDate" type="date" defaultValue={record.serviceDate?.toISOString().slice(0, 10) ?? ""} /></label>
                  <SubmitButton>Save outcome</SubmitButton>
                </ActionForm></details>
                {record.status === "Needs tracing" ? <details><summary>{tracing.allowed ? "Add tracing attempt" : tracing.reason === "maximum-attempts" ? "Maximum tracing attempts reached" : `Next trace available ${tracing.nextAllowedAt?.toLocaleDateString() ?? ""}`}</summary>
                  {tracing.allowed ? <ActionForm action={addServiceTrace} className="foundation-form">
                    <input type="hidden" name="serviceId" value={record.id} />
                    <p className="foundation-muted">Attempt {attemptCount + 1} of {rules.maxTracingAttempts ?? "—"}; wait {rules.tracingAfterDays ?? "—"} days between attempts.</p>
                    <label className="foundation-field"><span>Tracing note</span><textarea name="note" maxLength={1000} required /></label>
                    <SubmitButton>Record trace attempt</SubmitButton>
                  </ActionForm> : null}
                </details> : null}
              </div> : null}
            </article>
          );
        })}
        {!records.length ? <section className="foundation-panel"><p>No service records match this search.</p></section> : null}
        {records.length === 500 ? <p className="foundation-muted">Showing the first 500 records. Narrow your search to find older entries.</p> : null}
      </div>
    </section>
  );
}
