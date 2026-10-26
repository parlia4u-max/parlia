-- Shared calendars with per-person view/edit access, and fuller court-run (duty) records.
-- Additive only: no existing column or table is changed or removed.

CREATE TYPE "CalendarAccess" AS ENUM ('View', 'Edit');

CREATE TABLE "Calendar" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL DEFAULT '#B8913F',
    "description" TEXT,
    "firmAccess" "CalendarAccess",
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Calendar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Calendar_id_firmId_key" ON "Calendar"("id", "firmId");
CREATE INDEX "Calendar_firmId_createdById_idx" ON "Calendar"("firmId", "createdById");
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Calendar" ADD CONSTRAINT "Calendar_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarShare" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" "CalendarAccess" NOT NULL DEFAULT 'View',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarShare_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarShare_calendarId_userId_key" ON "CalendarShare"("calendarId", "userId");
CREATE INDEX "CalendarShare_firmId_userId_idx" ON "CalendarShare"("firmId", "userId");
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_calendarId_firmId_fkey" FOREIGN KEY ("calendarId", "firmId") REFERENCES "Calendar"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarShare" ADD CONSTRAINT "CalendarShare_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEvent" ADD COLUMN "calendarId" TEXT;
CREATE INDEX "CalendarEvent_firmId_calendarId_startAt_idx" ON "CalendarEvent"("firmId", "calendarId", "startAt");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_calendarId_firmId_fkey" FOREIGN KEY ("calendarId", "firmId") REFERENCES "Calendar"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "DutyRecord"
ADD COLUMN "returnedById" TEXT,
ADD COLUMN "jurisdiction" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "reason" TEXT,
ADD COLUMN "department" TEXT,
ADD COLUMN "updateNotes" TEXT,
ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "DutyRecord" ADD CONSTRAINT "DutyRecord_returnedById_firmId_fkey" FOREIGN KEY ("returnedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;
