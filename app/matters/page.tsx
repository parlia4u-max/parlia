import Link from "next/link";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { matterTypesFromConfig } from "@/lib/matter-config";

type MatterSearch = { q?: string; status?: string; type?: string };

export default async function MattersPage({ searchParams }: { searchParams: Promise<MatterSearch> }) {
  const user = await requirePermission("matters");
  const query = await searchParams;
  const db = getDb();
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team"
    ? await db.supervisorLink.findMany({
        where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } },
        select: { userId: true },
      })
    : [];
  const responsibleFilter = scope === "Firm" ? {} : { responsibleId: scope === "Team" ? { in: [user.id, ...reports.map((item) => item.userId)] } : user.id };
  const q = query.q?.trim().slice(0, 120) ?? "";
  const status = ["Active", "OnHold", "Closed"].includes(query.status ?? "") ? query.status as "Active" | "OnHold" | "Closed" : undefined;
  const matterType = query.type?.slice(0, 120) ?? "";
  const [matters, configuration] = await Promise.all([
    db.matter.findMany({
      where: {
        firmId: user.firmId,
        ...responsibleFilter,
        ...(status ? { status } : {}),
        ...(matterType ? { matterType } : {}),
        ...(q ? { OR: [
          { matterNumber: { contains: q, mode: "insensitive" } },
          { clientName: { contains: q, mode: "insensitive" } },
          { clientSurname: { contains: q, mode: "insensitive" } },
          { clientEmail: { contains: q, mode: "insensitive" } },
          { clientNumber: { contains: q, mode: "insensitive" } },
          { otherReferences: { contains: q, mode: "insensitive" } },
          { caseNumber: { contains: q, mode: "insensitive" } },
          { responsible: { name: { contains: q, mode: "insensitive" } } },
        ] } : {}),
      },
      select: {
        id: true,
        matterNumber: true,
        clientName: true,
        clientSurname: true,
        matterType: true,
        stage: true,
        status: true,
        lastActivityAt: true,
        responsible: { select: { name: true } },
      },
      orderBy: [{ status: "asc" }, { lastActivityAt: "desc" }],
      take: 500,
    }),
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } }),
  ]);
  const matterTypes = matterTypesFromConfig(configuration?.published);
  const canEdit = user.isOwner || user.role?.permissions.some((permission) => permission.module === "matters" && permission.level === "Edit");

  return (
    <section className="foundation-page">
      <FoundationHeader title="Matters" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Search the matters your role permits you to access. Matters are limited to this firm and the published matter type and stage configuration.</p>
      <div className="work-actions">
        {canEdit ? <Link className="button-primary link-button" href="/matters/new">Open a matter</Link> : null}
        {canEdit ? <Link className="button-secondary link-button" href="/matters/import">Import CSV</Link> : null}
        <Link className="button-secondary link-button" href="/matters/board">View stages board</Link>
      </div>
      <section className="foundation-panel">
        <form action="/matters" className="foundation-inline-form matter-search">
          <label className="foundation-field"><span>Search matters</span><input name="q" defaultValue={q} maxLength={120} placeholder="Number, client, reference, case or responsible person" /></label>
          <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option><option value="Active">Active</option><option value="OnHold">On hold</option><option value="Closed">Closed</option></select></label>
          <label className="foundation-field"><span>Matter type</span><select name="type" defaultValue={matterType}><option value="">All types</option>{matterTypes.map((type) => <option key={type.name}>{type.name}</option>)}</select></label>
          <button className="button-primary" type="submit">Search</button>
        </form>
        <div className="foundation-table-wrap">
          <table className="foundation-table matter-table">
            <thead><tr><th>Matter</th><th>Client</th><th>Type / stage</th><th>Responsible</th><th>Status</th><th>Last meaningful activity</th></tr></thead>
            <tbody>{matters.map((matter) => (
              <tr key={matter.id}>
                <td><Link href={`/matters/${matter.id}`}>{matter.matterNumber}</Link></td>
                <td>{matter.clientName} {matter.clientSurname}</td>
                <td>{matter.matterType}<small>{matter.stage}</small></td>
                <td>{matter.responsible.name}</td>
                <td>{matter.status === "OnHold" ? "On hold" : matter.status}</td>
                <td>{matter.lastActivityAt.toLocaleDateString()}</td>
              </tr>
            ))}</tbody>
          </table>
          {!matters.length ? <p className="foundation-muted">No matters match those filters.</p> : null}
          {matters.length === 500 ? <p className="foundation-muted">Showing the first 500 matching matters. Narrow your search for additional results.</p> : null}
        </div>
      </section>
    </section>
  );
}
