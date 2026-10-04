import Link from "next/link";
import { notFound } from "next/navigation";
import { requestConsultation } from "@/app/actions/portal-public";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/foundation";
import { HumanCheckFields } from "@/components/human-check";
import { PortalShell } from "@/components/portal-shell";
import { getFirmBySlug } from "@/lib/firm-portal";

export default async function ConsultationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await getFirmBySlug(slug);
  if (!context) notFound();
  return (
    <PortalShell branding={context.branding} title="Request a consultation">
      <p>Tell us a little about what you need. A member of the firm will contact you. This does not give you access to the portal.</p>
      <ActionForm action={requestConsultation} className="foundation-form">
        <input type="hidden" name="slug" value={slug} />
        <Field label="Your name" name="name" maxLength={120} />
        <Field label="Email or phone number" name="contact" maxLength={254} />
        <label className="foundation-field"><span>Short description</span><textarea name="description" required maxLength={1000} rows={4} /></label>
        <HumanCheckFields />
        <SubmitButton>Send request</SubmitButton>
      </ActionForm>
      <p><Link href={`/portal/${slug}`}>Back</Link></p>
    </PortalShell>
  );
}
