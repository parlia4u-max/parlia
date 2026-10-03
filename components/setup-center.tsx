import Link from "next/link";
import { publishSetup } from "@/app/actions/setup";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FoundationHeader } from "@/components/foundation";
import { SetupSectionEditor } from "@/components/setup-section-editor";
import { getSetupPageContext } from "@/lib/setup";
import { SETUP_SECTIONS, type SetupSectionKey } from "@/lib/setup-config";
import { getDb } from "@/lib/db";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export async function SetupSectionPage({ section }: { section: SetupSectionKey }) {
  const { user, firm, config } = await getSetupPageContext(section);
  const definition = SETUP_SECTIONS.find((item) => item.key === section)!;
  const draft = asRecord(config.draft)[section];
  const published = asRecord(config.published)[section];
  const changed = JSON.stringify(draft) !== JSON.stringify(published);
  let supervisors: { id: string; name: string; email: string }[] = [];
  if (section === "setupRights" && user.isOwner) {
    const links = await getDb().supervisorLink.findMany({
      where: { firmId: user.firmId, supervisor: { active: true }, user: { active: true } },
      distinct: ["supervisorId"],
      include: { supervisor: { select: { id: true, name: true, email: true } } },
      orderBy: { supervisor: { name: "asc" } },
    });
    supervisors = links.map(({ supervisor }) => supervisor);
  }
  return (
    <div className="setup-responsive-shell">
      <p className="setup-mobile-notice">Setup Centre is available on desktop. Open this page on a larger screen to edit firm setup.</p>
      <section className="foundation-page setup-page setup-desktop-content">
        <FoundationHeader title={definition.label} firm={firm.name} isOwner={user.isOwner} />
        <div className="foundation-panel">
          <p className="eyebrow">DRAFT WORKSPACE</p>
          <p className="foundation-intro">{section === "firmProfile"
            ? "Edit the firm identity used by Parlia. Logos are stored as HTTPS image references only; file uploads are not accepted."
            : section === "integrations"
              ? "Save integration preferences only. No provider connections are available here; connection status remains Not connected."
              : section === "setupRights"
                ? "Grant active supervisors access to draft selected setup sections. Owners alone can publish, edit permissions, change integrations or grant setup rights."
                : "Changes are saved to this firm’s draft only. They do not affect active settings until the owner publishes the complete setup."}</p>
          <span className={`foundation-status${changed ? "" : " is-active"}`}>{changed ? "Draft differs from published" : "Draft matches published"}</span>
          <h2>Editing {changed ? "draft" : "published"} values</h2>
          <SetupSectionEditor section={section} initialValue={draft} supervisors={supervisors} />
        </div>
        <p className="setup-back-link"><Link href="/setup">Back to Setup Centre</Link></p>
      </section>
    </div>
  );
}

export async function SetupHomePage() {
  const { user, firm, config } = await getSetupPageContext();
  const draft = asRecord(config.draft);
  const published = asRecord(config.published);
  const permitted = user.isOwner
    ? SETUP_SECTIONS
    : SETUP_SECTIONS.filter((section) => {
        const rights = asRecord(published.setupRights) as { supervisors?: { userId: string; sections: string[] }[] };
      const grant = rights.supervisors?.find((item) => item.userId === user.id);
      return Array.isArray(grant?.sections) && grant.sections.includes(section.key);
      });
  const changed = permitted.filter((section) => JSON.stringify(draft[section.key]) !== JSON.stringify(published[section.key])).length;
  const reviewed = config.publishedAt !== null;
  return (
    <div className="setup-responsive-shell">
      <p className="setup-mobile-notice">Setup Centre is available on desktop. Open this page on a larger screen to review or publish firm setup.</p>
      <section className="foundation-page setup-page setup-desktop-content">
        <FoundationHeader title="Setup Centre" firm={firm.name} isOwner={user.isOwner} />
        <p className="foundation-intro">Configure this firm’s defaults in a private draft, review the checklist, then publish once. Drafts stay inactive until the owner publishes.</p>
        <section className="foundation-panel setup-publish-panel">
          <div>
            <p className="eyebrow">{config.publishedAt ? `PUBLISHED VERSION ${config.version}` : "NOT PUBLISHED YET"}</p>
            <h2>{changed ? `${changed} draft section${changed === 1 ? "" : "s"} changed` : "No unpublished changes"}</h2>
            <p>{config.publishedAt ? `Last published ${config.publishedAt.toLocaleString()}.` : "Review the seeded defaults and publish when they are ready."} {user.isOwner ? "Only you can publish." : "You can draft the sections granted to you; only the owner can publish."}</p>
          </div>
          {user.isOwner ? (
            <ActionForm
              action={publishSetup}
              className="setup-publish-form"
              confirmationMessage={config.publishedAt && JSON.stringify(draft.filingStructure) !== JSON.stringify(published.filingStructure)
                ? "Are you sure? Publishing will change this firm's active filing locations or folders."
                : undefined}
            >
              <SubmitButton>Publish setup</SubmitButton>
            </ActionForm>
          ) : null}
        </section>
        <section className="foundation-panel">
          <h2>Setup checklist</h2>
          <p className="foundation-muted">{reviewed ? "Sections show whether their draft is ready to publish." : "Review the seeded South Africa defaults for 2026 and update lists before publishing."}</p>
          <div className="setup-checklist">
            {permitted.map((section) => {
              const sectionDraft = draft[section.key];
              const sectionChanged = JSON.stringify(sectionDraft) !== JSON.stringify(published[section.key]);
              const entries = Array.isArray(sectionDraft) ? sectionDraft.length : Object.keys(asRecord(sectionDraft)).length;
              const status = !reviewed ? "Review seeded defaults" : sectionChanged ? "Draft changes" : "Published";
              return (
                <Link className="setup-checklist-row" href={section.href} key={section.key}>
                  <span><strong>{section.label}</strong><small>{entries} configured field{entries === 1 ? "" : "s"}</small></span>
                  <span className={`foundation-status${!sectionChanged && reviewed ? " is-active" : ""}`}>{status}</span>
                </Link>
              );
            })}
            <Link className="setup-checklist-row" href="/settings/subscription">
              <span><strong>Subscription and team size</strong><small>Firm account and active staff summary</small></span>
              <span className="foundation-status is-active">View</span>
            </Link>
          </div>
        </section>
        <div className="setup-footer-links">
          {user.isOwner ? <Link href="/settings/audit-log">Open audit log</Link> : null}
          {user.isOwner ? <Link href="/settings/permissions">Review role templates</Link> : null}
        </div>
      </section>
    </div>
  );
}
