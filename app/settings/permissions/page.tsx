import { savePermission, saveRole } from "@/app/actions/foundation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, FoundationHeader } from "@/components/foundation";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { MODULE_LABELS, MODULES, type ModuleKey } from "@/lib/permissions";

export default async function PermissionsPage() {
  const owner = await requireOwner();
  const [roles, staffCount] = await Promise.all([
    getDb().role.findMany({
      where: { firmId: owner.firmId, name: { not: "Owner" } },
      include: { permissions: true, _count: { select: { users: true, invitations: true } } },
      orderBy: [{ isTemplate: "desc" }, { name: "asc" }],
    }),
    getDb().user.count({ where: { firmId: owner.firmId, isOwner: false } }),
  ]);

  return (
    <section className="foundation-page">
      <FoundationHeader title="Permissions" firm={owner.firm.name} isOwner />
      <p className="foundation-intro">Choose each role’s module access and the records in scope. Owners always retain full firm access.</p>
      <section className="foundation-panel">
        <h2>Create a custom role</h2>
        <ActionForm action={saveRole} className="foundation-form foundation-inline-form">
          <Field label="Role name" name="name" maxLength={80} />
          <SubmitButton>Create role</SubmitButton>
        </ActionForm>
      </section>
      <p className="foundation-muted">{staffCount} staff account{staffCount === 1 ? "" : "s"} in this firm. Role and permission changes apply to assigned staff immediately.</p>

      {roles.map((role) => {
        const permissionByModule = new Map(role.permissions.map((permission) => [permission.module, permission]));
        return (
          <section className="foundation-panel" key={role.id}>
            <div className="foundation-role-heading">
              <div>
                <p className="eyebrow">{role.isTemplate ? "ROLE TEMPLATE" : "CUSTOM ROLE"}</p>
                <h2>{role.name}</h2>
                <p>{role._count.users} staff · {role._count.invitations} pending invitations</p>
              </div>
              <ActionForm action={saveRole} className="foundation-inline-form">
                <input name="roleId" type="hidden" value={role.id} />
                <Field label={`Rename ${role.name}`} name="name" defaultValue={role.name} maxLength={80} />
                <SubmitButton className="button-secondary">Rename</SubmitButton>
              </ActionForm>
            </div>
            <div className="foundation-permissions-grid">
              {MODULES.map((module) => {
                const permission = permissionByModule.get(module);
                return (
                  <ActionForm action={savePermission} className="foundation-permission-row" key={module}>
                    <input name="roleId" type="hidden" value={role.id} />
                    <input name="module" type="hidden" value={module} />
                    <strong>{MODULE_LABELS[module as ModuleKey]}</strong>
                    <label className="foundation-field">
                      <span>Access</span>
                      <select name="level" defaultValue={permission?.level ?? "None"}>
                        <option value="None">None</option><option value="View">View</option><option value="Edit">Edit</option>
                      </select>
                    </label>
                    <label className="foundation-field">
                      <span>Scope</span>
                      <select name="scope" defaultValue={permission?.scope ?? "Own"}>
                        <option value="Own">Own</option><option value="Team">Team</option><option value="Firm">Firm</option>
                      </select>
                    </label>
                    <SubmitButton className="button-secondary">Save</SubmitButton>
                  </ActionForm>
                );
              })}
            </div>
          </section>
        );
      })}
    </section>
  );
}
