import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { saveNextOfKin, setOnboardingDeadline, toggleOnboardingItem, uploadHRDocument, requestDocumentResubmission } from "@/app/actions/hr";
import { getHrProfile, getHrPageUser, canReadHrTarget } from "@/lib/hr-data";
import { getDb } from "@/lib/db";
import { hasPermission, permissionScope } from "@/lib/auth";
import { decryptSensitive } from "@/lib/sensitive-data";

function nextOfKin(profile: { nextOfKinCiphertext: string | null; nextOfKinIv: string | null; nextOfKinTag: string | null }) {
  if (!profile.nextOfKinCiphertext || !profile.nextOfKinIv || !profile.nextOfKinTag) return null;
  try {
    return JSON.parse(decryptSensitive(profile.nextOfKinCiphertext, profile.nextOfKinIv, profile.nextOfKinTag)) as { name: string; relationship: string; phone: string };
  } catch {
    return null;
  }
}

function documentMetadata(document: { encryptedMetadata: string; metadataIv: string; metadataAuthTag: string }) {
  try {
    const value = JSON.parse(decryptSensitive(document.encryptedMetadata, document.metadataIv, document.metadataAuthTag)) as { documentType: string; fileName: string; size: number };
    return { title: `${value.fileName} · ${Math.ceil(value.size / 1024)} KB`, documentType: value.documentType };
  } catch {
    return { title: "Encrypted metadata unavailable; confirm SENSITIVE_DATA_ENCRYPTION_KEY configuration.", documentType: "Encrypted document" };
  }
}

export async function HrProfile({ targetId, showDirectory = false, query = "" }: { targetId: string; showDirectory?: boolean; query?: string }) {
  const result = await getHrProfile(targetId);
  const { user, target, profile, documents, checklist } = result;
  const canEditNextOfKin = user.id === target.id || user.isOwner;
  const canManage = user.isOwner || user.id === target.id || hasPermission(user, "people", "Edit") && await canReadHrTarget(user, target.id);
  const kin = canEditNextOfKin ? nextOfKin(profile) : null;
  const dueDate = profile.onboardingDueAt?.toISOString().slice(0, 10) ?? "";
  const employmentStartDate = profile.employmentStartDate?.toISOString().slice(0, 10) ?? "";
  let team: { id: string; name: string; email: string }[] = [];
  if (showDirectory) {
    let ids: string[] | undefined;
    if (!user.isOwner && permissionScope(user, "people") === "Team") {
      const links = await getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } });
      ids = [user.id, ...links.map((link) => link.userId)];
    } else if (!user.isOwner && permissionScope(user, "people") !== "Firm") ids = [user.id];
    team = await getDb().user.findMany({
      where: { firmId: user.firmId, active: true, ...(ids ? { id: { in: ids } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }] } : {}) },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
      take: 300,
    });
  }

  return (
    <section className="foundation-page">
      <FoundationHeader title="Staff profile and HR documents" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">{target.name} · {target.email}. Next-of-kin details are encrypted and visible only to the profile owner and firm owner. HR documents are encrypted in Postgres and available only through private, authorized downloads.</p>
      {showDirectory ? <>
        <form action="/people/hr" className="foundation-inline-form matter-search">
          <label className="foundation-field"><span>Search staff records</span><input name="q" maxLength={120} defaultValue={query} placeholder="Name or email" /></label>
          <button className="button-primary" type="submit">Search</button>
        </form>
        <div className="todo-list">{team.map((person) => <article className="todo-card" key={person.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">Staff profile</p><h2>{person.name}</h2></div><Link href={`/people/hr/${person.id}`}>Open HR record</Link></div>
          <p>{person.email}</p>
        </article>)}</div>
      </> : <p><Link href="/people/hr">Back to staff directory and your record</Link></p>}

      <section className="foundation-panel">
        <h2>Next of kin</h2>
        {canEditNextOfKin ? <ActionForm action={saveNextOfKin} className="foundation-form">
          <input type="hidden" name="targetId" value={target.id} />
          <label className="foundation-field"><span>Full name</span><input name="nextOfKinName" defaultValue={kin?.name ?? ""} maxLength={160} required /></label>
          <div className="setup-field-grid">
            <label className="foundation-field"><span>Relationship</span><input name="nextOfKinRelationship" defaultValue={kin?.relationship ?? ""} maxLength={80} required /></label>
            <label className="foundation-field"><span>Phone</span><input name="nextOfKinPhone" defaultValue={kin?.phone ?? ""} maxLength={80} required /></label>
          </div>
          <SubmitButton>Save encrypted next-of-kin details</SubmitButton>
          {!kin && profile.nextOfKinCiphertext ? <p className="foundation-muted">Saved details could not be decrypted. Check the configured encryption key; saving again will replace them.</p> : null}
        </ActionForm> : <p className="foundation-muted">Only the profile owner and firm owner may view or change these encrypted fields.</p>}
      </section>

      <section className="foundation-panel">
        <h2>Onboarding checklist</h2>
        {user.isOwner ? <ActionForm action={setOnboardingDeadline} className="foundation-inline-form">
          <input type="hidden" name="targetId" value={target.id} />
          <label className="foundation-field"><span>Owner-set onboarding due date</span><input name="dueAt" type="date" defaultValue={dueDate} /></label>
          <label className="foundation-field"><span>Owner-set employment start date (leave cycle anchor)</span><input name="employmentStartDate" type="date" defaultValue={employmentStartDate} /></label>
          <SubmitButton>Save dates</SubmitButton>
        </ActionForm> : <p className="foundation-muted">Due date: {profile.onboardingDueAt?.toLocaleDateString() ?? "Not set by owner"} · Leave cycle anchor: {profile.employmentStartDate?.toLocaleDateString() ?? "Account creation until owner sets a start date"}</p>}
        {checklist.length ? <div className="todo-list">{checklist.map((item) => <article className="todo-card" key={item.id}>
          <p className="eyebrow">{item.required ? "Required" : "Optional"} · {item.completed ? "Complete" : "Outstanding"}</p>
          <h3>{item.name}</h3>
          <ActionForm action={toggleOnboardingItem} className="foundation-form">
            <input type="hidden" name="itemId" value={item.id} />
            <input type="hidden" name="completed" value={item.completed ? "no" : "yes"} />
            <SubmitButton className="button-secondary">{item.completed ? "Reopen item" : "Mark complete"}</SubmitButton>
          </ActionForm>
        </article>)}</div> : <p className="foundation-muted">No onboarding checklist items are configured in published Setup.</p>}
      </section>

      <section className="foundation-panel">
        <h2>Encrypted HR documents</h2>
        <p className="foundation-muted">PDF, PNG and JPEG only; 5 MB maximum. File content and original filename are encrypted before storage. After submission a document stays locked unless the firm owner requests resubmission.</p>
        {canManage ? <ActionForm action={uploadHRDocument} className="foundation-form">
          <input type="hidden" name="targetId" value={target.id} />
          <div className="setup-field-grid">
            <label className="foundation-field"><span>Document type</span><select name="documentType" defaultValue="Bank confirmation">
              <option>Bank confirmation</option><option>Identity document</option><option>Signed contract</option><option value="Custom">Custom type</option>
            </select></label>
            <label className="foundation-field"><span>Custom type name (when selected)</span><input name="customDocumentType" maxLength={80} /></label>
          </div>
          <label className="foundation-field"><span>File</span><input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required /></label>
          <SubmitButton>Encrypt and submit document</SubmitButton>
        </ActionForm> : null}
        {canManage && documents.length ? <div className="todo-list">{documents.map((document) => <article className="todo-card" key={document.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">{documentMetadata(document).documentType} · {document.locked ? "Locked" : "Editable"}</p><h3>{documentMetadata(document).title}</h3></div><span>{document.submittedAt.toLocaleDateString()}</span></div>
          <p className="foundation-muted">{document.resubmissionRequested ? "Owner requested resubmission; replacement is allowed." : "No replacement requested."}</p>
          <div className="action-button-row"><Link className="button-secondary" href={`/api/hr-documents/${document.id}/download`}>Private download</Link>
            {user.isOwner && !document.resubmissionRequested ? <ActionForm action={requestDocumentResubmission} className="foundation-form">
              <input type="hidden" name="documentId" value={document.id} /><SubmitButton className="button-secondary">Request resubmission</SubmitButton>
            </ActionForm> : null}
          </div>
        </article>)}</div> : canManage ? <p className="foundation-muted">No submitted HR documents.</p> : <p className="foundation-muted">Only the profile owner, firm owner or authorized people manager can access HR documents.</p>}
      </section>
    </section>
  );
}
