import Link from "next/link";
import { login } from "@/app/actions/auth";
import { Field, Notice } from "@/components/foundation";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">WELCOME BACK</p>
      <h1>Sign in</h1>
      {reset ? <Notice>Your password has been reset. Sign in with the new password.</Notice> : null}
      <ActionForm action={login} className="foundation-form">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <SubmitButton>Sign in</SubmitButton>
      </ActionForm>
      <p><Link href="/forgot-password">Forgot your password?</Link></p>
      <p>New to Parlia? <Link href="/get-started">Set up a firm</Link></p>
    </section>
  );
}
