"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";
import { authorizedMatterEditor } from "@/lib/matter-editor";
import { validatedDocumentReference } from "@/lib/client-portal-rules";

function text(form: FormData, key: string, label: string, max: number) {
  const value = form.get(key);
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new ActionError(`${label} is required and must be ${max} characters or fewer.`);
  return value.trim();
}

function rands(value: string) {
  const cleaned = value.replace(/\s/g, "").replace(",", ".");
  if (!/^-?\d{1,9}(\.\d{1,2})?$/.test(cleaned)) throw new ActionError("Enter the amount in rand, for example 1250.50.");
  return Math.round(Number(cleaned) * 100);
}

// Attorneys (matters Edit, within scope) or Accounts (accounts Edit) may manage invoices.
async function invoiceActor(matterId: string) {
  const session = await getCurrentUser();
  if (!session) throw new ActionError("Sign in to continue.");
  const db = getDb();
  const user = await db.user.findFirst({ where: { id: session.id, firmId: session.firmId, active: true }, include: { role: { include: { permissions: true } } } });
  if (!user) throw new ActionError("Sign in to continue.");
  if (hasPermission(user, "accounts", "Edit")) {
    const matter = await db.matter.findFirst({ where: { id: matterId, firmId: user.firmId }, select: { id: true } });
    if (!matter) throw new ActionError("Matter not found in this firm.");
    return { user, matter, db };
  }
  return authorizedMatterEditor(matterId);
}

function refresh(matterId: string) {
  revalidatePath(`/matters/${matterId}`);
  revalidatePath(`/client/matters/${matterId}`);
  revalidatePath("/accounts-review");
}

export async function createInvoiceDraft(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await invoiceActor(text(form, "matterId", "Matter", 80));
    const number = text(form, "number", "Invoice number", 60);
    const issueDate = new Date(`${text(form, "issueDate", "Invoice date", 10)}T12:00:00Z`);
    if (Number.isNaN(issueDate.getTime())) throw new ActionError("Enter a valid invoice date.");
    const amountCents = rands(text(form, "amount", "Amount", 20));
    if (amountCents <= 0) throw new ActionError("The amount must be more than zero.");
    const status = text(form, "status", "Status", 10);
    if (!["Unpaid", "PartPaid", "Paid"].includes(status)) throw new ActionError("Choose a payment status.");
    const documentUrl = validatedDocumentReference(text(form, "documentUrl", "Invoice PDF link", 2048));
    if (await db.invoice.findUnique({ where: { firmId_number: { firmId: user.firmId, number } }, select: { id: true } })) throw new ActionError("An invoice with this number already exists.");
    await db.$transaction(async (tx) => {
      const created = await tx.invoice.create({ data: { firmId: user.firmId, matterId: matter.id, number, issueDate, amountCents, status: status as "Unpaid" | "PartPaid" | "Paid", documentUrl, createdById: user.id }, select: { id: true } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "invoice.drafted", entityType: "invoice", entityId: created.id, details: { matterId: matter.id, number } } });
    });
    refresh(matter.id);
    return "success:Draft saved. The client cannot see it until you press Publish.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function deleteInvoiceDraft(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await invoiceActor(text(form, "matterId", "Matter", 80));
    const id = text(form, "invoiceId", "Invoice", 80);
    await db.$transaction(async (tx) => {
      const gone = await tx.invoice.deleteMany({ where: { id, firmId: user.firmId, matterId: matter.id, publishedAt: null } });
      if (gone.count !== 1) throw new ActionError("Only draft invoices can be deleted.");
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "invoice.draft_deleted", entityType: "invoice", entityId: id, details: { matterId: matter.id } } });
    });
    refresh(matter.id);
    return "success:Draft deleted.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function publishInvoice(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await invoiceActor(text(form, "matterId", "Matter", 80));
    const id = text(form, "invoiceId", "Invoice", 80);
    await db.$transaction(async (tx) => {
      const changed = await tx.invoice.updateMany({ where: { id, firmId: user.firmId, matterId: matter.id, publishedAt: null }, data: { publishedAt: new Date() } });
      if (changed.count !== 1) throw new ActionError("This invoice is already published.");
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "invoice.published", entityType: "invoice", entityId: id, details: { matterId: matter.id } } });
    });
    refresh(matter.id);
    return "success:Invoice published and locked. The client can now see it.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

// Published invoices are never edited. A credit note cancels one; the correct invoice is then created as a new draft.
export async function issueCreditNote(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await invoiceActor(text(form, "matterId", "Matter", 80));
    const id = text(form, "invoiceId", "Invoice", 80);
    const number = text(form, "number", "Credit note number", 60);
    const documentUrl = validatedDocumentReference(text(form, "documentUrl", "Credit note PDF link", 2048));
    await db.$transaction(async (tx) => {
      const original = await tx.invoice.findFirst({ where: { id, firmId: user.firmId, matterId: matter.id, publishedAt: { not: null }, creditNoteForId: null } });
      if (!original) throw new ActionError("Only a published invoice can be credited.");
      if (await tx.invoice.findFirst({ where: { firmId: user.firmId, creditNoteForId: id }, select: { id: true } })) throw new ActionError("This invoice already has a credit note.");
      if (await tx.invoice.findUnique({ where: { firmId_number: { firmId: user.firmId, number } }, select: { id: true } })) throw new ActionError("That number is already used.");
      const created = await tx.invoice.create({
        data: { firmId: user.firmId, matterId: matter.id, number, issueDate: new Date(), amountCents: -original.amountCents, status: "Paid", documentUrl, publishedAt: new Date(), creditNoteForId: id, createdById: user.id },
        select: { id: true },
      });
      await tx.paymentProof.updateMany({ where: { firmId: user.firmId, invoiceId: id, status: "Submitted" }, data: { status: "Rejected", rejectReason: "The invoice was cancelled by a credit note.", reviewedById: user.id, reviewedAt: new Date() } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "invoice.credit_note_issued", entityType: "invoice", entityId: created.id, details: { matterId: matter.id, creditsInvoiceId: id } } });
    });
    refresh(matter.id);
    return "success:Credit note issued. Create a new draft invoice with the corrected details.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function submitProofOfPayment(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const client = await getCurrentClient();
    if (!client) throw new ActionError("Sign in to continue.");
    const invoiceId = text(form, "invoiceId", "Invoice", 80);
    const referenceUrl = validatedDocumentReference(text(form, "referenceUrl", "Proof of payment link", 2048));
    const note = typeof form.get("note") === "string" ? String(form.get("note")).trim().slice(0, 300) || null : null;
    const db = getDb();
    const invoice = await db.invoice.findFirst({
      where: { id: invoiceId, firmId: client.firmId, publishedAt: { not: null }, creditNoteForId: null, status: { not: "Paid" }, matter: { firmId: client.firmId, clientPortalAccess: { some: { firmId: client.firmId, clientId: client.id, revokedAt: null } } } },
      select: { id: true, matterId: true },
    });
    if (!invoice) throw new ActionError("This invoice was not found or no longer needs payment.");
    await db.$transaction(async (tx) => {
      if (await tx.paymentProof.findFirst({ where: { firmId: client.firmId, invoiceId, status: "Submitted" }, select: { id: true } })) throw new ActionError("Your payment is already waiting for confirmation.");
      const created = await tx.paymentProof.create({ data: { firmId: client.firmId, invoiceId, clientId: client.id, referenceUrl, note }, select: { id: true } });
      await tx.auditLog.create({ data: { firmId: client.firmId, action: "invoice.proof_submitted", entityType: "payment-proof", entityId: created.id, details: { invoiceId, clientId: client.id } } });
    });
    revalidatePath(`/client/matters/${invoice.matterId}`);
    revalidatePath("/accounts-review");
    return "success:Thank you. Your payment is waiting for confirmation.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function reviewPaymentProof(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const session = await getCurrentUser();
    if (!session) throw new ActionError("Sign in to continue.");
    const db = getDb();
    const user = await db.user.findFirst({ where: { id: session.id, firmId: session.firmId, active: true }, include: { role: { include: { permissions: true } } } });
    if (!user || !hasPermission(user, "accounts", "Edit")) throw new ActionError("Accounts edit permission is required.");
    const id = text(form, "proofId", "Proof of payment", 80);
    const decision = text(form, "decision", "Decision", 10);
    if (decision !== "Confirm" && decision !== "Reject") throw new ActionError("Choose confirm or reject.");
    const reason = decision === "Reject" ? text(form, "reason", "Reason", 300) : null;
    const paid = form.get("paid") === "part" ? "PartPaid" : "Paid";
    let matterId = "";
    await db.$transaction(async (tx) => {
      const proof = await tx.paymentProof.findFirst({ where: { id, firmId: user.firmId, status: "Submitted" }, include: { invoice: { select: { id: true, matterId: true } } } });
      if (!proof) throw new ActionError("This submission was already reviewed.");
      matterId = proof.invoice.matterId;
      await tx.paymentProof.update({ where: { id_firmId: { id, firmId: user.firmId } }, data: { status: decision === "Confirm" ? "Confirmed" : "Rejected", rejectReason: reason, reviewedById: user.id, reviewedAt: new Date() } });
      if (decision === "Confirm") await tx.invoice.update({ where: { id_firmId: { id: proof.invoice.id, firmId: user.firmId } }, data: { status: paid } });
      await tx.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: decision === "Confirm" ? "invoice.payment_confirmed" : "invoice.payment_rejected", entityType: "payment-proof", entityId: id, details: { invoiceId: proof.invoice.id, reason } } });
    });
    refresh(matterId);
    return decision === "Confirm" ? "success:Payment confirmed." : "success:Rejected. The client will see the reason and can send a new proof.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}