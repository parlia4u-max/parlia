"use server";

import { revalidatePath } from "next/cache";
import { ActionError } from "@/lib/errors";
import { requireOwner } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { INTEGRATION_PROVIDERS } from "@/lib/integration-providers";

export async function disconnectIntegration(_state: string | null, formData: FormData): Promise<string | null> {
  const owner = await requireOwner();
  const providerId = formData.get("provider");
  const provider = INTEGRATION_PROVIDERS.find((item) => item.id === providerId);
  if (!provider) throw new ActionError("Choose a supported integration.");
  const db = getDb();
  await db.$transaction(async (tx) => {
    const connection = await tx.integrationConnection.findFirst({
      where: { firmId: owner.firmId, provider: provider.id },
      select: { id: true },
    });
    if (!connection) return;
    await tx.integrationConnection.deleteMany({ where: { id: connection.id, firmId: owner.firmId, provider: provider.id } });
    await tx.auditLog.create({
      data: {
        firmId: owner.firmId,
        actorId: owner.id,
        action: "integration.disconnected",
        entityType: "integration",
        entityId: connection.id,
        details: { provider: provider.id },
      },
    });
  });
  revalidatePath("/settings/integrations");
  return "success:Integration disconnected.";
}
