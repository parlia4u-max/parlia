import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hasPermission, permissionScope } from "@/lib/auth";

export default async function HomePage() {
  const user = await requireUser();
  const db = getDb();
  const showTeamSummary = user.isOwner || hasPermission(user, "people") && permissionScope(user, "people") === "Firm";
  const [staffCount, pendingInvitations] = showTeamSummary
    ? await Promise.all([
        db.user.count({ where: { firmId: user.firmId, active: true, isOwner: false } }),
        db.invitation.count({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      ])
    : [null, null];

  return (
    <section className="dashboard-page">
      <header className="dashboard-header">
        <p className="eyebrow">YOUR FIRM</p>
        <h1>Welcome, {user.name}</h1>
        <p>{user.firm.name} · {user.isOwner ? "Owner" : user.role?.name ?? "Staff"}</p>
      </header>
      <div className="foundation-cards">
        <article className="dashboard-block">
          <h2>Your account</h2>
          <p>{user.email}</p>
          <p>{user.isOwner ? "Owner verification by email is required each time you sign in." : "Your firm access follows the permissions assigned to your role."}</p>
        </article>
        {showTeamSummary ? (
          <article className="dashboard-block">
            <h2>Team access</h2>
            <p>{staffCount} active staff · {pendingInvitations} pending invitations</p>
            <Link className="back-link" href="/staff">Manage staff</Link>
          </article>
        ) : null}
        {user.isOwner ? (
          <article className="dashboard-block">
            <h2>Roles and permissions</h2>
            <p>Set what each staff role can view and edit, and the scope of that access.</p>
            <Link className="back-link" href="/settings/permissions">Open permissions</Link>
          </article>
        ) : null}
      </div>
    </section>
  );
}
