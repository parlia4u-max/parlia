import { ActionError } from "@/lib/errors";

export function requireEmailConfiguration() {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    throw new ActionError("Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM to enable verification and account emails.");
  }
}

export async function sendEmail(to: string, subject: string, text: string) {
  requireEmailConfiguration();
  const apiKey = process.env.RESEND_API_KEY!;
  const from = process.env.EMAIL_FROM!;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text }),
    cache: "no-store",
  });
  if (!response.ok) throw new ActionError(`Email provider rejected the message (${response.status}). Check RESEND_API_KEY and EMAIL_FROM.`);
}

export function appUrl(path: string) {
  const base = process.env.APP_URL;
  if (!base) throw new ActionError("APP_URL is required to send account links. Set it to the public HTTPS application URL.");
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    throw new ActionError("APP_URL must be an absolute HTTPS application URL.");
  }
  const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (!isLocal && parsed.protocol !== "https:") || (isLocal && !["http:", "https:"].includes(parsed.protocol))) {
    throw new ActionError("APP_URL must use HTTPS except for local development.");
  }
  return new URL(path, parsed.origin).toString();
}
