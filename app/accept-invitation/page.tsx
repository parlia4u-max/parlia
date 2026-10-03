import Link from "next/link";
import { acceptInvitation } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";
import { getDb } from "@/lib/db";
import { hashToken } from "@/lib/security";

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token = "" } = await searchParams;
  const invitation = token
    ? await getDb().invitation.findFirst({
        where: { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
        include: { firm: true, role: true },
      })
    : null;

  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">STAFF INVITATION</p>
      <h1>Join {invitation?.firm.name ?? "your firm"}</h1>
      {invitation ? (
        <>
          <p>{invitation.name}, you’ve been invited to join <strong>{invitation.firm.name}</strong> as <strong>{invitation.role.name}</strong>.</p>
          <p>Invitation for {invitation.email}. Choose a password to activate your account.</p>
          <ActionForm action={acceptInvitation} className="foundation-form">
            <input name="token" type="hidden" value={token} />
            <Field label="Password (12 characters minimum)" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} />
            <SubmitButton>Accept invitation</SubmitButton>
          </ActionForm>
        </>
      ) : (
        <Notice>This invitation link is invalid, expired, or already used. Ask the firm owner to send a new invitation.</Notice>
      )}
      <p><Link href="/login">Already have an account? Sign in</Link></p>
    </section>
  );
}
