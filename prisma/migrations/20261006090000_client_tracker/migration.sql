CREATE TYPE "PossibleBillingStatus" AS ENUM ('Pending', 'Confirmed', 'Declined');

ALTER TABLE "Matter" ADD COLUMN "clientStepOverride" TEXT, ADD COLUMN "clientStepEstimates" JSONB;

CREATE TABLE "PossibleBilling" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "updateId" TEXT,
    "description" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PossibleBillingStatus" NOT NULL DEFAULT 'Pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PossibleBilling_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PossibleBilling_id_firmId_key" ON "PossibleBilling"("id", "firmId");
CREATE INDEX "PossibleBilling_firmId_matterId_status_idx" ON "PossibleBilling"("firmId", "matterId", "status");

ALTER TABLE "PossibleBilling" ADD CONSTRAINT "PossibleBilling_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PossibleBilling" ADD CONSTRAINT "PossibleBilling_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PossibleBilling" ADD CONSTRAINT "PossibleBilling_updateId_firmId_fkey" FOREIGN KEY ("updateId", "firmId") REFERENCES "ClientPortalUpdate"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;
