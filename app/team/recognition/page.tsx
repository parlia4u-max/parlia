import Link from "next/link";
import { castEmployeeVote } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employeeVoteDeadline, employeeVotePeriod } from "@/lib/team-rules";

export default async function TeamRecognitionPage() {
  const user = await requireUser();
  const db = getDb();
  const period = employeeVotePeriod();
  const [colleagues, settings, existingVote, publications] = await Promise.all([
    db.user.findMany({
      where: { firmId: user.firmId, active: true, isOwner: false, id: { not: user.id } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.teamRecognitionSettings.findUnique({ where: { firmId: user.firmId } }),
    db.teamEmployeeVote.findUnique({ where: { firmId_period_voterId: { firmId: user.firmId, period, voterId: user.id } }, select: { nomineeId: true, nomineeName: true, reason: true, anonymous: true } }),
    db.teamRecognitionPublication.findMany({ where: { firmId: user.firmId }, orderBy: { period: "desc" }, take: 12 }),
  ]);
  const externalNominees = Array.isArray(settings?.externalNominees) ? settings.externalNominees.filter((name): name is string => typeof name === "string") : [];
  const deadline = employeeVoteDeadline(period, settings?.dueDay ?? 25, settings?.dueTime ?? "17:00");
  const published = publications.find((publication) => publication.period === period);
  const canEditVote = new Date() < deadline && !published;
  const existingChoice = existingVote?.nomineeId ?? (existingVote ? `external:${existingVote.nomineeName}` : "");

  return (
    <section className="foundation-page">
      <FoundationHeader title="Employee of the month" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Vote for a colleague or owner-added nominee. Your ballot is private, and you may change it until the monthly deadline.</p>
      <section className="foundation-panel">
        <div className="team-meeting-heading"><div><p className="eyebrow">{period}</p><h2>Cast your vote</h2></div><span>Due {deadline.toLocaleString()}</span></div>
        {published ? <p className="foundation-notice">The result has been published: {published.winnerName}.</p>
          : canEditVote && (colleagues.length || externalNominees.length) ? (
            <ActionForm action={castEmployeeVote} className="foundation-form">
              <label className="foundation-field"><span>Team member</span><select name="nominee" required defaultValue={existingChoice}><option value="" disabled>Choose a team member</option>{colleagues.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}{externalNominees.map((name) => <option key={name} value={`external:${name}`}>{name}</option>)}</select></label>
              <label className="foundation-field"><span>Why are you nominating them? (optional)</span><textarea name="reason" maxLength={500} rows={3} defaultValue={existingVote?.reason ?? ""} /></label>
              <label className="team-checkbox"><input type="checkbox" name="anonymous" defaultChecked={existingVote?.anonymous ?? false} /> Keep my ballot anonymous</label>
              <SubmitButton>{existingVote ? "Update my vote" : "Submit my vote"}</SubmitButton>
            </ActionForm>
          ) : existingVote && !published ? <p className="foundation-notice">Your ballot is saved. Voting closed at {deadline.toLocaleString()}.</p>
            : <p className="foundation-muted">Voting is closed or no nominees are available. Ask the owner to configure nominees for a future month.</p>}
      </section>
      {publications.length ? (
        <section className="foundation-panel">
          <h2>Previous winners</h2>
          <ol className="team-vote-results">{publications.map((publication) => <li key={publication.id}><strong>{publication.period}</strong><span>{publication.winnerName}</span></li>)}</ol>
        </section>
      ) : null}
      {user.isOwner ? <p><Link href="/settings/employee-recognition">Manage recognition settings and certificates</Link></p> : null}
    </section>
  );
}
