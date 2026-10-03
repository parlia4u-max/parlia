CREATE TYPE "PhysicalFileStatus" AS ENUM ('InStorage', 'OutOfStorage', 'Closed');

CREATE TABLE "ServiceRecord" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "outcome" TEXT,
    "serviceDate" TIMESTAMP(3),
    "details" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ServiceTrace" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    CONSTRAINT "ServiceTrace_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DutyRecord" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT,
    "title" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'Scheduled',
    "returnedAt" TIMESTAMP(3),
    "returnNotes" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DutyRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PhysicalFile" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "folder" TEXT NOT NULL,
    "status" "PhysicalFileStatus" NOT NULL DEFAULT 'InStorage',
    "borrowerId" TEXT,
    "checkedOutAt" TIMESTAMP(3),
    "boxNumber" TEXT,
    "dateSent" TIMESTAMP(3),
    "storageCompany" TEXT,
    "barcodeReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PhysicalFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceRecord_id_firmId_key" ON "ServiceRecord"("id", "firmId");
CREATE INDEX "ServiceRecord_firmId_status_serviceDate_idx" ON "ServiceRecord"("firmId", "status", "serviceDate");
CREATE INDEX "ServiceRecord_firmId_matterId_createdAt_idx" ON "ServiceRecord"("firmId", "matterId", "createdAt");
CREATE UNIQUE INDEX "ServiceTrace_serviceId_attempt_key" ON "ServiceTrace"("serviceId", "attempt");
CREATE INDEX "ServiceTrace_firmId_serviceId_attemptedAt_idx" ON "ServiceTrace"("firmId", "serviceId", "attemptedAt");
CREATE UNIQUE INDEX "DutyRecord_id_firmId_key" ON "DutyRecord"("id", "firmId");
CREATE INDEX "DutyRecord_firmId_status_dueAt_idx" ON "DutyRecord"("firmId", "status", "dueAt");
CREATE INDEX "DutyRecord_firmId_assignedToId_status_dueAt_idx" ON "DutyRecord"("firmId", "assignedToId", "status", "dueAt");
CREATE UNIQUE INDEX "PhysicalFile_matterId_firmId_key" ON "PhysicalFile"("matterId", "firmId");
CREATE UNIQUE INDEX "PhysicalFile_id_firmId_key" ON "PhysicalFile"("id", "firmId");
CREATE INDEX "PhysicalFile_firmId_status_location_idx" ON "PhysicalFile"("firmId", "status", "location");
CREATE INDEX "PhysicalFile_firmId_boxNumber_barcodeReference_idx" ON "PhysicalFile"("firmId", "boxNumber", "barcodeReference");

ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_matterId_firmId_fkey"
    FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_createdById_firmId_fkey"
    FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceTrace" ADD CONSTRAINT "ServiceTrace_serviceId_firmId_fkey"
    FOREIGN KEY ("serviceId", "firmId") REFERENCES "ServiceRecord"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTrace" ADD CONSTRAINT "ServiceTrace_createdById_firmId_fkey"
    FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DutyRecord" ADD CONSTRAINT "DutyRecord_matterId_firmId_fkey"
    FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DutyRecord" ADD CONSTRAINT "DutyRecord_assignedToId_firmId_fkey"
    FOREIGN KEY ("assignedToId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DutyRecord" ADD CONSTRAINT "DutyRecord_createdById_firmId_fkey"
    FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhysicalFile" ADD CONSTRAINT "PhysicalFile_matterId_firmId_fkey"
    FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhysicalFile" ADD CONSTRAINT "PhysicalFile_borrowerId_firmId_fkey"
    FOREIGN KEY ("borrowerId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ServiceRecord" ADD CONSTRAINT "ServiceRecord_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceTrace" ADD CONSTRAINT "ServiceTrace_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DutyRecord" ADD CONSTRAINT "DutyRecord_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhysicalFile" ADD CONSTRAINT "PhysicalFile_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
