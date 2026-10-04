import { getDb } from "@/lib/db";
import { appUrl, sendEmail } from "@/lib/email";
import { normalizeBrandColour, portalSettingsFromConfig, slugFromName, type PortalSettings } from "@/lib/portal-settings";

export type FirmBranding = { firmId: string; name: string; logoUrl: string; colour: string; textOnColour: string };

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function textColourFor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#1F1B16" : "#FFFFFF";
}

export function brandingFromConfig(firmId: string, firmName: string, published: unknown): FirmBranding {
  const profile = record(record(published).firmProfile);
  const colour = normalizeBrandColour(profile.brandColour);
  const logo = typeof profile.logoUrl === "string" && profile.logoUrl.startsWith("https://") ? profile.logoUrl : "";
  const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim() : firmName;
  return { firmId, name, logoUrl: logo, colour, textOnColour: textColourFor(colour) };
}

export async function getFirmBySlug(slug: string) {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const db = getDb();
  const firm = await db.firm.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } });
  if (!firm) return null;
  const config = await db.setupConfiguration.findUnique({ where: { firmId: firm.id }, select: { published: true } });
  return {
    firm,
    branding: brandingFromConfig(firm.id, firm.name, config?.published),
    settings: portalSettingsFromConfig(config?.published),
  };
}

export async function getFirmPortalContext(firmId: string): Promise<{ branding: FirmBranding; settings: PortalSettings; slug: string | null }> {
  const db = getDb();
  const [firm, config] = await Promise.all([
    db.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true, slug: true } }),
    db.setupConfiguration.findUnique({ where: { firmId }, select: { published: true } }),
  ]);
  return { branding: brandingFromConfig(firmId, firm.name, config?.published), settings: portalSettingsFromConfig(config?.published), slug: firm.slug };
}

export async function ensureFirmSlug(firmId: string) {
  const db = getDb();
  const firm = await db.firm.findUniqueOrThrow({ where: { id: firmId }, select: { name: true, slug: true } });
  if (firm.slug) return firm.slug;
  const base = slugFromName(firm.name);
  for (const candidate of [base, `${base}-${firmId.slice(-6)}`]) {
    if (!await db.firm.findUnique({ where: { slug: candidate }, select: { id: true } })) {
      const updated = await db.firm.updateMany({ where: { id: firmId, slug: null }, data: { slug: candidate } });
      if (updated.count) return candidate;
    }
  }
  return (await db.firm.findUniqueOrThrow({ where: { id: firmId }, select: { slug: true } })).slug ?? `${base}-${firmId.slice(-6)}`;
}

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function brandedEmail(branding: FirmBranding, heading: string, paragraphs: string[], button?: { label: string; url: string }) {
  const body = paragraphs.map((paragraph) => `<p style="font-size:17px;line-height:1.6;margin:0 0 16px">${escapeHtml(paragraph)}</p>`).join("");
  const logo = branding.logoUrl ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.name)}" style="max-height:56px;margin-bottom:12px"><br>` : "";
  const action = button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(button.url)}" style="background:${branding.colour};color:${branding.textOnColour};padding:14px 24px;border-radius:6px;font-weight:600;font-size:17px;text-decoration:none;display:inline-block">${escapeHtml(button.label)}</a></p>`
    : "";
  const html = `<div style="background:#FAF5E9;padding:24px;font-family:'Source Sans 3',Arial,sans-serif;color:#1F1B16"><div style="max-width:560px;margin:0 auto;background:#fff;border-top:6px solid ${branding.colour};padding:28px;border-radius:6px">${logo}<p style="font-size:15px;font-weight:600;margin:0 0 16px">${escapeHtml(branding.name)}</p><h1 style="font-family:Georgia,serif;font-size:24px;margin:0 0 16px">${escapeHtml(heading)}</h1>${body}${action}</div></div>`;
  const text = [heading, "", ...paragraphs, ...(button ? ["", `${button.label}: ${button.url}`] : [])].join("\n");
  return { html, text };
}

export async function sendBrandedEmail(firmId: string, to: string, subject: string, heading: string, paragraphs: string[], button?: { label: string; path: string }) {
  const { branding } = await getFirmPortalContext(firmId);
  const { html, text } = brandedEmail(branding, heading, paragraphs, button ? { label: button.label, url: appUrl(button.path) } : undefined);
  await sendEmail(to, subject, text, html);
}
