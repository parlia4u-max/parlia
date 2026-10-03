import Link from "next/link";
import { resendOwnerCode, verifyOwnerCode } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";

export default async function OwnerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; mode?: string; recent?: string }>;
}) {
  const { email = "", mode, recent } = await searchParams;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">EMAIL VERIFICATION</p>
      <h1>{mode === "login" ? "Confirm it’s you" : "Verify your email"}</h1>
      <p>Enter the six-digit code sent to <strong>{email || "your email address"}</strong>. Codes expire after 10 minutes.</p>
      {mode === "signup" ? <Notice>Your firm and owner account have been created. Verify this email before using the account.</Notice> : null}
      {recent ? <Notice>A recent verification code is still active. If it has not arrived, wait one minute and request another.</Notice> : null}
      <ActionForm action={verifyOwnerCode} className="foundation-form">
        <input name="email" type="hidden" value={email} />
        <Field label="Six-digit verification code" name="code" type="text" autoComplete="one-time-code" minLength={6} maxLength={6} />
        <SubmitButton>Verify and sign in</SubmitButton>
      </ActionForm>
      {email ? (
        <ActionForm action={resendOwnerCode} className="foundation-form foundation-resend">
          <input name="email" type="hidden" value={email} />
          <SubmitButton className="button-secondary">Send a new code</SubmitButton>
        </ActionForm>
      ) : null}
      <p><Link href="/login">Back to sign in</Link></p>
    </section>
  );
}
