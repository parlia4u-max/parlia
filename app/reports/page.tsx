import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { emailQuietMatterDigest, saveQuietMatterThreshold } from "@/app/actions/reports";
import { requirePermission, hasPermission } from "@/lib/auth";
import { findQuietMatters } from "@/lib/report-data";
import { getDb } from "@/lib/db";

function dateLabel(date: Date) {
  return new Intl.DateTimeFormat("en-ZA", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
}

export default async function ReportsPage() {
  const user = await requirePermission("reports");
  const canViewMatters = hasPermission(user, "matters");
  const settings = await getDb().firmReportSettings.findUnique({ where: { firmId: user.firmId }, select: { quietMatterDays: true } });
  const threshold = settings?.quietMatterDays ?? 30;
  const report = canViewMatters
    ? await findQuietMatters(user, threshold)
    : { scope: null, matters: [] };

  return (
    <section className="foundation-page">
      <FoundationHeader title="Reports" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Quiet-matter reporting helps the firm review active files with no recorded meaningful activity. Reports show only matters your role is permitted to see and do not provide legal advice.</p>

      {user.isOwner ? <section className="foundation-panel">
        <h2>Quiet-matter threshold</h2>
        <p className="foundation-muted">Choose how many days without recorded matter activity should flag an active matter.</p>
        <ActionForm action={saveQuietMatterThreshold} className="foundation-inline-form">
          <label className="foundation-field"><span>Flag after (days)</span><input type="number" name="quietMatterDays" min={1} max={3650} step={1} required defaultValue={threshold} /></label>
          <SubmitButton>Save threshold</SubmitButton>
        </ActionForm>
      </section> : <section className="foundation-panel"><h2>Quiet-matter threshold</h2><p>Active matters are flagged after {threshold} days without recorded activity. Ask the firm owner to change this threshold.</p></section>}

      {!canViewMatters ? <section className="foundation-panel"><h2>Matter access is required</h2><p>Your role can view the reports area but does not have permission to view matters. Ask the firm owner to grant matter access if you need this report.</p></section> : <>
        <section className="foundation-panel">
          <div className="attendance-report-heading">
            <div>
              <h2>Quiet matters</h2>
              <p className="foundation-muted">Report scope: {user.isOwner ? "Firm" : report.scope}. {report.matters.length} active matter(s) have had no recorded activity for at least {threshold} days.</p>
            </div>
            <a className="button-secondary" href="/api/reports/quiet-matters/export">Export CSV</a>
          </div>
          <ActionForm action={emailQuietMatterDigest} className="foundation-form">
            <p className="foundation-muted">Email this scoped digest to your signed-in account address ({user.email}). This is an on-demand email, not an automatic scheduled digest.</p>
            <SubmitButton className="button-secondary">Email me this digest</SubmitButton>
          </ActionForm>
          <div className="foundation-table-wrap">
            <table className="foundation-table matter-table">
              <thead><tr><th>Matter</th><th>Client</th><th>Type / stage</th><th>Responsible</th><th>Last activity</th></tr></thead>
              <tbody>
                {report.matters.map((matter) => (
                  <tr key={matter.id}>
                    <td>{matter.matterNumber}</td>
                    <td>{matter.clientName} {matter.clientSurname}</td>
                    <td>{matter.matterType} / {matter.stage}</td>
                    <td>{matter.responsible.name}</td>
                    <td>{dateLabel(matter.lastActivityAt)}</td>
                  </tr>
                ))}
                {!report.matters.length ? <tr><td colSpan={5}>No active matters have crossed this quiet threshold.</td></tr> : null}
              </tbody>
            </table>
          </div>
          {report.matters.length >= 1000 ? <p className="foundation-muted">Showing the first 1,000 matters in this report scope.</p> : null}
        </section>
      </>}
    </section>
  );
}
