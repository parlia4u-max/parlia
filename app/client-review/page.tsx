import Link from "next/link";
import { notFound } from "next/navigation";
import { requestClientDocument, reviewClientDocumentReference } from "@/app/actions/client-portal";
import { reviewPaymentProof } from "@/app/actions/invoices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatRand } from "@/lib/money";

type Search = { q?: string; client?: string; view?: string };

export default async function ClientReviewPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const canReviewDocuments = hasPermission(user, "matters", "Edit");
  const canReviewPayments = hasPermission(user, "accounts", "Edit");
  if (!canReviewDocuments && !canReviewPayments) notFound();
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 80) ?? "";
  const view = query.view === "payments" && canReviewPayments ? "payments" : "documents";
  const db = getDb();
  const scope = permissionScope(user, "matters");
  const reports = canReviewDocuments && !user.isOwner && scope === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const responsibleIds = canReviewDocuments && !user.isOwner && scope !== "Firm"
    ? scope === "Team" ? [user.id, ...reports.map((item) => item.userId)] : [user.id]
    : undefined;
  const matters = await db.matter.findMany({
    where: {
      firmId: user.firmId,
      ...(responsibleIds ? { responsibleId: { in: responsibleIds } } : {}),
      ...(q ? { matterNumber: { contains: q, mode: "insensitive" } } : {}),
    },
    select: { id: true, matterNumber: true },
    orderBy: { matterNumber: "asc" },
    take: 5000,
  });
  const matterIds = matters.map((matter) => matter.id);
  const accessRows = matterIds.length ? await db.clientMatterAccess.findMany({
    where: { firmId: user.firmId, matterId: { in: matterIds }, revokedAt: null, client: { active: true } },
    select: { matterId: true, client: { select: { id: true, name: true, email: true } } },
  }) : [];
  const clientMap = new Map<string, { id: string; name: string; email: string; matterIds: string[] }>();
  for (const access of accessRows) {
    const client = clientMap.get(access.client.id) ?? { ...access.client, matterIds: [] };
    if (!client.matterIds.includes(access.matterId)) client.matterIds.push(access.matterId);
    clientMap.set(access.client.id, client);
  }
  const clients = [...clientMap.values()].sort((left, right) => left.name.localeCompare(right.name));
  const clientIds = clients.map((client) => client.id);
  const [submissions, proofs] = clientIds.length ? await Promise.all([
    canReviewDocuments ? db.clientDocumentReference.findMany({
      where: { firmId: user.firmId, clientId: { in: clientIds }, matterId: { in: matterIds }, status: "PendingReview" },
      include: { matter: { select: { id: true, matterNumber: true } }, client: { select: { id: true, name: true, email: true } } },
      orderBy: { submittedAt: "asc" }, take: 500,
    }) : Promise.resolve([]),
    canReviewPayments ? db.paymentProof.findMany({
      where: { firmId: user.firmId, clientId: { in: clientIds }, status: "Submitted", invoice: { is: { matterId: { in: matterIds } } } },
      include: { invoice: { include: { matter: { select: { id: true, matterNumber: true } } } }, client: { select: { id: true, name: true, email: true } } },
      orderBy: { submittedAt: "asc" }, take: 500,
    }) : Promise.resolve([]),
  ]) : [[], []];
  const selectedClient = clients.find((client) => client.id === query.client) ?? clients[0] ?? null;
  const clientSubmissions = selectedClient ? submissions.filter((item) => item.clientId === selectedClient.id) : [];
  const clientProofs = selectedClient ? proofs.filter((proof) => proof.clientId === selectedClient.id) : [];
  const clientTabHref = (clientId: string) => `/client-review?client=${encodeURIComponent(clientId)}&view=${view}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const viewHref = (nextView: "documents" | "payments") => `/client-review?client=${encodeURIComponent(selectedClient?.id ?? "")}&view=${nextView}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <section className="foundation-page client-submissions-page">
      <FoundationHeader title="Client submissions" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Review document references and proof of payments by client. Parlia does not receive or store the documents themselves.</p>
      <form action="/client-review" className="foundation-inline-form matter-search client-submission-search">
        <input type="hidden" name="view" value={view} />
        <label className="foundation-field"><span>Search matter reference</span><input name="q" maxLength={80} defaultValue={q} placeholder="Enter a matter number" /></label>
        <button className="button-primary" type="submit">Search</button>
        {q ? <Link className="button-secondary" href={`/client-review?view=${view}`}>Clear</Link> : null}
      </form>
      <nav className="client-submission-client-tabs" aria-label="Clients">
        {clients.map((client) => {
          const count = submissions.filter((item) => item.clientId === client.id).length + proofs.filter((proof) => proof.clientId === client.id).length;
          return <Link key={client.id} aria-current={selectedClient?.id === client.id ? "page" : undefined} href={clientTabHref(client.id)}>{client.name}<span aria-label={`${count} pending items`}>{count}</span></Link>;
        })}
      </nav>
      {selectedClient ? <>
        <div className="client-submission-heading"><div><h2>{selectedClient.name}</h2><p>{selectedClient.email}</p></div><span>{selectedClient.matterIds.length} matter{selectedClient.matterIds.length === 1 ? "" : "s"}</span></div>
        <nav className="client-submission-kind-tabs" aria-label="Submission type">
          {canReviewDocuments ? <Link aria-current={view === "documents" ? "page" : undefined} href={viewHref("documents")}>Documents <span>{clientSubmissions.length}</span></Link> : null}
          {canReviewPayments ? <Link aria-current={view === "payments" ? "page" : undefined} href={viewHref("payments")}>Proof of payments <span>{clientProofs.length}</span></Link> : null}
        </nav>
        {view === "documents" ? <>
          {clientSubmissions.length ? <div className="todo-list">{clientSubmissions.map((item) => <article className="todo-card" key={item.id}>
            <div className="todo-card-heading"><div><p className="eyebrow">Matter {item.matter.matterNumber} · {item.submittedAt.toLocaleString()}</p><h2>{item.label}</h2></div><span>Pending review</span></div>
            <p>Submitted by {item.client.name} ({item.client.email})</p>
            <p><a href={item.referenceUrl} target="_blank" rel="noopener noreferrer">Open secure document reference</a></p>
            <ActionForm action={reviewClientDocumentReference} className="foundation-form">
              <input type="hidden" name="matterId" value={item.matter.id} /><input type="hidden" name="referenceId" value={item.id} />
              <label className="foundation-field"><span>Note for the client (up to 1,000 characters)</span><textarea name="reviewNote" maxLength={1000} /></label>
              <div className="work-actions"><button className="button-primary" type="submit" name="decision" value="Accepted">Accept reference</button><button className="button-secondary" type="submit" name="decision" value="Rejected">Reject reference</button></div>
            </ActionForm>
          </article>)}</div> : <section className="foundation-panel"><h2>No pending document submissions</h2><p>New references from {selectedClient.name} will appear here.</p></section>}
          {canReviewDocuments && selectedClient.matterIds.length ? <details className="client-request-panel"><summary>Request information from this client</summary>
            <ActionForm action={requestClientDocument} className="foundation-form">
              <label className="foundation-field"><span>Matter</span><select name="matterId" required>{matters.filter((matter) => selectedClient.matterIds.includes(matter.id)).map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber}</option>)}</select></label>
              <label className="foundation-field"><span>Request (up to 300 characters)</span><textarea name="message" maxLength={300} required /></label>
              <SubmitButton>Send request</SubmitButton>
            </ActionForm>
          </details> : null}
        </> : clientProofs.length ? <div className="todo-list">{clientProofs.map((proof) => <article className="todo-card" key={proof.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">Matter {proof.invoice.matter.matterNumber} · submitted {proof.submittedAt.toLocaleString()}</p><h2>Invoice {proof.invoice.number} · {formatRand(proof.invoice.amountCents)}</h2></div><span>Pending review</span></div>
          {proof.note ? <p>Client note: {proof.note}</p> : null}<p><a href={proof.referenceUrl} target="_blank" rel="noopener noreferrer">Open proof of payment</a> · <a href={proof.invoice.documentUrl} target="_blank" rel="noopener noreferrer">Open invoice</a></p>
          <ActionForm action={reviewPaymentProof} className="foundation-form"><input type="hidden" name="proofId" value={proof.id} />
            <label className="foundation-field"><span>If confirming, the invoice is</span><select name="paid" defaultValue="full"><option value="full">Paid in full</option><option value="part">Part paid</option></select></label>
            <label className="foundation-field"><span>Reason (required only when rejecting)</span><input name="reason" maxLength={300} /></label>
            <div className="work-actions"><button className="button-primary" name="decision" value="Confirm" type="submit">Confirm payment</button><button className="button-secondary" name="decision" value="Reject" type="submit">Reject with reason</button></div>
          </ActionForm>
        </article>)}</div> : <section className="foundation-panel"><h2>No proof of payments waiting</h2><p>Payment references from {selectedClient.name} will appear here.</p></section>}
      </> : <section className="foundation-panel"><h2>No clients found</h2><p>{q ? "Try another matter reference." : "Clients connected to matters in your access scope will appear here."}</p></section>}
      {submissions.length >= 500 || proofs.length >= 500 ? <p className="foundation-muted">Showing up to 500 pending items per review type.</p> : null}
    </section>
  );
}