CREATE TYPE "InvoiceStatus" AS ENUM ('Unpaid', 'PartPaid', 'Paid');
CREATE TYPE "PaymentProofStatus" AS ENUM ('Submitted', 'Confirmed', 'Rejected');

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'Unpaid',
    "documentUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "creditNoteForId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_id_firmId_key" ON "Invoice"("id", "firmId");
CREATE UNIQUE INDEX "Invoice_firmId_number_key" ON "Invoice"("firmId", "number");
CREATE INDEX "Invoice_firmId_matterId_publishedAt_idx" ON "Invoice"("firmId", "matterId", "publishedAt");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PaymentProof" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "referenceUrl" TEXT NOT NULL,
    "note" TEXT,
    "status" "PaymentProofStatus" NOT NULL DEFAULT 'Submitted',
    "rejectReason" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PaymentProof_id_firmId_key" ON "PaymentProof"("id", "firmId");
CREATE INDEX "PaymentProof_firmId_status_submittedAt_idx" ON "PaymentProof"("firmId", "status", "submittedAt");
CREATE INDEX "PaymentProof_firmId_invoiceId_idx" ON "PaymentProof"("firmId", "invoiceId");
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_invoiceId_firmId_fkey" FOREIGN KEY ("invoiceId", "firmId") REFERENCES "Invoice"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaymentProof" ADD CONSTRAINT "PaymentProof_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;