"use server";

import { revalidatePath } from "next/cache";
import { ActionError, actionErrorMessage } from "@/lib/errors";
import { authorizedMatterEditor } from "@/lib/matter-editor";
import { minutesBetween } from "@/lib/availability";

export async function startCallTimer(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await authorizedMatterEditor(String(form.get("matterId") ?? ""));
    const running = await db.timeEntry.findFirst({ where: { firmId: user.firmId, userId: user.id, endedAt: null }, select: { id: true } });
    if (running) throw new ActionError("You already have a timer running. Stop it first.");
    const entry = await db.timeEntry.create({ data: { firmId: user.firmId, matterId: matter.id, userId: user.id, startedAt: new Date() }, select: { id: true } });
    await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "time_entry.started", entityType: "time-entry", entityId: entry.id, details: { matterId: matter.id } } });
    revalidatePath(`/matters/${matter.id}`);
    return "success:Timer started.";
  } catch (error) {
    return actionErrorMessage(error);
  }
}

export async function stopCallTimer(_state: string | null, form: FormData): Promise<string | null> {
  try {
    const { user, matter, db } = await authorizedMatterEditor(String(form.get("matterId") ?? ""));
    const note = String(form.get("note") ?? "").trim().slice(0, 300) || null;
    const running = await db.timeEntry.findFirst({ where: { firmId: user.firmId, userId: user.id, matterId: matter.id, endedAt: null } });
    if (!running) throw new ActionError("There is no running timer on this matter.");
    const endedAt = new Date();
    const minutes = minutesBetween(running.startedAt, endedAt);
    await db.timeEntry.updateMany({ where: { id: running.id, firmId: user.firmId, endedAt: null }, data: { endedAt, minutes, note } });
    await db.auditLog.create({ data: { firmId: user.firmId, actorId: user.id, action: "time_entry.stopped", entityType: "time-entry", entityId: running.id, details: { matterId: matter.id, minutes } } });
    revalidatePath(`/matters/${matter.id}`);
    return `success:Timer stopped. ${minutes} minutes recorded.`;
  } catch (error) {
    return actionErrorMessage(error);
  }
}