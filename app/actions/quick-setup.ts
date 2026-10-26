"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureSetupConfiguration } from "@/lib/setup";
import { SETUP_SECTIONS, validateSetupValue, type SetupConfig } from "@/lib/setup-config";
import { applyQuickSetup, parseAnswers } from "@/lib/setup-presets";
import { publishSetup } from "@/app/actions/setup";

/** Saves the guided set-up answers into the firm's draft and, if asked, publishes straight away. */
export async function saveQuickSetup(_state: string | null, formData: FormData): Promise<string | null> {
  try {
    const sessionUser = await getCurrentUser();
    if (!sessionUser) throw new ActionError("Sign in to set up your firm.");
    const db = getDb();
    const user = await db.user.findFirst({
      where: { id: sessionUser.id, firmId: sessionUser.firmId, active: true },
      select: { id: true, firmId: true, isOwner: true },
    });
    if (!user?.isOwner) throw new ActionError("Only the firm owner can use the guided set-up.");
    const raw = String(formData.get("answers") ?? "");
    if (!raw || raw.length > 50_000) throw new ActionError("The set-up answers could not be read. Reload the page and try again.");
    let answers;
    try {
      answers = parseAnswers(raw);
    } catch {
      throw new ActionError("The set-up answers could not be read. Reload the page and try again.");
    }
    if (!answers.firm.name.trim()) throw new ActionError("Enter your firm's name.");
    if (!answers.packs.length) throw new ActionError("Choose at least one type of work your firm does.");

    await ensureSetupConfiguration(user.firmId);
    await db.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "SetupConfiguration" WHERE "firmId" = ${user.firmId} FOR UPDATE`;
      const current = await tx.setupConfiguration.findUnique({ where: { firmId: user.firmId } });
      if (!current) throw new ActionError("Setup is not available for this firm.");
      const [usedTypes, usedRoles] = await Promise.all([
        tx.matter.findMany({ where: { firmId: user.firmId }, distinct: ["matterType"], select: { matterType: true } }),
        tx.role.findMany({ where: { firmId: user.firmId, OR: [{ users: { some: {} } }, { invitations: { some: {} } }] }, select: { name: true } }),
      ]);
      const draft = applyQuickSetup(current.draft as SetupConfig, answers, {
        matterTypes: usedTypes.map((item) => item.matterType),
        roles: usedRoles.map((item) => item.name),
      });
      for (const section of SETUP_SECTIONS) validateSetupValue(section.key, draft[section.key]);
      await tx.setupConfiguration.update({ where: { firmId: user.firmId }, data: { draft: draft as never } });
      await tx.auditLog.create({
        data: { firmId: user.firmId, actorId: user.id, action: "setup.guided_saved", entityType: "setup", details: { packs: answers.packs, roles: answers.roles } },
      });
    });
    revalidatePath("/setup");
    revalidatePath("/setup/start");

    if (formData.get("intent") === "publish") {
      const publishData = new FormData();
      publishData.set("confirmation", "confirmed");
      const result = await publishSetup(null, publishData);
      if (result && !result.startsWith("success:")) return `Your answers were saved as a draft, but publishing stopped: ${result}`;
      return "success:published";
    }
    return "success:Saved as a draft. Nothing changes for your team until you publish.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}
