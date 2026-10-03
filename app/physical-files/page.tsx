import Link from "next/link";
import { createPhysicalFile, updatePhysicalFile } from "@/app/actions/module-e";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

type Search = { q?: string; status?: string };

export default async function PhysicalFilesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = (["All", "InStorage", "OutOfStorage", "Closed"].includes(query.status ?? "") ? query.status ?? "All" : "All") as "All" | "InStorage" | "OutOfStorage" | "Closed";
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team" ? await getDb().supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true },
  }) : [];
  const responsibleIds = scope === "Firm" ? undefined : [user.id, ...reports.map((row) => row.userId)];
  const [matters, configuration] = await Promise.all([
    getDb().matter.findMany({
      where: { firmId: user.firmId, ...(responsibleIds ? { responsibleId: { in: responsibleIds } } : {}) },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true },
      orderBy: { matterNumber: "asc" }, take: 5000,
    }),
    getDb().setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true } }),
  ]);
  const matterIds = matters.map((matter) => matter.id);
  const [existing, files, borrowers] = await Promise.all([
    getDb().physicalFile.findMany({ where: { firmId: user.firmId, matterId: { in: matterIds } }, select: { matterId: true } }),
    matterIds.length ? getDb().physicalFile.findMany({
      where: {
        firmId: user.firmId, matterId: { in: matterIds },
        ...(status !== "All" ? { status } : {}),
        ...(q ? { OR: [
          { location: { contains: q, mode: "insensitive" } }, { folder: { contains: q, mode: "insensitive" } },
          { boxNumber: { contains: q, mode: "insensitive" } }, { storageCompany: { contains: q, mode: "insensitive" } },
          { barcodeReference: { contains: q, mode: "insensitive" } },
          { matter: { matterNumber: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
      select: {
        id: true, location: true, folder: true, status: true, checkedOutAt: true, boxNumber: true, dateSent: true, storageCompany: true, barcodeReference: true,
        borrower: { select: { name: true } }, matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } },
      },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 500,
    }) : [],
    getDb().user.findMany({
      where: { firmId: user.firmId, active: true, ...(responsibleIds ? { id: { in: responsibleIds } } : {}) },
      select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500,
    }),
  ]);
  const published = configuration?.published && typeof configuration.published === "object" ? configuration.published as Record<string, unknown> : {};
  const structure = published.filingStructure && typeof published.filingStructure === "object" ? published.filingStructure as { locations?: { name?: string }[]; folders?: string[] } : {};
  const locations = (structure.locations ?? []).filter((location): location is { name: string } => typeof location.name === "string");
  const folders = (structure.folders ?? []).filter((folder): folder is string => typeof folder === "string");
  const existingIds = new Set(existing.map((file) => file.matterId));
  const canEdit = hasPermission(user, "matters", "Edit");

  return (
    <section className="foundation-page">
      <FoundationHeader title="Physical files" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Track physical locations and check-outs without uploading or storing client documents. Closed files include external storage references.</p>
      {canEdit ? <section className="foundation-panel">
        <h2>Register a physical file</h2>
        {!locations.length || !folders.length ? <p className="foundation-error">Publish at least one filing location and folder in Setup Centre before registering files.</p> : <ActionForm action={createPhysicalFile} className="foundation-form">
          <label className="foundation-field"><span>Matter</span><select name="matterId" required defaultValue=""><option value="" disabled>Select a matter</option>{matters.filter((matter) => !existingIds.has(matter.id)).map((matter) => <option key={matter.id} value={matter.id}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</option>)}</select></label>
          <label className="foundation-field"><span>Filing location</span><select name="location" required defaultValue=""><option value="" disabled>Select location</option>{locations.map((location) => <option key={location.name}>{location.name}</option>)}</select></label>
          <label className="foundation-field"><span>Folder</span><select name="folder" required defaultValue=""><option value="" disabled>Select folder</option>{folders.map((folder) => <option key={folder}>{folder}</option>)}</select></label>
          <SubmitButton>Register physical file</SubmitButton>
        </ActionForm>}
      </section> : null}
      <form action="/physical-files" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search physical files</span><input name="q" maxLength={120} defaultValue={q} placeholder="Matter, location, folder, box or barcode" /></label>
        <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status}><option>All</option><option value="InStorage">In storage</option><option value="OutOfStorage">Out of storage</option><option value="Closed">Closed / external storage</option></select></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">
        {files.map((file) => <article className="todo-card" key={file.id}>
          <div className="todo-card-heading"><div><p className="eyebrow">{file.location} · {file.folder}</p><h2><Link href={`/matters/${file.matter.id}`}>{file.matter.matterNumber} · {file.matter.clientName} {file.matter.clientSurname}</Link></h2></div><span>{file.status === "InStorage" ? "In storage" : file.status === "OutOfStorage" ? "Out of storage" : "Closed / external storage"}</span></div>
          {file.status === "OutOfStorage" ? <p className="foundation-muted">Borrowed by {file.borrower?.name ?? "Unassigned"} · checked out {file.checkedOutAt?.toLocaleDateString()}</p> : null}
          {file.boxNumber || file.dateSent || file.storageCompany || file.barcodeReference ? <p className="foundation-muted">External storage record · Box {file.boxNumber ?? "not recorded"} · Sent {file.dateSent?.toLocaleDateString() ?? "date not recorded"} · {file.storageCompany ?? "storage company not recorded"} · Reference {file.barcodeReference ?? "not recorded"}</p> : null}
          {canEdit ? <details><summary>Update storage status</summary><ActionForm action={updatePhysicalFile} className="foundation-form">
            <input type="hidden" name="fileId" value={file.id} />
            <p className="foundation-muted">Closed files require all four external-storage reference fields below. Existing external-storage details are retained when checking the file out or in.</p>
            <label className="foundation-field"><span>Status</span><select name="status" defaultValue={file.status}><option value="InStorage">In storage / checked in</option><option value="OutOfStorage">Out of storage / check out</option><option value="Closed">Closed / external storage</option></select></label>
            <label className="foundation-field"><span>Borrower (when checked out)</span><select name="borrowerId" defaultValue={user.id}><option value="">Select borrower</option>{borrowers.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
            <label className="foundation-field"><span>Box number (closed files)</span><input name="boxNumber" maxLength={120} defaultValue={file.boxNumber ?? ""} /></label>
            <label className="foundation-field"><span>Date sent (closed files)</span><input name="dateSent" type="date" defaultValue={file.dateSent?.toISOString().slice(0, 10) ?? ""} /></label>
            <label className="foundation-field"><span>Storage company (closed files)</span><input name="storageCompany" maxLength={240} defaultValue={file.storageCompany ?? ""} /></label>
            <label className="foundation-field"><span>Barcode / reference (closed files)</span><input name="barcodeReference" maxLength={160} defaultValue={file.barcodeReference ?? ""} /></label>
            <SubmitButton>Save storage status</SubmitButton>
          </ActionForm></details> : null}
        </article>)}
        {!files.length ? <section className="foundation-panel"><p>No physical files match this search.</p></section> : null}
        {files.length === 500 ? <p className="foundation-muted">Showing the first 500 records. Narrow your search to find older entries.</p> : null}
      </div>
    </section>
  );
}
