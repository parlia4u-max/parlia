import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitClientDocumentReference } from "@/app/actions/client-portal";
import { logoutClient } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";

export default async function ClientMatterPage({ params }: { params: Promise<{ id: string }> }) {
  const client = await getCurrentClient();
  if (!client) redirect("/client/login");
  const { id } = await params;
  const access = await getDb().clientMatterAccess.findFirst({
    where: { firmId: client.firmId, clientId: client.id, matterId: id, revokedAt: null },
    include: {
      matter: {
        include: {
          responsible: { select: { name: true } },
          clientPortalUpdates: { where: { firmId: client.firmId, sharedAt: { not: null } }, orderBy: { sharedAt: "desc" }, take: 100 },
          clientDocumentReferences: { where: { firmId: client.firmId, clientId: client.id }, orderBy: { submittedAt: "desc" }, take: 100 },
        },
      },
    },
  });
  if (!access || access.matter.firmId !== client.firmId) notFound();
  const matter = access.matter;
  return (
    <section className="foundation-page">
      <FoundationHeader title={matter.matterNumber} firm={client.firm.name} />
      <div className="work-actions">
        <Link className="button-secondary link-button" href="/client">All my matters</Link>
        <form action={logoutClient}><button className="button-secondary" type="submit">Sign out</button></form>
      </div>
      <section className="foundation-panel">
        <p className="eyebrow">{matter.matterType} · {matter.status}</p>
        <h2>{matter.stage}</h2>
        <p>Responsible person: {matter.responsible.name}</p>
        <p className="foundation-muted">This view contains only information the firm chose to share with you.</p>
      </section>
      <section className="foundation-panel">
        <h2>Shared updates</h2>
        {matter.clientPortalUpdates.length ? <div className="matter-timeline">{matter.clientPortalUpdates.map((update) => (
          <article key={update.id}><h3>{update.title}</h3><p>{update.body}</p><small>{update.sharedAt?.toLocaleString()}</small></article>
        ))}</div> : <p>The firm has not shared an update on this matter yet.</p>}
      </section>
      <section className="foundation-panel">
        <h2>Submit a document reference for review</h2>
        <p className="foundation-muted">Do not upload a file here. Add a secure HTTPS link to the file in the firm’s approved document system. The firm will review the reference; Parlia stores the link and status only.</p>
        <ActionForm action={submitClientDocumentReference} className="foundation-form">
          <input type="hidden" name="matterId" value={matter.id} />
          <label className="foundation-field"><span>Document label</span><input name="label" maxLength={160} required /></label>
          <label className="foundation-field"><span>Secure document link</span><input name="referenceUrl" type="url" maxLength={2048} placeholder="https://..." required /></label>
          <SubmitButton>Submit link for review</SubmitButton>
        </ActionForm>
        <div className="foundation-table-wrap">
          <table className="foundation-table">
            <thead><tr><th>Reference</th><th>Status</th><th>Submitted</th><th>Firm note</th></tr></thead>
            <tbody>{matter.clientDocumentReferences.map((item) => (
              <tr key={item.id}>
                <td><a href={item.referenceUrl} target="_blank" rel="noopener noreferrer">{item.label} (opens secure link)</a></td>
                <td>{item.status === "PendingReview" ? "Pending review" : item.status}</td>
                <td>{item.submittedAt.toLocaleDateString()}</td>
                <td>{item.reviewNote ?? "—"}</td>
              </tr>
            ))}
            {!matter.clientDocumentReferences.length ? <tr><td colSpan={4}>No document references submitted.</td></tr> : null}</tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
