-- CreateTable
CREATE TABLE "TeamConversation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "title" TEXT,
    "kind" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamConversationMember" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamConversationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMessage" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "matterId" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMeeting" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "templateName" TEXT NOT NULL,
    "matterId" TEXT,
    "minutes" JSONB,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMeetingParticipant" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "TeamMeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMeetingActionItem" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSuggestion" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "submitterId" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamEmployeeVote" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "voterId" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamEmployeeVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamConversation_firmId_updatedAt_idx" ON "TeamConversation"("firmId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamConversation_id_firmId_key" ON "TeamConversation"("id", "firmId");

-- CreateIndex
CREATE INDEX "TeamConversationMember_firmId_userId_conversationId_idx" ON "TeamConversationMember"("firmId", "userId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamConversationMember_conversationId_userId_key" ON "TeamConversationMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "TeamMessage_firmId_conversationId_createdAt_idx" ON "TeamMessage"("firmId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamMessage_firmId_matterId_createdAt_idx" ON "TeamMessage"("firmId", "matterId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMessage_id_firmId_key" ON "TeamMessage"("id", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMessage_taskId_firmId_key" ON "TeamMessage"("taskId", "firmId");

-- CreateIndex
CREATE INDEX "TeamMeeting_firmId_startsAt_idx" ON "TeamMeeting"("firmId", "startsAt");

-- CreateIndex
CREATE INDEX "TeamMeeting_firmId_matterId_startsAt_idx" ON "TeamMeeting"("firmId", "matterId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMeeting_id_firmId_key" ON "TeamMeeting"("id", "firmId");

-- CreateIndex
CREATE INDEX "TeamMeetingParticipant_firmId_userId_meetingId_idx" ON "TeamMeetingParticipant"("firmId", "userId", "meetingId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMeetingParticipant_meetingId_userId_key" ON "TeamMeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE INDEX "TeamMeetingActionItem_firmId_meetingId_createdAt_idx" ON "TeamMeetingActionItem"("firmId", "meetingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMeetingActionItem_id_firmId_key" ON "TeamMeetingActionItem"("id", "firmId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMeetingActionItem_taskId_firmId_key" ON "TeamMeetingActionItem"("taskId", "firmId");

-- CreateIndex
CREATE INDEX "TeamSuggestion_firmId_status_createdAt_idx" ON "TeamSuggestion"("firmId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSuggestion_id_firmId_key" ON "TeamSuggestion"("id", "firmId");

-- CreateIndex
CREATE INDEX "TeamEmployeeVote_firmId_period_nomineeId_idx" ON "TeamEmployeeVote"("firmId", "period", "nomineeId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamEmployeeVote_firmId_period_voterId_key" ON "TeamEmployeeVote"("firmId", "period", "voterId");

-- AddForeignKey
ALTER TABLE "TeamConversation" ADD CONSTRAINT "TeamConversation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversation" ADD CONSTRAINT "TeamConversation_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversationMember" ADD CONSTRAINT "TeamConversationMember_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversationMember" ADD CONSTRAINT "TeamConversationMember_conversationId_firmId_fkey" FOREIGN KEY ("conversationId", "firmId") REFERENCES "TeamConversation"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamConversationMember" ADD CONSTRAINT "TeamConversationMember_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_conversationId_firmId_fkey" FOREIGN KEY ("conversationId", "firmId") REFERENCES "TeamConversation"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_senderId_firmId_fkey" FOREIGN KEY ("senderId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMessage" ADD CONSTRAINT "TeamMessage_taskId_firmId_fkey" FOREIGN KEY ("taskId", "firmId") REFERENCES "Task"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeeting" ADD CONSTRAINT "TeamMeeting_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeeting" ADD CONSTRAINT "TeamMeeting_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeeting" ADD CONSTRAINT "TeamMeeting_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingParticipant" ADD CONSTRAINT "TeamMeetingParticipant_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingParticipant" ADD CONSTRAINT "TeamMeetingParticipant_meetingId_firmId_fkey" FOREIGN KEY ("meetingId", "firmId") REFERENCES "TeamMeeting"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingParticipant" ADD CONSTRAINT "TeamMeetingParticipant_userId_firmId_fkey" FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingActionItem" ADD CONSTRAINT "TeamMeetingActionItem_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingActionItem" ADD CONSTRAINT "TeamMeetingActionItem_meetingId_firmId_fkey" FOREIGN KEY ("meetingId", "firmId") REFERENCES "TeamMeeting"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingActionItem" ADD CONSTRAINT "TeamMeetingActionItem_assignedToId_firmId_fkey" FOREIGN KEY ("assignedToId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMeetingActionItem" ADD CONSTRAINT "TeamMeetingActionItem_taskId_firmId_fkey" FOREIGN KEY ("taskId", "firmId") REFERENCES "Task"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSuggestion" ADD CONSTRAINT "TeamSuggestion_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSuggestion" ADD CONSTRAINT "TeamSuggestion_submitterId_firmId_fkey" FOREIGN KEY ("submitterId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEmployeeVote" ADD CONSTRAINT "TeamEmployeeVote_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEmployeeVote" ADD CONSTRAINT "TeamEmployeeVote_voterId_firmId_fkey" FOREIGN KEY ("voterId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamEmployeeVote" ADD CONSTRAINT "TeamEmployeeVote_nomineeId_firmId_fkey" FOREIGN KEY ("nomineeId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamSuggestion" ADD CONSTRAINT "TeamSuggestion_anonymous_submitter_check"
  CHECK (NOT "anonymous" OR "submitterId" IS NULL);
