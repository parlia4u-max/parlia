import { getCurrentUser, hasPermission, permissionScope } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { renderLeavePdf } from "@/lib/leave-pdf";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/leave/[id]/pdf">) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "people", "View")) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const db = getDb();
  const request = await db.leaveRequest.findFirst({
    where: { id, firmId: user.firmId, status: "Approved" },
    include: {
      requester: { select: { id: true, name: true } },
      cover: { select: { name: true } },
      approvedBy: { select: { id: true, name: true } },
    },
  });
  if (!request) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  let authorized = user.isOwner || request.requesterId === user.id;
  if (!authorized && request.approvedById && permissionScope(user, "people") !== "Own") {
    authorized = Boolean(await db.supervisorLink.findFirst({
      where: { firmId: user.firmId, supervisorId: user.id, userId: request.requesterId, user: { active: true } },
      select: { id: true },
    }));
  }
  if (!authorized) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const firm = await db.firm.findFirst({ where: { id: user.firmId }, select: { name: true } });
  if (!firm) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const snapshot = request.formSnapshot as { template?: { id: string; title: string; footer: string; accentColor: string }; firmProfile?: { legalName?: string; name?: string; address?: string } } | null;
  const template = snapshot?.template;
  if (!template || template.id !== request.formTemplate || !template.title || !template.footer || !template.accentColor) {
    return new Response("The saved leave form template is unavailable.", { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const pdf = renderLeavePdf({
    firmName: snapshot.firmProfile?.legalName || snapshot.firmProfile?.name || firm.name,
    firmAddress: snapshot.firmProfile?.address,
    employee: request.requester.name,
    leaveType: request.type === "FamilyResponsibility" ? "Family responsibility" : request.type,
    startDate: request.startDate.toISOString().slice(0, 10),
    endDate: request.endDate.toISOString().slice(0, 10),
    workingDays: request.requestedDays,
    reason: request.reason,
    coverName: request.cover?.name ?? "Not recorded",
    status: request.status,
    submittedAt: request.submittedAt.toISOString(),
    approvedBy: request.approvedBy?.name ?? "",
    decisionNote: request.decisionNote,
    template,
  });
  await db.auditLog.create({
    data: { firmId: user.firmId, actorId: user.id, action: "leave.pdf.downloaded", entityType: "leave-request", entityId: request.id },
  });
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="leave-request-${request.id}.pdf"`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
