import Link from "next/link";
import { requestPasswordReset } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">ACCOUNT RECOVERY</p>
      <h1>Reset your password</h1>
      {sent ? <Notice>If an active account exists for that email, a password reset link has been sent.</Notice> : null}
      <p>We’ll email a single-use reset link that expires after one hour.</p>
      <ActionForm action={requestPasswordReset} className="foundation-form">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <SubmitButton>Send reset link</SubmitButton>
      </ActionForm>
      <p><Link href="/login">Back to sign in</Link></p>
    </section>
  );
}
