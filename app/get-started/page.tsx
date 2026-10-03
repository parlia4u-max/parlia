import Link from "next/link";
import { createOwner } from "@/app/actions/auth";
import { Field } from "@/components/foundation";
import { ActionForm, SubmitButton } from "@/components/action-form";

export default function GetStartedPage() {
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">NEW FIRM</p>
      <h1>Set up your firm</h1>
      <p>Create the first owner account. Email verification is required before sign-in.</p>
      <ActionForm action={createOwner} className="foundation-form">
        <Field label="Firm name" name="firmName" autoComplete="organization" />
        <Field label="Your name" name="name" autoComplete="name" />
        <Field label="Work email" name="email" type="email" autoComplete="email" />
        <Field label="Password (12 characters minimum)" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={1024} />
        <SubmitButton>Create firm and verify email</SubmitButton>
      </ActionForm>
      <p><Link href="/login">Already have an account? Sign in</Link></p>
    </section>
  );
}
