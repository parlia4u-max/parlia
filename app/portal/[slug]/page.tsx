import Link from "next/link";
import { notFound } from "next/navigation";
import { PortalShell, portalButtonStyle } from "@/components/portal-shell";
import { getFirmBySlug } from "@/lib/firm-portal";

export default async function FirmPortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const context = await getFirmBySlug(slug);
  if (!context) notFound();
  const { firm, branding, settings } = context;
  const style = portalButtonStyle(branding);
  return (
    <PortalShell branding={branding} title={`Welcome to ${branding.name}`}>
      <p>Follow your matter, read updates from us and share documents, all in one secure place.</p>
      <p><Link className="button-primary" style={style} href={`/client/login?firm=${encodeURIComponent(firm.id)}`}>Client login</Link></p>
      {settings.requestAccessEnabled ? <p><Link className="button-secondary" href={`/portal/${firm.slug}/access`}>Request access</Link></p> : null}
      <p><Link className="button-secondary" href={`/portal/${firm.slug}/consultation`}>Request a consultation</Link></p>
    </PortalShell>
  );
}
