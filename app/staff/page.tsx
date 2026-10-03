import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, FoundationHeader } from "@/components/foundation";
import { assignSupervisor, inviteStaff, toggleStaff } from "@/app/actions/foundation";
import { requirePermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function StaffPage() {
  const user = await requirePermission("people");
  const db = getDb();
  const scope = permissionScope(user, "people");
  let allowedIds: string[] | undefined;
  if (!user.isOwner && scope === "Own") {
    allowedIds = [user.id];
  } else if (!user.isOwner && scope === "Team") {
    const supervised = await db.supervisorLink.findMany({
      where: { supervisorId: user.id, firmId: user.firmId },
      select: { userId: true },
    });
    allowedIds = [user.id, ...supervised.map((link) => link.userId)];
  }
  const [members, roles, supervisors, invitations] = await Promise.all([
    db.user.findMany({
      where: {
        firmId: user.firmId,
        isOwner: false,
        ...(allowedIds ? { id: { in: allowedIds } } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true,
        createdAt: true,
        role: { select: { name: true } },
        supervisorLinks: { select: { supervisor: { select: { id: true, name: true } } }, take: 1 },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    user.isOwner
      ? db.role.findMany({ where: { firmId: user.firmId, name: { not: "Owner" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
    user.isOwner
      ? db.user.findMany({ where: { firmId: user.firmId, active: true }, select: { id: true, name: true, isOwner: true }, orderBy: [{ isOwner: "desc" }, { name: "asc" }] })
      : Promise.resolve([]),
    user.isOwner
      ? db.invitation.findMany({
          where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } },
          include: { role: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  return (
    <section className="foundation-page">
      <FoundationHeader title="Staff" firm={user.firm.name} isOwner={user.isOwner} />
      {user.isOwner ? (
        <div className="foundation-panel">
          <h2>Invite a staff member</h2>
          <p>An invitation is single-use and expires after seven days. Staff set their password when accepting.</p>
          <ActionForm action={inviteStaff} className="foundation-form foundation-inline-form">
            <Field label="Name" name="name" autoComplete="name" maxLength={120} />
            <Field label="Work email" name="email" type="email" autoComplete="email" maxLength={254} />
            <label className="foundation-field">
              <span>Role</span>
              <select name="roleId" required defaultValue="">
                <option value="" disabled>Choose a role</option>
                {roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>
            <SubmitButton>Send invitation</SubmitButton>
          </ActionForm>
        </div>
      ) : null}

      {user.isOwner && invitations.length > 0 ? (
        <section className="foundation-panel">
          <h2>Pending invitations</h2>
          <div className="foundation-table-wrap">
            <table className="foundation-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Expires</th></tr></thead>
              <tbody>
                {invitations.map((invitation) => (
                  <tr key={invitation.id}>
                    <td>{invitation.name}</td><td>{invitation.email}</td><td>{invitation.role.name}</td>
                    <td>{invitation.expiresAt.toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="foundation-panel">
        <h2>Staff accounts</h2>
        {members.length ? (
          <div className="foundation-table-wrap">
            <table className="foundation-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Supervisor</th><th>Status</th>{user.isOwner ? <th>Manage</th> : null}</tr></thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{member.name}</td>
                    <td>{member.email}</td>
                    <td>{member.role?.name ?? "No role"}</td>
                    <td>{member.supervisorLinks[0]?.supervisor.name ?? "—"}</td>
                    <td><span className={`foundation-status${member.active ? " is-active" : ""}`}>{member.active ? "Active" : "Inactive"}</span></td>
                    {user.isOwner ? (
                      <td className="foundation-actions">
                        <ActionForm action={assignSupervisor} className="foundation-row-form">
                          <input name="userId" type="hidden" value={member.id} />
                          <label className="visually-hidden" htmlFor={`supervisor-${member.id}`}>Supervisor for {member.name}</label>
                          <select id={`supervisor-${member.id}`} name="supervisorId" defaultValue={member.supervisorLinks[0]?.supervisor.id ?? "none"}>
                            <option value="none">No supervisor</option>
                            {supervisors.filter((person) => person.id !== member.id).map((person) => (
                              <option key={person.id} value={person.id}>{person.name}{person.isOwner ? " (owner)" : ""}</option>
                            ))}
                          </select>
                          <SubmitButton className="button-secondary">Save</SubmitButton>
                        </ActionForm>
                        <ActionForm action={toggleStaff} className="foundation-row-form">
                          <input name="userId" type="hidden" value={member.id} />
                          <SubmitButton className="button-secondary">{member.active ? "Deactivate" : "Activate"}</SubmitButton>
                        </ActionForm>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{scope === "Own" ? "No staff account is visible in your personal scope." : "There are no staff accounts to show."}</p>
        )}
      </section>
    </section>
  );
}
