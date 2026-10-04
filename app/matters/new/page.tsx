import Link from "next/link";
import { createMatter } from "@/app/actions/matters";
import { FoundationHeader } from "@/components/foundation";
import { NewMatterForm } from "@/components/matter-forms";
import { requirePermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { portalSettingsFromConfig } from "@/lib/portal-settings";
import { matterTypesFromConfig } from "@/lib/matter-config";

export default async function NewMatterPage() {
  const user = await requirePermission("matters", "Edit");
  const db = getDb();
  const scope = permissionScope(user, "matters");
  const [configuration, reports] = await Promise.all([
    db.setupConfiguration.findFirst({ where: { firmId: user.firmId }, select: { published: true, publishedAt: true } }),
    scope === "Team"
      ? db.supervisorLink.findMany({ where: { firmId: user.firmId, supervisorId: user.id, user: { firmId: user.firmId, active: true } }, select: { userId: true } })
      : Promise.resolve([]),
  ]);
  const responsibleIds = scope === "Firm" ? undefined : scope === "Team" ? [user.id, ...reports.map((report) => report.userId)] : [user.id];
  const people = await db.user.findMany({
    where: { firmId: user.firmId, active: true, ...(responsibleIds ? { id: { in: responsibleIds } } : {}) },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  const matterTypes = matterTypesFromConfig(configuration?.published);

  return (
    <section className="foundation-page">
      <FoundationHeader title="Open a matter" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">Enter the core matter details first. Additional client references are optional and kept behind More details.</p>
      {!configuration?.publishedAt ? (
        <section className="foundation-panel">
          <h2>Publish the firm setup first</h2>
          <p>Matters use the active published matter types, stages, task categories and follow-up rules. Publish the Setup Centre configuration before opening matters.</p>
          {user.isOwner ? <Link className="button-primary link-button" href="/setup">Open Setup Centre</Link> : <p>Ask the firm owner to publish Setup Centre before opening matters.</p>}
        </section>
      ) : matterTypes.length === 0 ? (
        <section className="foundation-panel">
          <h2>No matter types are configured</h2>
          <p>Add at least one matter type and stage in the published Setup Centre configuration.</p>
          {user.isOwner ? <Link className="button-primary link-button" href="/settings/matter-types-stages">Configure matter types</Link> : <p>Ask the firm owner to configure matter types and stages.</p>}
        </section>
      ) : (
        <section className="foundation-panel">
          <h2>Matter details</h2>
          <NewMatterForm action={createMatter} matterTypes={matterTypes} people={people} inviteByDefault={portalSettingsFromConfig(configuration?.published).inviteByDefault} />
        </section>
      )}
      <p className="setup-back-link"><Link href="/matters">Back to matters</Link></p>
    </section>
  );
}
