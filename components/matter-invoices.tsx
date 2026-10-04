import { ActionForm, SubmitButton } from "@/components/action-form";
import { createInvoiceDraft, deleteInvoiceDraft, issueCreditNote, publishInvoice } from "@/app/actions/invoices";
import { formatRand, statusLabel } from "@/lib/money";

export type StaffInvoice = {
  id: string; number: string; issueDate: Date; amountCents: number; status: string; documentUrl: string;
  publishedAt: Date | null; creditNoteForId: string | null; credited: boolean; proofStatus: string | null;
};

export function MatterInvoices({ matterId, invoices }: { matterId: string; invoices: StaffInvoice[] }) {
  return (
    <section className="foundation-panel">
      <h2>Invoices</h2>
      <p className="foundation-muted">Drafts are visible to staff only. Once published, an invoice is locked: correct it with a credit note and a new invoice. An invoice becomes Paid only when Accounts confirms the client's proof of payment.</p>
      <details>
        <summary>More - add an invoice</summary>
        <ActionForm action={createInvoiceDraft} className="foundation-form">
          <input type="hidden" name="matterId" value={matterId} />
          <label className="foundation-field"><span>Invoice number</span><input name="number" maxLength={60} required /></label>
          <label className="foundation-field"><span>Invoice date</span><input name="issueDate" type="date" required /></label>
          <label className="foundation-field"><span>Amount (rand)</span><input name="amount" inputMode="decimal" required /></label>
          <label className="foundation-field"><span>Status</span><select name="status" defaultValue="Unpaid"><option value="Unpaid">Unpaid</option><option value="PartPaid">Part paid</option><option value="Paid">Paid</option></select></label>
          <label className="foundation-field"><span>Invoice PDF link (firm's own storage)</span><input name="documentUrl" type="url" maxLength={2048} placeholder="https://..." required /></label>
          <SubmitButton>Save as draft</SubmitButton>
        </ActionForm>
      </details>
      {invoices.map((invoice) => (
        <article className="todo-card" key={invoice.id}>
          <p><strong>{invoice.creditNoteForId ? "Credit note" : "Invoice"} {invoice.number}</strong> - {formatRand(invoice.amountCents)} - {invoice.issueDate.toLocaleDateString()}</p>
          <p>{invoice.publishedAt ? "Published (locked)" : "Draft (staff only)"} - {statusLabel(invoice.status)}{invoice.credited ? " - credited" : ""}{invoice.proofStatus === "Submitted" ? " - payment submitted, awaiting confirmation" : ""}</p>
          <p><a href={invoice.documentUrl} target="_blank" rel="noopener noreferrer">Open PDF</a></p>
          <div className="work-actions">
            {!invoice.publishedAt ? <>
              <ActionForm action={publishInvoice}><input type="hidden" name="matterId" value={matterId} /><input type="hidden" name="invoiceId" value={invoice.id} /><SubmitButton>Publish</SubmitButton></ActionForm>
              <ActionForm action={deleteInvoiceDraft}><input type="hidden" name="matterId" value={matterId} /><input type="hidden" name="invoiceId" value={invoice.id} /><SubmitButton className="button-secondary">Delete draft</SubmitButton></ActionForm>
            </> : null}
          </div>
          {invoice.publishedAt && !invoice.creditNoteForId && !invoice.credited ? <details>
            <summary>More - issue a credit note</summary>
            <ActionForm action={issueCreditNote} className="foundation-form">
              <input type="hidden" name="matterId" value={matterId} />
              <input type="hidden" name="invoiceId" value={invoice.id} />
              <label className="foundation-field"><span>Credit note number</span><input name="number" maxLength={60} required /></label>
              <label className="foundation-field"><span>Credit note PDF link</span><input name="documentUrl" type="url" maxLength={2048} placeholder="https://..." required /></label>
              <SubmitButton className="button-secondary">Issue credit note</SubmitButton>
            </ActionForm>
          </details> : null}
        </article>
      ))}
      {!invoices.length ? <p>No invoices on this matter yet.</p> : null}
    </section>
  );
}