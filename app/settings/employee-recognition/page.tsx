import Link from "next/link";
import { notFound } from "next/navigation";
import { publishEmployeeOfMonth, saveRecognitionSettings } from "@/app/actions/team";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CertificatePrintButton } from "@/components/certificate-print-button";
import { FoundationHeader } from "@/components/foundation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { employeeVoteDeadline, employeeVotePeriod } from "@/lib/team-rules";

const CERTIFICATE_LAYOUTS = ["classic", "modern", "formal"] as const;

export default async function EmployeeRecognitionSettingsPage() {
  const user = await getCurrentUser();
  if (!user) notFound();
  const db = getDb();
  const period = employeeVotePeriod();
  const settings = await db.teamRecognitionSettings.findUnique({ where: { firmId: user.firmId } });
  const isDelegate = settings?.delegateId === user.id;
  if (!user.isOwner && !isDelegate) notFound();
  const [employees, votes, publications, configuration, owner] = await Promise.all([
    db.user.findMany({ where: { firmId: user.firmId, active: true, isOwner: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    user.isOwner ? db.teamEmployeeVote.findMany({ where: { firmId: user.firmId, period }, select: { nomineeName: true, reason: true, anonymous: true, voter: { select: { name: true } } }, orderBy: { createdAt: "asc" } }) : Promise.resolve([]),
    db.teamRecognitionPublication.findMany({ where: { firmId: user.firmId }, orderBy: { period: "desc" }, take: 24 }),
    db.setupConfiguration.findUnique({ where: { firmId: user.firmId }, select: { published: true } }),
    db.user.findFirst({ where: { firmId: user.firmId, isOwner: true, active: true }, select: { name: true } }),
  ]);
  const dueDay = settings?.dueDay ?? 25;
  const dueTime = settings?.dueTime ?? "17:00";
  const deadline = employeeVoteDeadline(period, dueDay, dueTime);
  const externalNominees = Array.isArray(settings?.externalNominees) ? settings.externalNominees.filter((name): name is string => typeof name === "string") : [];
  const profile = configuration?.published && typeof configuration.published === "object" && (configuration.published as Record<string, unknown>).firmProfile
    ? (configuration.published as { firmProfile: Record<string, unknown> }).firmProfile
    : {};
  const logoUrl = typeof profile.logoUrl === "string" ? profile.logoUrl : "";
  const brandColour = typeof profile.brandColour === "string" && /^#[0-9a-f]{6}$/i.test(profile.brandColour) ? profile.brandColour : "#b8913f";
  const certificateLayout = CERTIFICATE_LAYOUTS.includes(settings?.certificateLayout as (typeof CERTIFICATE_LAYOUTS)[number]) ? settings!.certificateLayout : "modern";
  const publishedThisPeriod = publications.find((publication) => publication.period === period);

  return (
    <section className="foundation-page recognition-settings-page">
      <FoundationHeader title="Employee recognition settings" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Set the monthly voting deadline, choose a coordinator, manage additional nominees, and publish the winning certificate.</p>
      <section className="foundation-panel">
        <h2>Monthly vote settings</h2>
        <ActionForm action={saveRecognitionSettings} className="foundation-form">
          <div className="recognition-setting-grid">
            <label className="foundation-field"><span>Voting due day each month</span><input type="number" name="dueDay" min={1} max={31} defaultValue={dueDay} required /></label>
            <label className="foundation-field"><span>Due time (24-hour)</span><input type="time" name="dueTime" defaultValue={dueTime} required /></label>
            <label className="foundation-field"><span>Recognition coordinator</span><select name="delegateId" defaultValue={settings?.delegateId ?? ""} disabled={!user.isOwner}><option value="">Owner manages settings</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>{!user.isOwner ? <input type="hidden" name="delegateId" value={settings?.delegateId ?? ""} /> : null}</label>
            <label className="foundation-field"><span>Certificate design</span><select name="certificateLayout" defaultValue={certificateLayout}>{CERTIFICATE_LAYOUTS.map((layout) => <option key={layout} value={layout}>{layout[0].toUpperCase() + layout.slice(1)}</option>)}</select></label>
          </div>
          <label className="foundation-field"><span>Additional nominees not on Parlia (one name per line)</span><textarea name="externalNominees" maxLength={12000} rows={4} defaultValue={externalNominees.join("\n")} /></label>
          <SubmitButton>Save recognition settings</SubmitButton>
        </ActionForm>
      </section>

      {user.isOwner ? <section className="foundation-panel">
        <div className="team-meeting-heading"><div><p className="eyebrow">{period}</p><h2>Current ballots</h2></div><span>Due {deadline.toLocaleString()}</span></div>
        {votes.length ? <div className="recognition-private-ballots">{votes.map((vote, index) => <article key={`ballot-${period}-${index}`}><strong>{vote.nomineeName}</strong><p>{vote.reason || "No reason supplied"}</p><small>{vote.anonymous ? "Anonymous ballot" : `Voted by ${vote.voter.name}`}</small></article>)}</div> : <p className="foundation-muted">No ballots have been submitted this month.</p>}
        {publishedThisPeriod ? <p className="foundation-notice">This month’s result was published on {publishedThisPeriod.publishedAt.toLocaleString()}.</p> : <ActionForm action={publishEmployeeOfMonth} className="foundation-form">
          <input type="hidden" name="period" value={period} />
          <p className="foundation-muted">Publishing is available after the voting deadline. The winner becomes visible to staff and a certificate is generated below.</p>
          <SubmitButton>Publish monthly result</SubmitButton>
        </ActionForm>}
      </section> : <section className="foundation-panel"><h2>Voting and publication</h2><p className="foundation-muted">Ballots, voter reasons, and publishing are visible only to the firm owner.</p></section>}

      {publications.map((publication) => <section className={`recognition-certificate certificate-${publication.certificateLayout}`} id={`certificate-${publication.id}`} key={publication.id} style={{ "--certificate-brand": brandColour } as React.CSSProperties}>
        <header>{logoUrl ? <img src={logoUrl} alt={`${user.firm.name} logo`} /> : <strong className="recognition-wordmark">{user.firm.name}</strong>}<span>{user.firm.name}</span></header>
        <p className="eyebrow">EMPLOYEE OF THE MONTH · {publication.period}</p>
        <h2>Certificate of Recognition</h2>
        <p className="certificate-copy">Presented to</p>
        <p className="certificate-winner">{publication.winnerName}</p>
        <p className="certificate-copy">In recognition of their contribution to the team.</p>
        <footer><span>{owner?.name ?? user.firm.name}<small>Firm owner</small></span><span>{publication.publishedAt.toLocaleDateString()}<small>Date published</small></span></footer>
        <CertificatePrintButton targetId={`certificate-${publication.id}`} />
      </section>)}
      <p className="foundation-muted"><Link href="/team/recognition">Open employee voting page</Link></p>
    </section>
  );
}