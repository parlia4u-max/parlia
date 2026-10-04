import type { CSSProperties, ReactNode } from "react";
import type { FirmBranding } from "@/lib/firm-portal";

export function PortalShell({ branding, title, children }: { branding: FirmBranding; title: string; children: ReactNode }) {
  const style = { "--portal-colour": branding.colour, "--portal-on-colour": branding.textOnColour } as CSSProperties;
  return (
    <section className="foundation-page foundation-auth" style={{ ...style, borderTop: `6px solid ${branding.colour}` }}>
      {branding.logoUrl ? <img src={branding.logoUrl} alt={`${branding.name} logo`} style={{ maxHeight: 64, maxWidth: 240 }} /> : null}
      <p className="eyebrow">{branding.name}</p>
      <h1>{title}</h1>
      {children}
    </section>
  );
}

export function portalButtonStyle(branding: FirmBranding): CSSProperties {
  return { background: branding.colour, color: branding.textOnColour, borderColor: branding.colour };
}
