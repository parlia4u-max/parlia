import Link from "next/link";
import { redirect } from "next/navigation";
import { logoutClient } from "@/app/actions/client-auth";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { ClientIntro } from "@/components/client-intro";
import { getFirmPortalContext } from "@/lib/firm-portal";
import { KIND_LABELS } from "@/lib/client-notify-rules";

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
  const attention = await getDb().clientNotification.findMany({
    where: { firmId: client.firmId, clientId: client.id, doneAt: null, matter: { firmId: client.firmId } },
    include: { matter: { select: { id: true, matterNumber: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const intro = client.introSeenAt ? null : (await getFirmPortalContext(client.firmId)).settings;
  return (
    <section className="foundation-page">
      <FoundationHeader title="Client portal" firm={client.firm.name} />
      <div className="attendance-report-heading">
        <p className="foundation-intro">Welcome, {client.name}. You can see only matters the firm explicitly connected to this account and updates the firm explicitly shared.</p>
        <Link className="button-secondary link-button" href="/client/how-it-works">How it works</Link>
        <Link className="button-secondary link-button" href="/client/how-it-works">How it works</Link>
        <form action={logoutClient}><button className="button-secondary" type="submit">Sign out</button></form>
      </div>
      {attention.length ? <section className="foundation-panel" aria-labelledby="attention-heading">
        <h2 id="attention-heading">Needs your attention <span className="tracker-tag">({attention.length})</span></h2>
        <ul className="todo-list">{attention.map((item) => (
          <li key={item.id}>
            <Link href={`/client/matters/${item.matter.id}`}><strong>{KIND_LABELS[item.kind]}</strong> - matter {item.matter.matterNumber}</Link>
            {item.message ? <p>{item.message}</p> : null}
            <small>{item.createdAt.toLocaleDateString()}</small>
          </li>
        ))}</ul>
      </section> : null}
      {intro ? <ClientIntro videoUrl={intro.introVideoUrl} /> : null}
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
