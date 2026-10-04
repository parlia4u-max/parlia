import { redirect } from "next/navigation";
import { verifyClientLogin } from "@/app/actions/client-auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/foundation";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";

export default async function ClientVerifyPage({ searchParams }: { searchParams: Promise<{ firm?: string; email?: string }> }) {
  if (await getCurrentClient()) redirect("/client");
  const { firm = "", email = "" } = await searchParams;
  const firmRecord = firm ? await getDb().firm.findUnique({ where: { id: firm }, select: { name: true } }) : null;
  return (
    <section className="foundation-page foundation-auth">
      <p className="eyebrow">TWO-STEP SIGN IN</p>
      <h1>Check your email</h1>
      <p>Enter the six-digit code sent to {email || "your account email"} for {firmRecord?.name ?? "your firm"}. The code expires after 10 minutes.</p>
      <ActionForm action={verifyClientLogin} className="foundation-form">
        <input type="hidden" name="firmId" value={firm} />
        <input type="hidden" name="email" value={email} />
        <Field label="Email code" name="code" autoComplete="one-time-code" minLength={6} maxLength={6} />
        <SubmitButton>Verify and sign in</SubmitButton>
      </ActionForm>
    </section>
  );
}
