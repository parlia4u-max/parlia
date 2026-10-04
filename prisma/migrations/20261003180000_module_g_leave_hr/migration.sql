-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('Annual', 'Sick', 'Study', 'FamilyResponsibility');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('Pending', 'Approved', 'Declined');

-- AlterTable
ALTER TABLE "CalendarEvent" ADD COLUMN     "leaveRequestId" TEXT;

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "coverId" TEXT,
    "approvedById" TEXT,
    "returnedById" TEXT,
    "type" "LeaveType" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "requestedDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'Pending',
    "formTemplate" TEXT NOT NULL DEFAULT 'A',
    "formSnapshot" JSONB NOT NULL,
    "decisionNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveTaskHandover" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "originalAssigneeId" TEXT NOT NULL,
    "coverId" TEXT NOT NULL,
    "taskSnapshot" JSONB NOT NULL,
    "restoredAt" TIMESTAMP(3),

    CONSTRAINT "LeaveTaskHandover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveProofTask" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "leaveRequestId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,

    CONSTRAINT "LeaveProofTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffProfile" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nextOfKinCiphertext" TEXT,
    "nextOfKinIv" TEXT,
    "nextOfKinTag" TEXT,
    "employmentStartDate" DATE,
    "onboardingDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingChecklistItem" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedById" TEXT,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HRDocument" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "documentTypeHash" TEXT NOT NULL,
    "encryptedMetadata" TEXT NOT NULL,
    "metadataIv" TEXT NOT NULL,
    "metadataAuthTag" TEXT NOT NULL,
    "encryptedContent" TEXT NOT NULL,
    "contentIv" TEXT NOT NULL,
    "contentAuthTag" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "resubmissionRequested" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HRDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAsset" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "assignedToId" TEXT,
    "assignedById" TEXT NOT NULL,
    "signedDeclaration" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "conditionAtIssue" TEXT NOT NULL,
    "signedDeclaration" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnedAt" TIMESTAMP(3),
    "returnCondition" TEXT,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordVaultEntry" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "encryptedMetadata" TEXT NOT NULL,
    "metadataIv" TEXT NOT NULL,
    "metadataAuthTag" TEXT NOT NULL,
    "encryptedSecret" TEXT NOT NULL,
    "secretIv" TEXT NOT NULL,
    "secretAuthTag" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordVaultEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeaveRequest_firmId_requesterId_status_startDate_idx" ON "LeaveRequest"("firmId", "requesterId", "status", "startDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_firmId_status_startDate_endDate_idx" ON "LeaveRequest"("firmId", "status", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveRequest_id_firmId_key" ON "LeaveRequest"("id", "firmId");

-- CreateIndex
CREATE INDEX "LeaveTaskHandover_firmId_coverId_restoredAt_idx" ON "LeaveTaskHandover"("firmId", "coverId", "restoredAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveTaskHandover_leaveRequestId_taskId_key" ON "LeaveTaskHandover"("leaveRequestId", "taskId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveProofTask_leaveRequestId_key" ON "LeaveProofTask"("leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveProofTask_taskId_key" ON "LeaveProofTask"("taskId");

-- CreateIndex
CREATE INDEX "LeaveProofTask_firmId_leaveRequestId_idx" ON "LeaveProofTask"("firmId", "leaveRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveProofTask_id_firmId_key" ON "LeaveProofTask"("id", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveProofTask_leaveRequestId_firmId_key" ON "LeaveProofTask"("leaveRequestId", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveProofTask_taskId_firmId_key" ON "LeaveProofTask"("taskId", "firmId");

-- CreateIndex
CREATE INDEX "StaffProfile_firmId_onboardingDueAt_idx" ON "StaffProfile"("firmId", "onboardingDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_userId_firmId_key" ON "StaffProfile"("userId", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffProfile_id_firmId_key" ON "StaffProfile"("id", "firmId");

-- CreateIndex
CREATE INDEX "OnboardingChecklistItem_firmId_profileId_completed_idx" ON "OnboardingChecklistItem"("firmId", "profileId", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingChecklistItem_profileId_name_key" ON "OnboardingChecklistItem"("profileId", "name");

-- CreateIndex
CREATE INDEX "HRDocument_firmId_subjectId_documentTypeHash_idx" ON "HRDocument"("firmId", "subjectId", "documentTypeHash");

-- CreateIndex
CREATE UNIQUE INDEX "HRDocument_subjectId_documentTypeHash_key" ON "HRDocument"("subjectId", "documentTypeHash");

-- CreateIndex
CREATE UNIQUE INDEX "HRDocument_id_firmId_key" ON "HRDocument"("id", "firmId");

-- CreateIndex
CREATE INDEX "EquipmentAsset_firmId_assignedToId_returnedAt_idx" ON "EquipmentAsset"("firmId", "assignedToId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentAsset_id_firmId_key" ON "EquipmentAsset"("id", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentAsset_firmId_serialNumber_key" ON "EquipmentAsset"("firmId", "serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_firmId_equipmentId_assignedAt_idx" ON "EquipmentAssignment"("firmId", "equipmentId", "assignedAt");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_firmId_userId_returnedAt_idx" ON "EquipmentAssignment"("firmId", "userId", "returnedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentAssignment_id_firmId_key" ON "EquipmentAssignment"("id", "firmId");

-- CreateIndex
CREATE INDEX "PasswordVaultEntry_firmId_createdAt_idx" ON "PasswordVaultEntry"("firmId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordVaultEntry_id_firmId_key" ON "PasswordVaultEntry"("id", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEvent_leaveRequestId_firmId_key" ON "CalendarEvent"("leaveRequestId", "firmId");

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_leaveRequestId_firmId_fkey" FOREIGN KEY ("leaveRequestId", "firmId") REFERENCES "LeaveRequest"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_requesterId_firmId_fkey" FOREIGN KEY ("requesterId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_coverId_firmId_fkey" FOREIGN KEY ("coverId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_firmId_fkey" FOREIGN KEY ("approvedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_returnedById_firmId_fkey" FOREIGN KEY ("returnedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTaskHandover" ADD CONSTRAINT "LeaveTaskHandover_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTaskHandover" ADD CONSTRAINT "LeaveTaskHandover_leaveRequestId_firmId_fkey" FOREIGN KEY ("leaveRequestId", "firmId") REFERENCES "LeaveRequest"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTaskHandover" ADD CONSTRAINT "LeaveTaskHandover_taskId_firmId_fkey" FOREIGN KEY ("taskId", "firmId") REFERENCES "Task"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTaskHandover" ADD CONSTRAINT "LeaveTaskHandover_originalAssigneeId_firmId_fkey" FOREIGN KEY ("originalAssigneeId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTaskHandover" ADD CONSTRAINT "LeaveTaskHandover_coverId_firmId_fkey" FOREIGN KEY ("coverId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveProofTask" ADD CONSTRAINT "LeaveProofTask_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveProofTask" ADD CONSTRAINT "LeaveProofTask_leaveRequestId_firmId_fkey" FOREIGN KEY ("leaveRequestId", "firmId") REFERENCES "LeaveRequest"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveProofTask" ADD CONSTRAINT "LeaveProofTask_taskId_firmId_fkey" FOREIGN KEY ("taskId", "firmId") REFERENCES "Task"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_profileId_firmId_fkey" FOREIGN KEY ("profileId", "firmId") REFERENCES "StaffProfile"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingChecklistItem" ADD CONSTRAINT "OnboardingChecklistItem_completedById_firmId_fkey" FOREIGN KEY ("completedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDocument" ADD CONSTRAINT "HRDocument_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HRDocument" ADD CONSTRAINT "HRDocument_subjectId_firmId_fkey" FOREIGN KEY ("subjectId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_assignedToId_firmId_fkey" FOREIGN KEY ("assignedToId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_assignedById_firmId_fkey" FOREIGN KEY ("assignedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_equipmentId_firmId_fkey" FOREIGN KEY ("equipmentId", "firmId") REFERENCES "EquipmentAsset"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_assignedById_firmId_fkey" FOREIGN KEY ("assignedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordVaultEntry" ADD CONSTRAINT "PasswordVaultEntry_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordVaultEntry" ADD CONSTRAINT "PasswordVaultEntry_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "SetupConfiguration"
SET "draft" = jsonb_set(
  "draft",
  '{leaveRules}',
  '{"studyLeaveDays":null,"familyResponsibilityDays":null,"leaveForms":[{"id":"A","title":"Leave request","accentColor":"#325c4b","footer":"Confidential staff record"},{"id":"B","title":"Leave request and approval","accentColor":"#325c4b","footer":"Confidential staff record"},{"id":"C","title":"Leave record","accentColor":"#325c4b","footer":"Confidential staff record"}]}'::jsonb
    || COALESCE("draft"->'leaveRules', '{}'::jsonb),
  true
),
"published" = jsonb_set(
  "published",
  '{leaveRules}',
  '{"studyLeaveDays":null,"familyResponsibilityDays":null,"leaveForms":[{"id":"A","title":"Leave request","accentColor":"#325c4b","footer":"Confidential staff record"},{"id":"B","title":"Leave request and approval","accentColor":"#325c4b","footer":"Confidential staff record"},{"id":"C","title":"Leave record","accentColor":"#325c4b","footer":"Confidential staff record"}]}'::jsonb
    || COALESCE("published"->'leaveRules', '{}'::jsonb),
  true
);
