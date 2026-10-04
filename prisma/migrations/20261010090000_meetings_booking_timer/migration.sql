ALTER TABLE "CalendarEvent" ADD COLUMN "graphEventId" TEXT, ADD COLUMN "bookedByClientId" TEXT;

CREATE TABLE "TimeEntry" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "minutes" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TimeEntry_id_firmId_key" ON "TimeEntry"("id", "firmId");
CREATE INDEX "TimeEntry_firmId_matterId_startedAt_idx" ON "TimeEntry"("firmId", "matterId", "startedAt");
CREATE INDEX "TimeEntry_firmId_userId_endedAt_idx" ON "TimeEntry"("firmId", "userId", "endedAt");

ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;