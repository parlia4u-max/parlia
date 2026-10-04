CREATE TYPE "ClientNotificationKind" AS ENUM ('NewUpdate', 'NewDocument', 'DocumentRequested', 'InvoicePublished', 'Meeting', 'UploadReviewed');

CREATE TABLE "ClientNotification" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "kind" "ClientNotificationKind" NOT NULL,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "lastEmailedAt" TIMESTAMP(3),
    CONSTRAINT "ClientNotification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClientNotification_firmId_clientId_doneAt_idx" ON "ClientNotification"("firmId", "clientId", "doneAt");
CREATE INDEX "ClientNotification_firmId_matterId_doneAt_idx" ON "ClientNotification"("firmId", "matterId", "doneAt");
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientNotification" ADD CONSTRAINT "ClientNotification_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;