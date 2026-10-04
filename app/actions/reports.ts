"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, getCurrentUser, hasPermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { findQuietMatters } from "@/lib/report-data";
import { reportCsvField } from "@/lib/report-rules";

export async function saveQuietMatterThreshold(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const user = await getCurrentUser();
    if (!user) throw new ActionError("Sign in to continue.");
    if (!user.isOwner) throw new ActionError("Only the firm owner can change the quiet-matter threshold.");
    const raw = formData.get("quietMatterDays");
    const days = typeof raw === "string" ? Number(raw) : Number.NaN;
    if (!Number.isInteger(days) || days < 1 || days > 3650) throw new ActionError("Choose a quiet-matter threshold from 1 to 3,650 days.");
    await getDb().$transaction(async (tx) => {
      await tx.firmReportSettings.upsert({
        where: { firmId: user.firmId },
        create: { firmId: user.firmId, quietMatterDays: days },
        update: { quietMatterDays: days },
      });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "reports.quiet_threshold_changed", entityType: "report-settings", details: { quietMatterDays: days } },
      });
    });
    revalidatePath("/reports");
    return "success:Quiet-matter threshold saved.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function emailQuietMatterDigest(_state: string | null, _formData: FormData): Promise<string | null> {
  try {
    const session = await getCurrentUser();
    if (!session) throw new ActionError("Sign in to continue.");
    const user = await getDb().user.findFirst({
      where: { id: session.id, firmId: session.firmId, active: true },
      include: { firm: { select: { name: true } }, role: { include: { permissions: true } } },
    });
    if (!user || !hasPermission(user, "reports") || !hasPermission(user, "matters")) {
      throw new ActionError("Reports and matter view access are both required to email this digest.");
    }
    const settings = await getDb().firmReportSettings.findUnique({ where: { firmId: user.firmId }, select: { quietMatterDays: true } });
    const threshold = settings?.quietMatterDays ?? 30;
    const { scope, matters } = await findQuietMatters(user, threshold);
    if (!scope) throw new ActionError("You do not have permission to view matter reports.");
    const lines = matters.slice(0, 100).map((matter) =>
      `${matter.matterNumber} — ${matter.clientName} ${matter.clientSurname} — ${matter.matterType}, ${matter.stage} — last activity ${matter.lastActivityAt.toISOString().slice(0, 10)} — responsible ${matter.responsible.name}`,
    );
    const content = lines.length
      ? lines.join("\n")
      : "No active matters in your report scope have exceeded the quiet-matter threshold.";
    await sendEmail(
      user.email,
      `${user.firm.name}: quiet-matter digest`,
      `This digest is for your own report scope (${scope}). It lists active matters with no recorded activity for at least ${threshold} days.\n\n${content}${matters.length > 100 ? `\n\nShowing the first 100 of ${matters.length} matters. Sign in to view the complete report.` : ""}\n\nThis report is operational information, not legal advice.`,
    );
    await audit(user.firmId, user.id, "reports.quiet_digest_emailed", "quiet-matter-report", undefined, { scope, thresholdDays: threshold, rowCount: matters.length });
    return "success:Digest emailed to your own account address.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export { reportCsvField };
