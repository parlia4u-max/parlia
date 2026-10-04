import Link from "next/link";
import { requestClientPasswordReset, resetClientPassword } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";
import { getDb } from "@/lib/db";

export default async function ClientResetPasswordPage({ searchParams }: { searchParams: Promise<{ firm?: string; email?: string; sent?: string }> }) {
  const { firm = "", email = "", sent } = await searchParams;
  const firmRecord = firm ? await getDb().firm.findUnique({ where: { id: firm }, select: { name: true } }) : null;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">CLIENT ACCOUNT RECOVERY</p>
      <h1>Reset your password</h1>
      <p>Request a one-time code using the firm code from your invitation and the account email. If the account is active, the code is emailed to that address.</p>
      <ActionForm action={requestClientPasswordReset} className="foundation-form">
        <Field label="Firm code" name="firmId" defaultValue={firm} maxLength={80} />
        <Field label="Email" name="email" type="email" defaultValue={email} autoComplete="email" maxLength={254} />
        <SubmitButton>Send reset code</SubmitButton>
      </ActionForm>
      {sent ? <>
        <Notice>If an active account matches these details, a reset code was sent. Check the account email.</Notice>
        <h2>{firmRecord?.name ? `Reset for ${firmRecord.name}` : "Enter reset code"}</h2>
        <ActionForm action={resetClientPassword} className="foundation-form">
          <input type="hidden" name="firmId" value={firm} />
          <input type="hidden" name="email" value={email} />
          <Field label="Six-digit reset code" name="code" autoComplete="one-time-code" minLength={6} maxLength={6} />
          <Field label="New password (12 characters minimum)" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} />
          <SubmitButton>Save new password</SubmitButton>
        </ActionForm>
      </> : null}
      <p><Link href="/client/login">Return to client sign in</Link></p>
    </section>
  );
}
