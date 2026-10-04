import Link from "next/link";
import { acceptClientInvitation } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";
import { getDb } from "@/lib/db";
import { hashToken } from "@/lib/security";

export default async function ClientInvitationPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  const invitation = token ? await getDb().clientPortalInvitation.findFirst({
    where: { tokenHash: hashToken(token), acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { firm: { select: { id: true, name: true } }, matter: { select: { matterNumber: true } } },
  }) : null;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">CLIENT PORTAL INVITATION</p>
      <h1>Join {invitation?.firm.name ?? "your firm"}</h1>
      {invitation ? <>
        <p>Hello {invitation.name}. This invitation connects your account only to matter <strong>{invitation.matter.matterNumber}</strong>.</p>
        <p>Your firm code is <strong>{invitation.firm.id}</strong>. Keep it for sign-in.</p>
        <p>Invitation for {invitation.email}. Set a password (12 characters minimum) to activate the secure client portal.</p>
        <ActionForm action={acceptClientInvitation} className="foundation-form">
          <input type="hidden" name="token" value={token} />
          <Field label="Password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} />
          <SubmitButton>Activate client account</SubmitButton>
        </ActionForm>
      </> : <Notice>This invitation link is invalid, expired or already used. Ask the firm to send a new invitation.</Notice>}
      <p><Link href="/client/login">Already have a client account? Sign in</Link></p>
    </section>
  );
}
