import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decryptSensitive } from "@/lib/sensitive-data";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { createVaultEntry, revealVaultEntry } from "@/app/actions/hr";

export default async function PasswordVaultPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireOwner();
  const { q: rawQuery } = await searchParams;
  const q = rawQuery?.trim().slice(0, 120).toLocaleLowerCase() ?? "";
  const entries = await getDb().passwordVaultEntry.findMany({
    where: { firmId: user.firmId },
    select: { id: true, encryptedMetadata: true, metadataIv: true, metadataAuthTag: true, createdAt: true },
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const labels = entries.map((entry) => {
    try {
      const data = JSON.parse(decryptSensitive(entry.encryptedMetadata, entry.metadataIv, entry.metadataAuthTag)) as { label: string; username: string };
      return { ...entry, label: data.label, username: data.username, available: true };
    } catch {
      return { ...entry, label: "Encrypted vault item", username: "", available: false };
    }
  }).filter((entry) => !q || entry.label.toLocaleLowerCase().includes(q) || entry.username.toLocaleLowerCase().includes(q));
  return (
    <section className="foundation-page">
      <FoundationHeader title="Owner password vault" firm={user.firm.name} isOwner />
      <p className="foundation-intro">Only the firm owner can access this vault. Entries are encrypted at rest using SENSITIVE_DATA_ENCRYPTION_KEY. Reveals are individually audited; secrets are shown only in the successful reveal response and never included in logs or audit details.</p>
      <section className="foundation-panel">
        <h2>Save a vault entry</h2>
        <ActionForm action={createVaultEntry} className="foundation-form">
          <label className="foundation-field"><span>Service / entry name</span><input name="label" maxLength={160} required /></label>
          <label className="foundation-field"><span>Username (optional)</span><input name="username" maxLength={160} /></label>
          <label className="foundation-field"><span>Secret</span><input name="secret" type="password" maxLength={4096} required autoComplete="new-password" /></label>
          <label className="foundation-field"><span>Notes (optional)</span><textarea name="notes" maxLength={500} /></label>
          <SubmitButton>Encrypt and save</SubmitButton>
        </ActionForm>
      </section>
      <form action="/people/password-vault" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search vault metadata</span><input name="q" defaultValue={q} maxLength={120} /></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">{labels.length ? labels.map((entry) => <article className="todo-card" key={entry.id}>
        <div className="todo-card-heading"><div><p className="eyebrow">Encrypted · {entry.createdAt.toLocaleDateString()}</p><h2>{entry.label}</h2></div><span>{entry.username || "No username"}</span></div>
        {entry.available ? <ActionForm action={revealVaultEntry} className="foundation-form">
          <input type="hidden" name="entryId" value={entry.id} />
          <SubmitButton className="button-secondary">Audited reveal</SubmitButton>
        </ActionForm> : <p className="foundation-error">Unable to decrypt this item. Check the encryption key configured for this deployment.</p>}
        <details><summary>More</summary><p>Created {entry.createdAt.toLocaleString()} · ID {entry.id}</p></details>
      </article>) : <section className="foundation-panel"><h2>No vault entries found</h2><p>{q ? "Try another search." : "Save an entry above."}</p></section>}</div>
    </section>
  );
}
