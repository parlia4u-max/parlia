import { notFound } from "next/navigation";
import { reviewClientDocumentReference } from "@/app/actions/client-portal";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function ClientReviewPage() {
  const user = await requirePermission("matters", "Edit");
  const db = getDb();
  const scope = permissionScope(user, "matters");
  const reports = !user.isOwner && scope === "Team" ? await db.supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } },
    select: { userId: true },
  }) : [];
  const responsibleFilter = user.isOwner || scope === "Firm"
    ? {}
    : scope === "Team"
      ? { matter: { responsibleId: { in: [user.id, ...reports.map((item) => item.userId)] } } }
      : { matter: { responsibleId: user.id } };
  const submissions = await db.clientDocumentReference.findMany({
    where: { firmId: user.firmId, status: "PendingReview", ...responsibleFilter },
    include: {
      matter: { select: { id: true, matterNumber: true, responsibleId: true } },
      client: { select: { name: true, email: true } },
    },
    orderBy: { submittedAt: "asc" },
    take: 500,
  });
  if (!user.isOwner && !["Own", "Team", "Firm"].includes(scope)) notFound();
  return (
    <section className="foundation-page">
      <FoundationHeader title="Client submissions" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Review secure document references submitted for matters in your permission scope. Parlia does not receive or store the document itself.</p>
      {submissions.length ? <div className="todo-list">{submissions.map((item) => (
        <article className="todo-card" key={item.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">Matter {item.matter.matterNumber} · {item.submittedAt.toLocaleString()}</p><h2>{item.label}</h2></div><span>Pending review</span></div>
          <p>Submitted by {item.client.name} ({item.client.email})</p>
          <p><a href={item.referenceUrl} target="_blank" rel="noopener noreferrer">Open secure document reference</a></p>
          <ActionForm action={reviewClientDocumentReference} className="foundation-form">
            <input type="hidden" name="matterId" value={item.matter.id} />
            <input type="hidden" name="referenceId" value={item.id} />
            <label className="foundation-field"><span>Note for the client (optional)</span><textarea name="reviewNote" maxLength={1000} /></label>
            <div className="work-actions">
              <button className="button-primary" type="submit" name="decision" value="Accepted">Accept reference</button>
              <button className="button-secondary" type="submit" name="decision" value="Rejected">Reject reference</button>
            </div>
          </ActionForm>
        </article>
      ))}</div> : <section className="foundation-panel"><h2>No pending submissions</h2><p>New client document references will appear here for matters you are allowed to edit.</p></section>}
      {submissions.length >= 500 ? <p className="foundation-muted">Showing the 500 oldest pending references. Review these before loading later items.</p> : null}
    </section>
  );
}
