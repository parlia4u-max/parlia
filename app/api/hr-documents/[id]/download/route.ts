import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canReadHrTarget } from "@/lib/hr-data";
import { decryptSensitive } from "@/lib/sensitive-data";
import { matchesHRDocumentMagic } from "@/lib/hr-rules";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: RouteContext<"/api/hr-documents/[id]/download">) {
  const user = await getCurrentUser();
  if (!user || !hasPermission(user, "people", "View")) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const { id } = await context.params;
  const db = getDb();
  const document = await db.hRDocument.findFirst({
    where: { id, firmId: user.firmId },
    select: {
      id: true, subjectId: true, encryptedMetadata: true, metadataIv: true, metadataAuthTag: true,
      encryptedContent: true, contentIv: true, contentAuthTag: true,
    },
  });
  const isSubject = document?.subjectId === user.id;
  const isAuthorizedManager = document && (user.isOwner || hasPermission(user, "people", "Edit")) && await canReadHrTarget(user, document.subjectId);
  if (!document || (!isSubject && !isAuthorizedManager)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const metadata = JSON.parse(decryptSensitive(document.encryptedMetadata, document.metadataIv, document.metadataAuthTag)) as { fileName: string; mimeType: string; size: number };
    const content = decryptSensitive(document.encryptedContent, document.contentIv, document.contentAuthTag);
    const saved = { ...metadata, data: content };
    if (!["application/pdf", "image/png", "image/jpeg"].includes(saved.mimeType)) return new Response("Invalid document", { status: 422, headers: { "Cache-Control": "no-store" } });
    const bytes = Buffer.from(saved.data, "base64");
    const magicIsValid = matchesHRDocumentMagic(saved.mimeType, bytes);
    if (!magicIsValid || bytes.length !== saved.size || bytes.length > 5 * 1024 * 1024) {
      return new Response("Invalid document", { status: 422, headers: { "Cache-Control": "no-store" } });
    }
    await db.auditLog.create({
      data: { firmId: user.firmId, actorId: user.id, action: "hr.document.downloaded", entityType: "hr-document", entityId: document.id, details: { subjectId: document.subjectId } },
    });
    const safeName = saved.fileName.replace(/[^\x20-\x7E]/g, "_").replace(/[\\/\r\n"]/g, "_").slice(0, 180);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": saved.mimeType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Encrypted document unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
