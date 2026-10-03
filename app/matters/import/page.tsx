import Link from "next/link";
import { importMatters } from "@/app/actions/matters";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission } from "@/lib/auth";

export default async function ImportMattersPage() {
  const user = await requirePermission("matters", "Edit");
  return (
    <section className="foundation-page">
      <FoundationHeader title="Import matters from CSV" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Rows are validated against this firm’s published matter types and active staff. Valid rows are saved independently; rejected rows show their CSV row number and reason. Documents are never uploaded by this import.</p>
      <section className="foundation-panel">
        <h2>CSV columns</h2>
        <p>Use a UTF-8 CSV with the following header names. Required values are matterNumber, clientName, clientSurname, matterType, stage and responsibleEmail. Email and reference columns may be left blank.</p>
        <code className="csv-header">matterNumber,clientName,clientSurname,clientEmail,matterType,stage,responsibleEmail,clientNumber,otherReferences,caseNumber</code>
        <ul className="foundation-muted">
          <li>Maximum file size: 2 MB.</li>
          <li>Maximum 1,000 matter rows per import.</li>
          <li>Responsible email must belong to an active person in your permitted assignment scope.</li>
          <li>Matter numbers must be unique within this firm. Existing records are never overwritten.</li>
        </ul>
        <ActionForm action={importMatters} className="foundation-form">
          <label className="foundation-field"><span>CSV file</span><input type="file" name="file" accept=".csv,text/csv" required /></label>
          <SubmitButton>Validate and import</SubmitButton>
        </ActionForm>
      </section>
      <p className="setup-back-link"><Link href="/matters">Back to matters</Link></p>
    </section>
  );
}
