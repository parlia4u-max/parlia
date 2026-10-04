"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { audit, requirePermission } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function markConsultationHandled(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const user = await requirePermission("matters", "Edit");
    const id = form.get("id");
    if (typeof id !== "string" || !id) throw new ActionError("Choose a consultation request.");
    const result = await getDb().consultationRequest.updateMany({
      where: { id, firmId: user.firmId, status: "New" },
      data: { status: "Handled", handledAt: new Date(), handledById: user.id },
    });
    if (!result.count) throw new ActionError("This request was already handled.");
    await audit(user.firmId, user.id, "client_portal.consultation_handled", "consultation-request", id);
    revalidatePath("/");
    revalidatePath("/calendar");
    return "success:Marked as handled.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
