import Link from "next/link";
import { notFound } from "next/navigation";
import { requestPortalAccess } from "@/app/actions/portal-public";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/foundation";
import { HumanCheckFields } from "@/components/human-check";
import { PortalShell } from "@/components/portal-shell";
import { getFirmBySlug } from "@/lib/firm-portal";

export default async function RequestAccessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await getFirmBySlug(slug);
  if (!context || !context.settings.requestAccessEnabled) notFound();
  return (
    <PortalShell branding={context.branding} title="Request access">
      <p>Enter the reference number the firm gave you and the email address the firm has on file for you.</p>
      <ActionForm action={requestPortalAccess} className="foundation-form">
        <input type="hidden" name="slug" value={slug} />
        <Field label="Reference number" name="reference" maxLength={80} />
        <Field label="Email" name="email" type="email" autoComplete="email" maxLength={254} />
        <HumanCheckFields />
        <SubmitButton>Request access</SubmitButton>
      </ActionForm>
      <p><Link href={`/portal/${slug}`}>Back</Link></p>
    </PortalShell>
  );
}
