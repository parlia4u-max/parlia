import { submitTeamSuggestion, updateTeamSuggestionStatus } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { hasPermission, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";

type Search = { q?: string; status?: string };

export default async function TeamSuggestionsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePermission("people");
  const db = getDb();
  const query = await searchParams;
  const q = query.q?.trim().slice(0, 100) ?? "";
  const status = ["Open", "Under review", "Implemented", "Declined"].includes(query.status ?? "") ? query.status : undefined;
  const canSubmit = hasPermission(user, "people", "Edit");
  const suggestions = user.isOwner ? await db.teamSuggestion.findMany({
    where: {
      firmId: user.firmId,
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ body: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }] } : {}),
    },
    select: { id: true, category: true, body: true, anonymous: true, status: true, createdAt: true, submitter: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  }) : [];

  return (
    <section className="foundation-page">
      <FoundationHeader title="Team suggestions" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Share practical ideas for improving how the firm works. Anonymous suggestions do not store a submitter identity, and their audit record has no actor identity or suggestion text.</p>
      {canSubmit ? (
        <section className="foundation-panel">
          <h2>Share a suggestion</h2>
          <ActionForm action={submitTeamSuggestion} className="foundation-form">
            <label className="foundation-field"><span>Category</span><select name="category" required defaultValue="Process"><option>Process</option><option>Tools</option><option>Wellbeing</option><option>Other</option></select></label>
            <label className="foundation-field"><span>Your suggestion</span><textarea name="body" required maxLength={4000} rows={5} /></label>
            <label className="team-checkbox"><input type="checkbox" name="anonymous" /> Submit anonymously</label>
            <SubmitButton>Submit suggestion</SubmitButton>
          </ActionForm>
        </section>
      ) : <p className="foundation-muted">Your people permission allows viewing but not submitting suggestions.</p>}
      {user.isOwner ? (
        <section className="team-suggestions">
          <h2>Owner inbox</h2>
          <form action="/team/suggestions" className="foundation-inline-form">
            <label className="foundation-field"><span>Search suggestion text/category</span><input name="q" defaultValue={q} maxLength={100} /></label>
            <label className="foundation-field"><span>Status</span><select name="status" defaultValue={status ?? ""}><option value="">All statuses</option><option>Open</option><option>Under review</option><option>Implemented</option><option>Declined</option></select></label>
            <button className="button-secondary" type="submit">Filter</button>
          </form>
          <p className="foundation-muted">{suggestions.length} matching suggestion(s).</p>
          {suggestions.map((suggestion) => (
            <article className="foundation-panel" key={suggestion.id}>
              <div className="team-message-meta"><strong>{suggestion.category}</strong><time>{suggestion.createdAt.toLocaleString()}</time></div>
              <p>{suggestion.body}</p>
              <p className="foundation-muted">{suggestion.anonymous ? "Anonymous" : `Submitted by ${suggestion.submitter?.name ?? "Former staff member"}`}</p>
              <ActionForm action={updateTeamSuggestionStatus} className="foundation-inline-form">
                <input type="hidden" name="suggestionId" value={suggestion.id} />
                <label className="foundation-field"><span>Status</span><select name="status" defaultValue={suggestion.status}><option>Open</option><option>Under review</option><option>Implemented</option><option>Declined</option></select></label>
                <SubmitButton className="button-secondary">Save status</SubmitButton>
              </ActionForm>
            </article>
          ))}
          {!suggestions.length ? <section className="foundation-panel"><p>No suggestions have been submitted.</p></section> : null}
          {suggestions.length === 300 ? <p className="foundation-muted">Showing the latest 300 suggestions.</p> : null}
        </section>
      ) : null}
    </section>
  );
}
