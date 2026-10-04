import { castEmployeeVote } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { hasPermission, permissionScope, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employeeVotePeriod } from "@/lib/team-rules";

export default async function TeamRecognitionPage() {
  const user = await requirePermission("people");
  const db = getDb();
  const scope = permissionScope(user, "people");
  const [reports, supervisors] = await Promise.all([
    scope === "Team"
      ? db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id }, select: { userId: true } })
      : Promise.resolve([]),
    scope !== "Firm"
      ? db.supervisorLink.findMany({ where: { firmId: user.firmId, userId: user.id }, select: { supervisorId: true } })
      : Promise.resolve([]),
  ]);
  const allowedIds = scope === "Firm" ? undefined : [...new Set([...reports.map((row) => row.userId), ...supervisors.map((row) => row.supervisorId)])];
  const [colleagues, existingVote] = await Promise.all([
    db.user.findMany({
      where: {
        firmId: user.firmId,
        active: true,
        isOwner: false,
        id: { not: user.id, ...(allowedIds ? { in: allowedIds } : {}) },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.teamEmployeeVote.findFirst({ where: { firmId: user.firmId, period: employeeVotePeriod(), voterId: user.id }, select: { id: true } }),
  ]);
  const canVote = hasPermission(user, "people", "Edit");
  let results: { id: string; name: string; count: number }[] = [];
  if (user.isOwner) {
    const aggregates = await db.teamEmployeeVote.groupBy({
      by: ["nomineeId"],
      where: { firmId: user.firmId, period: employeeVotePeriod() },
      _count: { _all: true },
    });
    const nominees = await db.user.findMany({
      where: { firmId: user.firmId, active: true, id: { in: aggregates.map((row) => row.nomineeId) } },
      select: { id: true, name: true },
    });
    results = aggregates.map((row) => ({
      id: row.nomineeId,
      name: nominees.find((nominee) => nominee.id === row.nomineeId)?.name ?? "Former staff member",
      count: row._count._all,
    })).sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }

  return (
    <section className="foundation-page">
      <FoundationHeader title="Employee of the month" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">One private vote per active account each month. Ballots and voter identities are never shown in the results; only the firm owner can view current-period totals.</p>
      <section className="foundation-panel">
        <h2>Vote for {employeeVotePeriod()}</h2>
        {existingVote ? <p className="foundation-notice">Your vote has been recorded. Your selection is private and cannot be changed this month.</p>
          : canVote && colleagues.length ? (
            <ActionForm action={castEmployeeVote} className="foundation-form">
              <label className="foundation-field"><span>Colleague</span><select name="nomineeId" required defaultValue=""><option value="" disabled>Choose a colleague</option>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <SubmitButton>Cast private vote</SubmitButton>
            </ActionForm>
          ) : !canVote ? <p className="foundation-muted">Your people permission allows viewing but not voting.</p>
            : <p className="foundation-muted">No eligible colleagues are available within your people scope.</p>}
      </section>
      {user.isOwner ? (
        <section className="foundation-panel">
          <h2>Owner-only results · {employeeVotePeriod()}</h2>
          {results.length ? (
            <ol className="team-vote-results">{results.map((result) => <li key={result.id}><strong>{result.name}</strong><span>{result.count} {result.count === 1 ? "vote" : "votes"}</span></li>)}</ol>
          ) : <p className="foundation-muted">No votes have been recorded for this period.</p>}
          <p className="foundation-muted">Only aggregate totals are displayed. Individual ballots and voter identities are not available here.</p>
        </section>
      ) : null}
    </section>
  );
}
