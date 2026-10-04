import { NextResponse } from "next/server";
import { getCurrentClient } from "@/lib/client-auth";
import { getDb } from "@/lib/db";

// Checks the client's access on every request, logs the view, then sends the client to the firm's own document link.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const client = await getCurrentClient();
  if (!client) return NextResponse.redirect(new URL("/client/login", process.env.APP_URL), 303);
  const { id } = await params;
  const db = getDb();
  const document = await db.matterDocument.findFirst({
    where: {
      id, firmId: client.firmId, sharedWithClient: true,
      matter: { firmId: client.firmId, clientPortalAccess: { some: { firmId: client.firmId, clientId: client.id, revokedAt: null } } },
    },
    select: { id: true, referenceUrl: true },
  });
  if (!document) return new NextResponse("Not found", { status: 404 });
  await db.$transaction([
    db.clientDocumentView.create({ data: { firmId: client.firmId, documentId: document.id, clientId: client.id } }),
    db.auditLog.create({ data: { firmId: client.firmId, action: "client_portal.document_opened", entityType: "matter-document", entityId: document.id, details: { clientId: client.id } } }),
  ]);
  const response = NextResponse.redirect(document.referenceUrl, 303);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}