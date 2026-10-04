CREATE TABLE "FirmReportSettings" (
    "firmId" TEXT NOT NULL,
    "quietMatterDays" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FirmReportSettings_pkey" PRIMARY KEY ("firmId"),
    CONSTRAINT "FirmReportSettings_quietMatterDays_check" CHECK ("quietMatterDays" BETWEEN 1 AND 3650)
);

ALTER TABLE "FirmReportSettings"
    ADD CONSTRAINT "FirmReportSettings_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
