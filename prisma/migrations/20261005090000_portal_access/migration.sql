CREATE TYPE "ConsultationStatus" AS ENUM ('New', 'Handled');
CREATE TYPE "PortalAccessOutcome" AS ENUM ('Sent', 'NoMatch', 'Blocked', 'Consultation');

ALTER TABLE "Firm" ADD COLUMN "slug" TEXT;

-- Existing firms get a portal address built from their name plus a short id suffix so it is unique.
UPDATE "Firm"
SET "slug" = LEFT(COALESCE(NULLIF(TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER("name"), '[^a-z0-9]+', '-', 'g')), ''), 'firm'), 40) || '-' || RIGHT("id", 6);

CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");

CREATE TABLE "ConsultationRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'New',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" TIMESTAMP(3),
    "handledById" TEXT,
    CONSTRAINT "ConsultationRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortalAccessRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "outcome" "PortalAccessOutcome" NOT NULL,
    "staffNotified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalAccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ConsultationRequest_id_firmId_key" ON "ConsultationRequest"("id", "firmId");
CREATE INDEX "ConsultationRequest_firmId_status_createdAt_idx" ON "ConsultationRequest"("firmId", "status", "createdAt");
CREATE INDEX "PortalAccessRequest_firmId_createdAt_idx" ON "PortalAccessRequest"("firmId", "createdAt");
CREATE INDEX "PortalAccessRequest_firmId_ipHash_createdAt_idx" ON "PortalAccessRequest"("firmId", "ipHash", "createdAt");
CREATE INDEX "PortalAccessRequest_firmId_emailHash_createdAt_idx" ON "PortalAccessRequest"("firmId", "emailHash", "createdAt");

ALTER TABLE "ConsultationRequest" ADD CONSTRAINT "ConsultationRequest_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortalAccessRequest" ADD CONSTRAINT "PortalAccessRequest_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
