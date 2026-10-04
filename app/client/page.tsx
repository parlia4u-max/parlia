import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutClient } from "@/app/actions/client-auth";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { ClientIntro } from "@/components/client-intro";
import { getFirmPortalContext } from "@/lib/firm-portal";

export default async function ClientPortalPage() {
  const client = await getCurrentClient();
  if (!client) redirect("/client/login");
  const matters = await getDb().clientMatterAccess.findMany({
    where: { firmId: client.firmId, clientId: client.id, revokedAt: null, matter: { firmId: client.firmId } },
    include: {
      matter: {
        select: {
          id: true, matterNumber: true, matterType: true, stage: true, status: true,
          responsible: { select: { name: true } },
          clientPortalUpdates: { where: { firmId: client.firmId, sharedAt: { not: null } }, select: { id: true }, take: 1 },
          clientDocumentReferences: { where: { firmId: client.firmId, clientId: client.id, status: "PendingReview" }, select: { id: true } },
        },
      },
    },
    orderBy: { grantedAt: "desc" },
  });
  return (
    <section className="foundation-page">
      <FoundationHeader title="Client portal" firm={client.firm.name} />
      <div className="attendance-report-heading">
        <p className="foundation-intro">Welcome, {client.name}. You can see only matters the firm explicitly connected to this account and updates the firm explicitly shared.</p>
        <Link className="button-secondary link-button" href="/client/how-it-works">How it works</Link>
        <form action={logoutClient}><button className="button-secondary" type="submit">Sign out</button></form>
      </div>
      <section className="foundation-panel">
        <h2>Your matters</h2>
        {matters.length ? <div className="todo-list">{matters.map(({ matter }) => (
          <article className="todo-card" key={matter.id}>
            <div className="todo-card-heading"><div><p className="eyebrow">{matter.matterType} · {matter.status}</p><h3>{matter.matterNumber}</h3></div><span>{matter.stage}</span></div>
            <p>Responsible person: {matter.responsible.name}</p>
            <p className="foundation-muted">{matter.clientPortalUpdates.length ? "The firm has shared updates" : "No shared updates yet"} · {matter.clientDocumentReferences.length} submission(s) awaiting review</p>
            <Link className="button-secondary link-button" href={`/client/matters/${matter.id}`}>View matter</Link>
          </article>
        ))}</div> : <p>No matters are connected to this client account yet. Contact the firm if you expected access.</p>}
        <p className="foundation-muted">Parlia stores document links for review, not client document files. Keep document content in your firm’s approved document system.</p>
      </section>
    </section>
  );
}
