"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { authorizedMatterEditor } from "@/lib/matter-editor";
import { createPortalInvitation } from "@/lib/portal-invites";
import { sendEmail } from "@/lib/email";
import { normalizeEmail, validEmail } from "@/lib/security";

export type EmailDraft = { to: string; subject: string; body: string } | { error: string };

function clientAddress(matter: { clientEmail: string | null }) {
  if (!matter.clientEmail) throw new ActionError("Add a client email to the matter first.");
  const email = normalizeEmail(matter.clientEmail);
  if (!validEmail(email)) throw new ActionError("The client email on this matter is not valid.");
  return email;
}

// Creates a single-use invitation but does not send it, so staff can send it from their own mailbox.
export async function prepareInvitationDraft(matterId: string): Promise<EmailDraft> {
  try {
    const { user, matter, db } = await authorizedMatterEditor(matterId);
    const to = clientAddress(matter);
    const name = `${matter.clientName} ${matter.clientSurname}`.trim();
    const result = await createPortalInvitation(db, { firmId: user.firmId, matterId: matter.id, senderId: user.id, email: to, name, replacePending: true, deliver: false });
    if (!result || !("draft" in result)) throw new ActionError("The invitation could not be prepared.");
    await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "client_portal.invitation_drafted", entityType: "client-portal-invitation", entityId: result.id, details: { matterId: matter.id, email: to } } });
    revalidatePath(`/matters/${matter.id}`);
    return { to, ...result.draft };
  } catch (error) {
    return { error: actionErrorMessage(error) ?? "Something went wrong." };
  }
}

export async function prepareClientEmailDraft(matterId: string, subject: string, body: string): Promise<EmailDraft> {
  try {
    const { matter } = await authorizedMatterEditor(matterId);
    const to = clientAddress(matter);
    const cleanSubject = subject.trim().slice(0, 200);
    const cleanBody = body.trim().slice(0, 5000);
    if (!cleanSubject || !cleanBody) throw new ActionError("Write a subject and a message.");
    return { to, subject: cleanSubject, body: cleanBody };
  } catch (error) {
    return { error: actionErrorMessage(error) ?? "Something went wrong." };
  }
}

export async function sendClientEmail(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await authorizedMatterEditor(String(form.get("matterId") ?? ""));
    const to = clientAddress(matter);
    const subject = String(form.get("subject") ?? "").trim().slice(0, 200);
    const body = String(form.get("body") ?? "").trim().slice(0, 5000);
    if (!subject || !body) throw new ActionError("Write a subject and a message.");
    await sendEmail(to, subject, body);
    await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "matter.client_email_sent", entityType: "matter", entityId: matter.id, details: { to } } });
    return "success:Email sent from Parlia.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}