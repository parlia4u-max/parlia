import Link from "next/link";
import { FoundationHeader } from "@/components/foundation";
import { requirePermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { matterTypesFromConfig } from "@/lib/matter-config";

export default async function MatterBoardPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requirePermission("matters");
  const { q: rawQuery } = await searchParams;
  const q = rawQuery?.trim().slice(0, 120) ?? "";
  const db = getDb();
  const scope = permissionScope(user, "matters");
  const reports = scope === "Team"
    ? await db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
    : [];
  const responsibleFilter = scope === "Firm" ? {} : { responsibleId: scope === "Team" ? { in: [user.id, ...reports.map((report) => report.userId)] } : user.id };
  const [matters, configuration] = await Promise.all([
    db.matter.findMany({
      where: {
        firmId: user.firmId,
        ...responsibleFilter,
        status: { not: "Closed" },
        ...(q ? { OR: [
          { matterNumber: { contains: q, mode: "insensitive" } },
          { clientName: { contains: q, mode: "insensitive" } },
          { clientSurname: { contains: q, mode: "insensitive" } },
        ] } : {}),
      },
      select: { id: true, matterNumber: true, clientName: true, clientSurname: true, matterType: true, stage: true, stageKind: true, status: true, responsible: { select: { name: true } } },
      orderBy: [{ matterType: "asc" }, { stage: "asc" }, { matterNumber: "asc" }],
      take: 1000,
    }),
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } }),
  ]);
  const types = matterTypesFromConfig(configuration?.published);
  const configuredStages = new Set(types.flatMap((type) => type.stages.map((stage) => `${type.name}\u0000${stage.name}`)));
  const unmappedMatters = matters.filter((matter) => !configuredStages.has(`${matter.matterType}\u0000${matter.stage}`));

  return (
    <section className="foundation-page">
      <FoundationHeader title="Matter stages board" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Active matters grouped by their firm-configured stages. On-hold matters remain visible with their status; closed matters are available in the matter list.</p>
      <div className="work-actions"><Link className="button-secondary link-button" href="/matters">Matter list</Link></div>
      <form action="/matters/board" className="foundation-inline-form matter-search">
        <label className="foundation-field"><span>Search board</span><input name="q" defaultValue={q} placeholder="Matter number or client name" maxLength={120} /></label>
        <button className="button-primary" type="submit">Search</button>
      </form>
      {types.map((type) => {
        const typeMatters = matters.filter((matter) => matter.matterType === type.name);
        return (
          <section className="board-type" key={type.name}>
            <h2>{type.name}</h2>
            <div className="stage-board">
              {type.stages.map((stage) => {
                const cards = typeMatters.filter((matter) => matter.stage === stage.name);
                return (
                  <section className="stage-column" key={stage.name}>
                    <header><h3>{stage.name}</h3><span>{stage.kind} · {cards.length}</span></header>
                    {cards.map((matter) => (
                      <Link className="matter-board-card" href={`/matters/${matter.id}`} key={matter.id}>
                        <strong>{matter.matterNumber}</strong>
                        <span>{matter.clientName} {matter.clientSurname}</span>
                        <small>{matter.responsible.name}</small>
                        {matter.status === "OnHold" ? <em>On hold</em> : null}
                      </Link>
                    ))}
                    {!cards.length ? <p className="foundation-muted">No matters in this stage.</p> : null}
                  </section>
                );
              })}
              {unmappedMatters.length ? (
                <section className="foundation-panel">
                  <h2>Open matters outside the current stage setup</h2>
                  <p className="foundation-muted">These records use matter types or stages no longer present in the published configuration.</p>
                  <ul className="matter-reference-list">{unmappedMatters.map((matter) => <li key={matter.id}><Link href={`/matters/${matter.id}`}>{matter.matterNumber} · {matter.clientName} {matter.clientSurname}</Link> · {matter.matterType} / {matter.stage}</li>)}</ul>
                </section>
              ) : null}
            </div>
          </section>
        );
      })}
      {!matters.length ? <section className="foundation-panel"><p>No open matters match this search.</p></section> : null}
      {matters.length === 1000 ? <p className="foundation-muted">The board shows up to 1,000 open matters. Narrow the search for more.</p> : null}
    </section>
  );
}
