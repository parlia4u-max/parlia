import Link from "next/link";
import { redirect } from "next/navigation";
import { loginClient } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Notice } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";

export default async function ClientLoginPage({ searchParams }: { searchParams: Promise<{ firm?: string; created?: string; reset?: string }> }) {
  const client = await getCurrentClient();
  if (client) redirect("/client");
  const query = await searchParams;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">CLIENT PORTAL</p>
      <h1>Client sign in</h1>
      {query.created ? <Notice>Your client portal account is ready. Sign in with the password you chose.</Notice> : null}
      {query.reset ? <Notice>Password changed. Sign in with the new password and complete the email-code check.</Notice> : null}
      <p>Use the firm code from your invitation, your email and your password. Parlia will email a separate sign-in code.</p>
      <ActionForm action={loginClient} className="foundation-form">
        <Field label="Firm code" name="firmId" defaultValue={query.firm ?? ""} maxLength={80} />
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" maxLength={1024} />
        <SubmitButton>Continue to email code</SubmitButton>
      </ActionForm>
      <p><Link href={`/client/reset-password${query.firm ? `?firm=${encodeURIComponent(query.firm)}` : ""}`}>Forgot your password?</Link></p>
      <p><Link href="/login">Staff sign in</Link></p>
    </section>
  );
}
