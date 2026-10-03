import { FoundationHeader } from "@/components/foundation";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function AuditLogPage() {
  const owner = await requireOwner();
  const entries = await getDb().auditLog.findMany({
    where: { firmId: owner.firmId },
    include: { actor: { select: { name: true, email: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <section className="foundation-page">
      <FoundationHeader title="Audit log" firm={owner.firm.name} isOwner />
      <p className="foundation-intro">Recent account, invitation, role, permission, supervisor and session activity. Showing the latest 200 records for this firm.</p>
      <section className="foundation-panel">
        {entries.length ? (
          <div className="foundation-table-wrap">
            <table className="foundation-table">
              <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td><time dateTime={entry.createdAt.toISOString()}>{entry.createdAt.toLocaleString()}</time></td>
                    <td>{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : "System"}</td>
                    <td>{entry.action}</td>
                    <td>{entry.entityType}{entry.entityId ? ` · ${entry.entityId}` : ""}</td>
                    <td>{entry.details ? JSON.stringify(entry.details) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p>No audit activity recorded yet.</p>}
      </section>
    </section>
  );
}
