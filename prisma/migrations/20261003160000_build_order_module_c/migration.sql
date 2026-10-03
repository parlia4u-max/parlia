CREATE TYPE "MatterStatus" AS ENUM ('Active', 'OnHold', 'Closed');
CREATE TYPE "TaskStatus" AS ENUM ('Open', 'Complete');
CREATE TYPE "MatterStageKind" AS ENUM ('A', 'W', 'C', 'X');

CREATE TABLE "Matter" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterNumber" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientSurname" TEXT NOT NULL,
    "clientEmail" TEXT,
    "matterType" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "stageKind" "MatterStageKind" NOT NULL DEFAULT 'A',
    "responsibleId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "clientNumber" TEXT,
    "otherReferences" TEXT,
    "caseNumber" TEXT,
    "status" "MatterStatus" NOT NULL DEFAULT 'Active',
    "onHoldReason" TEXT,
    "reviewDate" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Matter_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Matter_id_firmId_key" ON "Matter"("id", "firmId");
CREATE UNIQUE INDEX "Matter_firmId_matterNumber_key" ON "Matter"("firmId", "matterNumber");
CREATE INDEX "Matter_firmId_status_lastActivityAt_idx" ON "Matter"("firmId", "status", "lastActivityAt");
CREATE INDEX "Matter_firmId_responsibleId_status_idx" ON "Matter"("firmId", "responsibleId", "status");
CREATE INDEX "Matter_firmId_matterType_stage_idx" ON "Matter"("firmId", "matterType", "stage");
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_responsibleId_firmId_fkey" FOREIGN KEY ("responsibleId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Matter" ADD CONSTRAINT "Matter_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "stage" TEXT,
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "status" "TaskStatus" NOT NULL DEFAULT 'Open',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_id_firmId_key" ON "Task"("id", "firmId");
CREATE INDEX "Task_firmId_assignedToId_status_dueAt_idx" ON "Task"("firmId", "assignedToId", "status", "dueAt");
CREATE INDEX "Task_firmId_matterId_status_dueAt_idx" ON "Task"("firmId", "matterId", "status", "dueAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_assignedToId_firmId_fkey" FOREIGN KEY ("assignedToId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_completedById_firmId_fkey" FOREIGN KEY ("completedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "MatterNote" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatterNote_firmId_matterId_createdAt_idx" ON "MatterNote"("firmId", "matterId", "createdAt");
ALTER TABLE "MatterNote" ADD CONSTRAINT "MatterNote_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterNote" ADD CONSTRAINT "MatterNote_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterNote" ADD CONSTRAINT "MatterNote_authorId_firmId_fkey" FOREIGN KEY ("authorId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "MatterActivity" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatterActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MatterActivity_firmId_matterId_createdAt_idx" ON "MatterActivity"("firmId", "matterId", "createdAt");
ALTER TABLE "MatterActivity" ADD CONSTRAINT "MatterActivity_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterActivity" ADD CONSTRAINT "MatterActivity_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MatterActivity" ADD CONSTRAINT "MatterActivity_actorId_firmId_fkey" FOREIGN KEY ("actorId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

CREATE TABLE "DocumentReference" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentReference_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentReference_firmId_matterId_createdAt_idx" ON "DocumentReference"("firmId", "matterId", "createdAt");
ALTER TABLE "DocumentReference" ADD CONSTRAINT "DocumentReference_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentReference" ADD CONSTRAINT "DocumentReference_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentReference" ADD CONSTRAINT "DocumentReference_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TaskNudge" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaskNudge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaskNudge_firmId_recipientId_createdAt_idx" ON "TaskNudge"("firmId", "recipientId", "createdAt");
CREATE INDEX "TaskNudge_firmId_taskId_createdAt_idx" ON "TaskNudge"("firmId", "taskId", "createdAt");
ALTER TABLE "TaskNudge" ADD CONSTRAINT "TaskNudge_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskNudge" ADD CONSTRAINT "TaskNudge_taskId_firmId_fkey" FOREIGN KEY ("taskId", "firmId") REFERENCES "Task"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskNudge" ADD CONSTRAINT "TaskNudge_senderId_firmId_fkey" FOREIGN KEY ("senderId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskNudge" ADD CONSTRAINT "TaskNudge_recipientId_firmId_fkey" FOREIGN KEY ("recipientId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
