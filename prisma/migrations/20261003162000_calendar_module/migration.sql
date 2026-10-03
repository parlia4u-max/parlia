CREATE TYPE "CalendarEventAudience" AS ENUM ('Internal', 'Client');

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "responsibleId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "matterId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "audience" "CalendarEventAudience" NOT NULL DEFAULT 'Internal',
    "meetingUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEvent_id_firmId_key" ON "CalendarEvent"("id", "firmId");
CREATE INDEX "CalendarEvent_firmId_ownerId_startAt_idx" ON "CalendarEvent"("firmId", "ownerId", "startAt");
CREATE INDEX "CalendarEvent_firmId_startAt_endAt_idx" ON "CalendarEvent"("firmId", "startAt", "endAt");
CREATE INDEX "CalendarEvent_firmId_matterId_startAt_idx" ON "CalendarEvent"("firmId", "matterId", "startAt");
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_ownerId_firmId_fkey" FOREIGN KEY ("ownerId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_responsibleId_firmId_fkey" FOREIGN KEY ("responsibleId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarEventAttendee" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarEventAttendee_eventId_userId_key" ON "CalendarEventAttendee"("eventId", "userId");
CREATE INDEX "CalendarEventAttendee_firmId_userId_eventId_idx" ON "CalendarEventAttendee"("firmId", "userId", "eventId");
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_eventId_firmId_fkey" FOREIGN KEY ("eventId", "firmId") REFERENCES "CalendarEvent"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventAttendee" ADD CONSTRAINT "CalendarEventAttendee_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CalendarEventChecklistItem" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEventChecklistItem_firmId_eventId_createdAt_idx" ON "CalendarEventChecklistItem"("firmId", "eventId", "createdAt");
ALTER TABLE "CalendarEventChecklistItem" ADD CONSTRAINT "CalendarEventChecklistItem_eventId_firmId_fkey" FOREIGN KEY ("eventId", "firmId") REFERENCES "CalendarEvent"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventChecklistItem" ADD CONSTRAINT "CalendarEventChecklistItem_completedById_firmId_fkey" FOREIGN KEY ("completedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "CalendarEventDocumentReference" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventDocumentReference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CalendarEventDocumentReference_firmId_eventId_createdAt_idx" ON "CalendarEventDocumentReference"("firmId", "eventId", "createdAt");
ALTER TABLE "CalendarEventDocumentReference" ADD CONSTRAINT "CalendarEventDocumentReference_eventId_firmId_fkey" FOREIGN KEY ("eventId", "firmId") REFERENCES "CalendarEvent"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
