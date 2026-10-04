import { ActionForm, SubmitButton } from "@/components/action-form";
import { submitProofOfPayment } from "@/app/actions/invoices";
import { formatRand, statusLabel } from "@/lib/money";

export type ClientInvoice = {
  id: string; number: string; issueDate: Date; amountCents: number; status: string; documentUrl: string;
  creditNoteForId: string | null; credited: boolean; pending: boolean; rejectReason: string | null;
};

export function ClientInvoices({ invoices, maxMb, types }: { invoices: ClientInvoice[]; maxMb: number; types: string[] }) {
  return (
    <section className="foundation-panel">
      <h2>Invoices</h2>
      {invoices.map((invoice) => (
        <article className="todo-card" key={invoice.id}>
          <p><strong>{invoice.creditNoteForId ? "Credit note" : "Invoice"} {invoice.number}</strong> - {formatRand(invoice.amountCents)} - {invoice.issueDate.toLocaleDateString()}</p>
          <p>Status: {invoice.pending ? "Payment submitted, awaiting confirmation" : statusLabel(invoice.status)}{invoice.credited ? " (cancelled by a credit note)" : ""}</p>
          <p><a href={invoice.documentUrl} target="_blank" rel="noopener noreferrer">Open invoice PDF (opens in a new tab)</a></p>
          {invoice.rejectReason && !invoice.pending && invoice.status !== "Paid" ? <p className="foundation-notice">The firm could not confirm your last payment: {invoice.rejectReason} Please send it again.</p> : null}
          {!invoice.creditNoteForId && !invoice.credited && invoice.status !== "Paid" && !invoice.pending ? <details>
            <summary>Submit proof of payment</summary>
            <ActionForm action={submitProofOfPayment} className="foundation-form">
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <label className="foundation-field"><span>Secure link to your proof of payment ({types.join(", ")}, up to {maxMb} MB)</span><input name="referenceUrl" type="url" maxLength={2048} placeholder="https://..." required /></label>
              <label className="foundation-field"><span>Note (optional)</span><input name="note" maxLength={300} /></label>
              <SubmitButton>Send proof of payment</SubmitButton>
            </ActionForm>
          </details> : null}
        </article>
      ))}
      {!invoices.length ? <p>There are no invoices on this matter yet.</p> : null}
    </section>
  );
}