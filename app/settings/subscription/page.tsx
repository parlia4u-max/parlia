import Link from "next/link";
import { notFound } from "next/navigation";
import { FoundationHeader } from "@/components/foundation";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function SubscriptionAndTeamPage() {
  const sessionUser = await requireOwner();
  const db = getDb();
  const user = await db.user.findFirst({
    where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
    select: { firmId: true, isOwner: true, firm: { select: { name: true, staffSeatLimit: true } } },
  });
  if (!user) notFound();

  const [activeMembers, activeStaff, pendingInvitations] = await Promise.all([
    db.user.count({ where: { firmId: user.firmId, active: true } }),
    db.user.count({ where: { firmId: user.firmId, active: true, isOwner: false } }),
    db.invitation.count({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  const reservedSeats = activeStaff + pendingInvitations;
  const remainingSeats = user.firm.staffSeatLimit === null ? null : Math.max(user.firm.staffSeatLimit - reservedSeats, 0);

  return (
    <section className="foundation-page">
      <FoundationHeader title="Subscription and team size" firm={user.firm.name} isOwner={user.isOwner} />
      <p className="foundation-intro">A firm-scoped account summary based on current active users. Parlia does not store or manage subscription payments on this page.</p>
      <section className="foundation-panel">
        <h2>Current team and staff seats</h2>
        <dl className="setup-team-summary">
          <div><dt>Active firm members</dt><dd>{activeMembers}</dd></div>
          <div><dt>Active staff accounts</dt><dd>{activeStaff}</dd></div>
          <div><dt>Pending staff invitations</dt><dd>{pendingInvitations}</dd></div>
          <div><dt>Staff seat allowance</dt><dd>{user.firm.staffSeatLimit === null ? "Not specified" : user.firm.staffSeatLimit}</dd></div>
          {remainingSeats !== null ? <div><dt>Staff seats available (including pending invitations)</dt><dd>{remainingSeats}</dd></div> : null}
        </dl>
        <p className="foundation-muted">Staff seats are separate from client accounts. Client portal accounts will not consume staff seats. If no allowance is shown, the subscription entitlement has not been recorded here; this page does not infer a plan or limit.</p>
      </section>
      <section className="foundation-panel">
        <h2>Subscription</h2>
        <p>Subscription plans, invoices and payment changes are not available in Setup Centre. No billing status or payment information is represented here.</p>
      </section>
      <p className="setup-back-link"><Link href="/setup">Back to Setup Centre</Link></p>
    </section>
  );
}
