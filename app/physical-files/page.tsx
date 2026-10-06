import Link from "next/link";
import { updatePhysicalFile } from "@/app/actions/module-e";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

type Search = { q?: string; tab?: string };
const FILE_TABS = ["open", "closed", "warehouse"] as const;

export default async function PhysicalFilesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 120) ?? "";
  const tab = FILE_TABS.includes(query.tab as (typeof FILE_TABS)[number]) ? query.tab as (typeof FILE_TABS)[number] : "open";
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team" ? await getDb().supervisorLink.findMany({
    where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true },
  }) : [];
  const responsibleIds = scope === "Firm" ? undefined : [user.id, ...reports.map((row) => row.userId)];
  const [files, employees] = await Promise.all([
    getDb().physicalFile.findMany({
      where: {
        firmId: user.firmId,
        ...(tab === "open" ? { fileStatus: "Open" } : { fileStatus: "Closed" }),
        ...(tab === "warehouse" ? { storageStatus: "Storage" } : {}),
        ...(responsibleIds ? { matter: { is: { responsibleId: { in: responsibleIds } } } } : {}),
        ...(q ? { OR: [
          { matter: { is: { matterNumber: { contains: q, mode: "insensitive" } } } },
          { matter: { is: { clientName: { contains: q, mode: "insensitive" } } } },
          { matter: { is: { clientSurname: { contains: q, mode: "insensitive" } } } },
          { cupboard: { contains: q, mode: "insensitive" } }, { shelfRow: { contains: q, mode: "insensitive" } },
          { shelfColumn: { contains: q, mode: "insensitive" } }, { boxNumber: { contains: q, mode: "insensitive" } },
          { barcodeReference: { contains: q, mode: "insensitive" } },
        ] } : {}),
      },
      select: {
        id: true, fileStatus: true, storageStatus: true, cupboard: true, shelfRow: true, shelfColumn: true,
        outOfFilingLocation: true, borrowerId: true, boxNumber: true, barcodeReference: true, dateSent: true,
        storageCompany: true,
        borrower: { select: { name: true } },
        matter: { select: { id: true, matterNumber: true, clientName: true, clientSurname: true } },
      },
      orderBy: { matter: { matterNumber: "asc" } }, take: 500,
    }),
    getDb().user.findMany({ where: { firmId: user.firmId, active: true, isOwner: false }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 1000 }),
  ]);
  const canEdit = hasPermission(user, "matters", "Edit");
  const tabHref = (name: (typeof FILE_TABS)[number]) => `/physical-files?tab=${name}`;
  const tabLabel = tab === "open" ? "Open Files" : tab === "closed" ? "Closed Files" : "In Warehouse";

  return (
    <section className="foundation-page physical-files-page">
      <FoundationHeader title="Physical Files" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Every matter has a physical-file record. Set its shelf location, track files outside filing, and manage closed storage references.</p>
      <nav className="physical-file-tabs" aria-label="Physical file registers">
        {FILE_TABS.map((name) => <Link key={name} aria-current={tab === name ? "page" : undefined} href={tabHref(name)}>{name === "open" ? "Open Files" : name === "closed" ? "Closed Files" : "In Warehouse"}</Link>)}
      </nav>
      <form action="/physical-files" className="foundation-inline-form matter-search">
        <input type="hidden" name="tab" value={tab} />
        <label className="foundation-field"><span>Search {tabLabel.toLowerCase()}</span><input name="q" maxLength={120} defaultValue={q} placeholder="Reference, client, location or storage number" /></label>
        <button className="button-primary" type="submit">Search</button>
        <a className="button-secondary physical-file-download" href={`/api/physical-files?tab=${tab}`}>Download CSV</a>
      </form>
      <div className="physical-file-table-scroll"><table className="foundation-table physical-file-table">
        <thead>{tab === "open" ? <tr><th>Reference number</th><th>Client</th><th>Cupboard</th><th>Row</th><th>Column</th><th>Out of filing</th><th>Status</th>{canEdit ? <th>Update</th> : null}</tr> : tab === "closed" ? <tr><th>Reference number</th><th>Client</th><th>Storage number</th><th>Status</th>{canEdit ? <th>Update</th> : null}</tr> : <tr><th>Reference number</th><th>Client</th><th>Storage number</th><th>Barcode number</th>{canEdit ? <th>Update</th> : null}</tr>}</thead>
        <tbody>{files.map((file) => {
          const outValue = file.borrowerId ? `employee:${file.borrowerId}` : file.outOfFilingLocation ?? "";
          const clientName = `${file.matter.clientName} ${file.matter.clientSurname}`;
          return <tr key={file.id}>
            <td><Link href={`/matters/${file.matter.id}`}>{file.matter.matterNumber}</Link></td><td>{clientName}</td>
            {tab === "open" ? <><td>{file.cupboard || "—"}</td><td>{file.shelfRow || "—"}</td><td>{file.shelfColumn || "—"}</td><td>{file.borrower?.name ?? file.outOfFilingLocation ?? "In filing"}</td><td>{file.fileStatus}</td></> : tab === "closed" ? <><td>{file.boxNumber || "—"}</td><td>{file.storageStatus === "Storage" ? "Storage" : "In office"}</td></> : <><td>{file.boxNumber || "—"}</td><td>{file.barcodeReference || "—"}</td></>}
            {canEdit ? <td><details className="physical-file-edit"><summary>Edit</summary><ActionForm action={updatePhysicalFile} className="physical-file-edit-form">
              <input type="hidden" name="fileId" value={file.id} />
              <label className="foundation-field"><span>Status</span><select name="fileStatus" defaultValue={file.fileStatus}><option value="Open">Open</option><option value="Closed">Closed</option></select></label>
              <label className="foundation-field"><span>Cupboard</span><input name="cupboard" maxLength={80} defaultValue={file.cupboard ?? ""} placeholder="e.g. Cabinet 1" /></label>
              <div className="physical-file-location-fields">
                <label className="foundation-field"><span>Row</span><input name="shelfRow" maxLength={40} defaultValue={file.shelfRow ?? ""} placeholder="e.g. 1" /></label>
                <label className="foundation-field"><span>Column</span><input name="shelfColumn" maxLength={40} defaultValue={file.shelfColumn ?? ""} placeholder="e.g. A" /></label>
              </div>
              <label className="foundation-field"><span>Out-of-filing location</span><select name="outOfFilingLocation" defaultValue={outValue}><option value="">In filing</option>{employees.map((employee) => <option key={employee.id} value={`employee:${employee.id}`}>{employee.name}</option>)}<option>Court shelf</option><option>Court</option><option>Out of office</option></select></label>
              <label className="foundation-field"><span>Closed-file status</span><select name="storageStatus" defaultValue={file.storageStatus}><option value="InOffice">In office</option><option value="Storage">Storage</option></select></label>
              <label className="foundation-field"><span>Storage number / box number</span><input name="boxNumber" maxLength={120} defaultValue={file.boxNumber ?? ""} /></label>
              <label className="foundation-field"><span>Warehouse barcode number</span><input name="barcodeReference" maxLength={160} defaultValue={file.barcodeReference ?? ""} /></label>
              <SubmitButton>Save file</SubmitButton>
            </ActionForm></details></td> : null}
          </tr>;
        })}{!files.length ? <tr><td colSpan={tab === "open" ? (canEdit ? 8 : 7) : canEdit ? 5 : 4}>No files match this search.</td></tr> : null}</tbody>
      </table></div>
      {files.length === 500 ? <p className="foundation-muted">Showing the first 500 records. Narrow your search to find older entries.</p> : null}
    </section>
  );
}
