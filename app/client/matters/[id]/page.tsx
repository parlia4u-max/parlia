import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { submitClientDocumentReference } from "@/app/actions/client-portal";
import { logoutClient } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { KIND_LABELS, VIEW_ONLY_KINDS } from "@/lib/client-notify-rules";
import { ClientTracker } from "@/components/client-tracker";
import { ClientInvoices } from "@/components/client-invoices";
import { ClientBooking } from "@/components/client-booking";
import { availabilityFromConfig } from "@/lib/availability";
import { availableSlotsForMatter } from "@/app/actions/client-booking";
import { clientStepsForType, computeTracker } from "@/lib/client-tracker";
import { portalSettingsFromConfig } from "@/lib/portal-settings";

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
          clientPortalUpdates: { where: { firmId: client.firmId, sharedAt: { not: null } }, orderBy: { sharedAt: "desc" }, take: 100, include: { createdBy: { select: { name: true } } } },
          matterDocuments: { where: { firmId: client.firmId, sharedWithClient: true }, orderBy: { sharedAt: "desc" }, take: 100, select: { id: true, label: true, sharedAt: true } },
          invoices: { where: { firmId: client.firmId, publishedAt: { not: null } }, orderBy: { issueDate: "desc" }, take: 200, include: { proofs: { where: { clientId: client.id }, orderBy: { submittedAt: "desc" }, take: 1 } } },
          clientDocumentReferences: { where: { firmId: client.firmId, clientId: client.id }, orderBy: { submittedAt: "desc" }, take: 100 },
        },
      },
    },
  });
  if (!access || access.matter.firmId !== client.firmId) notFound();
  const matter = access.matter;
  const openItems = await getDb().clientNotification.findMany({ where: { firmId: client.firmId, clientId: client.id, matterId: matter.id, doneAt: null }, orderBy: { createdAt: "desc" }, take: 50 });
  const now = new Date();
  await getDb().clientNotification.updateMany({ where: { firmId: client.firmId, clientId: client.id, matterId: matter.id, readAt: null }, data: { readAt: now } });
  await getDb().clientNotification.updateMany({ where: { firmId: client.firmId, clientId: client.id, matterId: matter.id, doneAt: null, kind: { in: [...VIEW_ONLY_KINDS] } }, data: { doneAt: now } });
  const setup = await getDb().setupConfiguration.findUnique({ where: { firmId: client.firmId }, select: { published: true } });
  const availability = availabilityFromConfig(setup?.published);
  const slots = availability.enabled ? (await availableSlotsForMatter(matter.id)).map((slot) => slot.toISOString()) : [];
  const upcoming = await getDb().calendarEvent.findMany({ where: { firmId: client.firmId, matterId: matter.id, audience: "Client", startAt: { gte: now } }, orderBy: { startAt: "asc" }, take: 10, select: { id: true, title: true, startAt: true, meetingUrl: true, bookedByClientId: true } });
  const published = setup?.published && typeof setup.published === "object" ? setup.published as Record<string, unknown> : {};
  const type = (Array.isArray(published.matterTypes) ? published.matterTypes : []).find((item) => item && typeof item === "object" && (item as Record<string, unknown>).name === matter.matterType);
  const typeStages = Array.isArray((type as Record<string, unknown> | undefined)?.stages) ? (type as { stages: { name: string; kind: string }[] }).stages : [];
  const tracker = computeTracker({
    steps: clientStepsForType(type, typeStages),
    currentStage: matter.stage,
    override: matter.clientStepOverride,
    estimates: matter.clientStepEstimates,
    showEstimates: portalSettingsFromConfig(setup?.published).estimatedDatesEnabled,
  });
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
      {openItems.length ? <section className="foundation-panel"><h2>Needs your attention</h2><ul>{openItems.map((item) => (
        <li key={item.id}><strong>{KIND_LABELS[item.kind]}</strong>{item.message ? `: ${item.message}` : ""}</li>
      ))}</ul></section> : null}
      {tracker ? <ClientTracker steps={tracker} updates={matter.clientPortalUpdates.map((update) => ({ id: update.id, title: update.title, body: update.body, sharedAt: update.sharedAt, author: update.createdBy.name }))} /> : null}
      <section className="foundation-panel">
        <h2>Shared updates</h2>
        {matter.clientPortalUpdates.length ? <div className="matter-timeline">{matter.clientPortalUpdates.map((update) => (
          <article key={update.id}><h3>{update.title}</h3><p>{update.body}</p><small>{update.sharedAt?.toLocaleString()}</small></article>
        ))}</div> : <p>The firm has not shared an update on this matter yet.</p>}
      </section>
      <section className="foundation-panel">
        <h2>Documents for you</h2>
        {matter.matterDocuments.length ? <ul className="todo-list">{matter.matterDocuments.map((doc) => (
          <li key={doc.id}><a href={`/client/documents/${doc.id}`} target="_blank" rel="noopener noreferrer">{doc.label} (opens in a new tab)</a> <small>Shared {doc.sharedAt?.toLocaleDateString()}</small></li>
        ))}</ul> : <p>The firm has not shared any documents with you yet.</p>}
        <p className="foundation-muted">Each time you open a document, the firm records it.</p>
      </section>
      <ClientBooking matterId={matter.id} enabled={availability.enabled} slots={slots} meetings={upcoming.map((item) => ({ id: item.id, title: item.title, startAt: item.startAt, meetingUrl: item.meetingUrl, cancellable: item.bookedByClientId === client.id && item.startAt.getTime() - now.getTime() >= availability.noticeHours * 3_600_000 }))} />
      <ClientInvoices
        maxMb={portalSettingsFromConfig(setup?.published).maxUploadMb}
        types={portalSettingsFromConfig(setup?.published).allowedUploadTypes}
        invoices={matter.invoices.map((invoice) => ({
          id: invoice.id, number: invoice.number, issueDate: invoice.issueDate, amountCents: invoice.amountCents, status: invoice.status, documentUrl: invoice.documentUrl,
          creditNoteForId: invoice.creditNoteForId, credited: matter.invoices.some((other) => other.creditNoteForId === invoice.id),
          pending: invoice.proofs[0]?.status === "Submitted", rejectReason: invoice.proofs[0]?.status === "Rejected" ? invoice.proofs[0].rejectReason : null,
        }))}
      />
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
