ALTER TABLE "TeamEmployeeVote"
ALTER COLUMN "nomineeId" DROP NOT NULL,
ADD COLUMN "nomineeName" TEXT NOT NULL DEFAULT '',
ADD COLUMN "reason" TEXT NOT NULL DEFAULT '',
ADD COLUMN "anonymous" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "TeamEmployeeVote" vote
SET "nomineeName" = nominee."name"
FROM "User" nominee
WHERE vote."nomineeId" = nominee."id" AND vote."firmId" = nominee."firmId";

CREATE TABLE "TeamRecognitionSettings" (
  "firmId" TEXT NOT NULL,
  "dueDay" INTEGER NOT NULL DEFAULT 25,
  "dueTime" TEXT NOT NULL DEFAULT '17:00',
  "delegateId" TEXT,
  "externalNominees" JSONB NOT NULL DEFAULT '[]',
  "certificateLayout" TEXT NOT NULL DEFAULT 'modern',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TeamRecognitionSettings_pkey" PRIMARY KEY ("firmId"),
  CONSTRAINT "TeamRecognitionSettings_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TeamRecognitionPublication" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "winnerName" TEXT NOT NULL,
  "voteCount" INTEGER NOT NULL,
  "certificateLayout" TEXT NOT NULL,
  "publishedById" TEXT NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamRecognitionPublication_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamRecognitionPublication_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TeamRecognitionPublication_firmId_period_key" ON "TeamRecognitionPublication"("firmId", "period");
CREATE UNIQUE INDEX "TeamRecognitionPublication_id_firmId_key" ON "TeamRecognitionPublication"("id", "firmId");
CREATE INDEX "TeamRecognitionPublication_firmId_publishedAt_idx" ON "TeamRecognitionPublication"("firmId", "publishedAt");