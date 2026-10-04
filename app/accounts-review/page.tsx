import { reviewPaymentProof } from "@/app/actions/invoices";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatRand } from "@/lib/money";

export default async function AccountsReviewPage() {
  const user = await requirePermission("accounts", "Edit");
  const proofs = await getDb().paymentProof.findMany({
    where: { firmId: user.firmId, status: "Submitted" },
    include: { invoice: { include: { matter: { select: { matterNumber: true } } } }, client: { select: { name: true } } },
    orderBy: { submittedAt: "asc" },
    take: 200,
  });
  return (
    <section className="foundation-page">
      <FoundationHeader title="Payment reviews" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Check each proof of payment against your bank. An invoice becomes Paid only when you confirm it here.</p>
      {proofs.map((proof) => (
        <article className="todo-card" key={proof.id}>
          <p className="eyebrow">Matter {proof.invoice.matter.matterNumber} - submitted {proof.submittedAt.toLocaleString()} by {proof.client.name}</p>
          <h2>Invoice {proof.invoice.number} - {formatRand(proof.invoice.amountCents)}</h2>
          {proof.note ? <p>Client note: {proof.note}</p> : null}
          <p><a href={proof.referenceUrl} target="_blank" rel="noopener noreferrer">Open proof of payment</a> - <a href={proof.invoice.documentUrl} target="_blank" rel="noopener noreferrer">Open invoice</a></p>
          <ActionForm action={reviewPaymentProof} className="foundation-form">
            <input type="hidden" name="proofId" value={proof.id} />
            <label className="foundation-field"><span>If confirming, the invoice is</span><select name="paid" defaultValue="full"><option value="full">Paid in full</option><option value="part">Part paid</option></select></label>
            <label className="foundation-field"><span>Reason (required only when rejecting)</span><input name="reason" maxLength={300} /></label>
            <div className="work-actions">
              <button name="decision" value="Confirm" type="submit">Confirm payment</button>
              <button className="button-secondary" name="decision" value="Reject" type="submit">Reject with reason</button>
            </div>
          </ActionForm>
        </article>
      ))}
      {!proofs.length ? <p>Nothing is waiting for review.</p> : null}
    </section>
  );
}