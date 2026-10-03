import Link from "next/link";
import { resetPassword } from "@/app/actions/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">ACCOUNT RECOVERY</p>
      <h1>Choose a new password</h1>
      {token ? (
        <ActionForm action={resetPassword} className="foundation-form">
          <input name="token" type="hidden" value={token} />
          <Field label="New password (12 characters minimum)" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} />
          <SubmitButton>Reset password</SubmitButton>
        </ActionForm>
      ) : (
        <Notice>This reset link is invalid or expired. Request a new link to continue.</Notice>
      )}
      <p><Link href="/forgot-password">Request another reset link</Link></p>
    </section>
  );
}
