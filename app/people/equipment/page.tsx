import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { assignEquipment, createEquipment, returnEquipment } from "@/app/actions/hr";
import { getHrPageUser } from "@/lib/hr-data";
import { getDb } from "@/lib/db";
import { hasPermission, permissionScope } from "@/lib/auth";

export default async function EquipmentPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await getHrPageUser();
  if (!user.isOwner && (!hasPermission(user, "people", "Edit") || permissionScope(user, "people") === "Own")) notFound();
  const { q: rawQuery } = await searchParams;
  const q = rawQuery?.trim().slice(0, 120) ?? "";
  let scopeIds: string[] | undefined;
  if (!user.isOwner && permissionScope(user, "people") === "Team") {
    const reports = await getDb().supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { active: true } }, select: { userId: true } });
    scopeIds = [user.id, ...reports.map((item) => item.userId)];
  }
  const [staff, assets] = await Promise.all([
    getDb().user.findMany({ where: { firmId: user.firmId, active: true, ...(scopeIds ? { id: { in: scopeIds } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
    getDb().equipmentAsset.findMany({
      where: {
        firmId: user.firmId,
        ...(scopeIds ? { OR: [
          { assignedToId: { in: scopeIds } },
          { assignedToId: null, assignments: { some: { firmId: user.firmId, userId: { in: scopeIds } } } },
        ] } : {}),
        ...(q ? { AND: [{ OR: [
          { name: { contains: q, mode: "insensitive" } },
          { serialNumber: { contains: q, mode: "insensitive" } },
          { assignedTo: { is: { name: { contains: q, mode: "insensitive" } } } },
        ] }] } : {}),
      },
      include: { assignedTo: { select: { id: true, name: true } }, assignments: { include: { user: { select: { name: true } }, assignedBy: { select: { name: true } } }, orderBy: { assignedAt: "desc" }, take: 30 } },
      orderBy: [{ updatedAt: "desc" }], take: 300,
    }),
  ]);
  return (
    <section className="foundation-page">
      <FoundationHeader title="Equipment register" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Firm-scoped equipment, serial numbers, condition reports and assignment/return history. Only the owner and authorized staff managers may update this register; assignee declaration must match the staff member’s full name.</p>
      <section className="foundation-panel">
        <h2>Register and assign equipment</h2>
        <ActionForm action={createEquipment} className="foundation-form">
          <div className="setup-field-grid">
            <label className="foundation-field"><span>Equipment</span><input name="name" maxLength={120} required /></label>
            <label className="foundation-field"><span>Serial number</span><input name="serialNumber" maxLength={120} required /></label>
            <label className="foundation-field"><span>Assign to</span><select name="assignedToId" required defaultValue=""><option value="" disabled>Choose staff member</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          </div>
          <label className="foundation-field"><span>Condition report</span><textarea name="condition" maxLength={1000} required /></label>
          <label className="foundation-field"><span>Signed declaration — assignee’s full name</span><input name="signedDeclaration" maxLength={2000} required /></label>
          <SubmitButton>Save and issue equipment</SubmitButton>
        </ActionForm>
      </section>
      <form action="/people/equipment" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search equipment</span><input name="q" defaultValue={q} maxLength={120} placeholder="Name, serial number or assignee" /></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      <div className="todo-list">{assets.length ? assets.map((asset) => <article className="todo-card" key={asset.id}>
        <div className="todo-card-heading"><div><p className="eyebrow">{asset.returnedAt ? "Returned" : "Assigned"} · Serial {asset.serialNumber}</p><h2>{asset.name}</h2></div><span>{asset.assignedTo?.name ?? "Available"}</span></div>
        <p>{asset.condition}</p>
        <p className="foundation-muted">Assigned {asset.assignedAt?.toLocaleDateString() ?? "—"}{asset.returnedAt ? ` · Returned ${asset.returnedAt.toLocaleDateString()}` : ""}</p>
        {!asset.returnedAt && asset.assignedTo ? <ActionForm action={returnEquipment} className="foundation-form">
          <input type="hidden" name="assetId" value={asset.id} />
          <label className="foundation-field"><span>Return condition report</span><textarea name="returnCondition" maxLength={1000} required /></label>
          <SubmitButton className="button-secondary">Record equipment return</SubmitButton>
        </ActionForm> : null}
        {asset.returnedAt ? <ActionForm action={assignEquipment} className="foundation-form">
          <input type="hidden" name="assetId" value={asset.id} />
          <label className="foundation-field"><span>Reassign to</span><select name="assignedToId" required defaultValue=""><option value="" disabled>Choose staff member</option>{staff.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
          <label className="foundation-field"><span>Condition at issue</span><textarea name="condition" maxLength={1000} required /></label>
          <label className="foundation-field"><span>Signed declaration — assignee’s full name</span><input name="signedDeclaration" maxLength={2000} required /></label>
          <SubmitButton className="button-secondary">Reassign equipment</SubmitButton>
        </ActionForm> : null}
        <details><summary>More · assignment history</summary>
          <p>Last declaration: {asset.signedDeclaration}</p>
          {asset.assignments.map((assignment) => <p className="foundation-muted" key={assignment.id}>{assignment.user.name} · {assignment.assignedAt.toLocaleString()} · issued by {assignment.assignedBy.name} · {assignment.returnedAt ? `returned ${assignment.returnedAt.toLocaleString()} (${assignment.returnCondition})` : "current assignment"} · declaration: {assignment.signedDeclaration}</p>)}
        </details>
      </article>) : <section className="foundation-panel"><h2>No equipment records</h2><p>{q ? "Try another search." : "Register an item above to start tracking assignments."}</p></section>}</div>
    </section>
  );
}
