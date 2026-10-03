"use server";

import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, getCurrentUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "parlia4u@gmail.com";
const categories = ["Account access", "Using Parlia", "Something is not working", "Other"] as const;

export async function sendSupportRequest(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ActionError("Sign in to contact Parlia support.");
    const category = formData.get("category");
    const messageValue = formData.get("message");
    if (typeof category !== "string" || !categories.includes(category as typeof categories[number])) {
      throw new ActionError("Choose a support topic.");
    }
    if (typeof messageValue !== "string" || !messageValue.trim()) throw new ActionError("Describe how we can help.");
    const message = messageValue.trim();
    if (message.length > 4000) throw new ActionError("Keep your message to 4,000 characters or fewer.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(SUPPORT_EMAIL)) {
      throw new ActionError("Parlia support email is not configured correctly. Please contact the firm owner.");
    }

    const subject = `Parlia Help Center: ${category}`;
    const body = [
      `From: ${user.name} <${user.email}>`,
      `Firm: ${user.firm.name}`,
      `Topic: ${category}`,
      "",
      message,
    ].join("\n");
    await audit(user.firmId, user.id, "support.request.send_attempted", "support", undefined, { category, recipient: SUPPORT_EMAIL });
    try {
      await sendEmail(SUPPORT_EMAIL, subject, body);
    } catch (error) {
      await audit(user.firmId, user.id, "support.request.send_failed", "support", undefined, { category });
      throw error;
    }
    await audit(user.firmId, user.id, "support.request.emailed", "support", undefined, { category });
    return "success:Your message was sent to Parlia support. We’ll reply to your account email.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
