ALTER TABLE "ClientPortalAccount" ADD COLUMN "introSeenAt" TIMESTAMP(3);

CREATE TABLE "MatterDocument" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "referenceUrl" TEXT NOT NULL,
    "sharedWithClient" BOOLEAN NOT NULL DEFAULT false,
    "sharedAt" TIMESTAMP(3),
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MatterDocument_id_firmId_key" ON "MatterDocument"("id", "firmId");
CREATE INDEX "MatterDocument_firmId_matterId_sharedWithClient_idx" ON "MatterDocument"("firmId", "matterId", "sharedWithClient");
ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterDocument" ADD CONSTRAINT "MatterDocument_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ClientDocumentView" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientDocumentView_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientDocumentView_firmId_documentId_idx" ON "ClientDocumentView"("firmId", "documentId");
ALTER TABLE "ClientDocumentView" ADD CONSTRAINT "ClientDocumentView_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentView" ADD CONSTRAINT "ClientDocumentView_documentId_firmId_fkey" FOREIGN KEY ("documentId", "firmId") REFERENCES "MatterDocument"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentView" ADD CONSTRAINT "ClientDocumentView_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
