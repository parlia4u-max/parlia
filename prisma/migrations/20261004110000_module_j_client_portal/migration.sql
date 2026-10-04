CREATE TYPE "ClientDocumentStatus" AS ENUM ('PendingReview', 'Accepted', 'Rejected');
CREATE TYPE "ClientPortalChallengePurpose" AS ENUM ('Login', 'PasswordReset');

CREATE TABLE "ClientPortalAccount" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClientPortalAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalInvitation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "clientId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalSession" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalChallenge" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "purpose" "ClientPortalChallengePurpose" NOT NULL DEFAULT 'Login',
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientMatterAccess" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ClientMatterAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientPortalUpdate" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalUpdate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ClientDocumentReference" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "matterId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "label" TEXT NOT NULL,
    "referenceUrl" TEXT NOT NULL,
    "status" "ClientDocumentStatus" NOT NULL DEFAULT 'PendingReview',
    "reviewNote" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "ClientDocumentReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientPortalAccount_id_firmId_key" ON "ClientPortalAccount"("id", "firmId");
CREATE UNIQUE INDEX "ClientPortalAccount_firmId_email_key" ON "ClientPortalAccount"("firmId", "email");
CREATE INDEX "ClientPortalAccount_firmId_active_idx" ON "ClientPortalAccount"("firmId", "active");
CREATE UNIQUE INDEX "ClientPortalInvitation_tokenHash_key" ON "ClientPortalInvitation"("tokenHash");
CREATE UNIQUE INDEX "ClientPortalInvitation_id_firmId_key" ON "ClientPortalInvitation"("id", "firmId");
CREATE INDEX "ClientPortalInvitation_firmId_email_expiresAt_idx" ON "ClientPortalInvitation"("firmId", "email", "expiresAt");
CREATE UNIQUE INDEX "ClientPortalSession_tokenHash_key" ON "ClientPortalSession"("tokenHash");
CREATE UNIQUE INDEX "ClientPortalSession_id_firmId_key" ON "ClientPortalSession"("id", "firmId");
CREATE INDEX "ClientPortalSession_firmId_clientId_expiresAt_idx" ON "ClientPortalSession"("firmId", "clientId", "expiresAt");
CREATE UNIQUE INDEX "ClientPortalChallenge_id_firmId_key" ON "ClientPortalChallenge"("id", "firmId");
CREATE INDEX "ClientPortalChallenge_firmId_clientId_expiresAt_idx" ON "ClientPortalChallenge"("firmId", "clientId", "expiresAt");
CREATE UNIQUE INDEX "ClientMatterAccess_id_firmId_key" ON "ClientMatterAccess"("id", "firmId");
CREATE UNIQUE INDEX "ClientMatterAccess_firmId_clientId_matterId_key" ON "ClientMatterAccess"("firmId", "clientId", "matterId");
CREATE INDEX "ClientMatterAccess_firmId_clientId_revokedAt_idx" ON "ClientMatterAccess"("firmId", "clientId", "revokedAt");
CREATE INDEX "ClientMatterAccess_firmId_matterId_revokedAt_idx" ON "ClientMatterAccess"("firmId", "matterId", "revokedAt");
CREATE UNIQUE INDEX "ClientPortalUpdate_id_firmId_key" ON "ClientPortalUpdate"("id", "firmId");
CREATE INDEX "ClientPortalUpdate_firmId_matterId_sharedAt_createdAt_idx" ON "ClientPortalUpdate"("firmId", "matterId", "sharedAt", "createdAt");
CREATE UNIQUE INDEX "ClientDocumentReference_id_firmId_key" ON "ClientDocumentReference"("id", "firmId");
CREATE INDEX "ClientDocumentReference_firmId_matterId_status_submittedAt_idx" ON "ClientDocumentReference"("firmId", "matterId", "status", "submittedAt");
CREATE INDEX "ClientDocumentReference_firmId_clientId_submittedAt_idx" ON "ClientDocumentReference"("firmId", "clientId", "submittedAt");

ALTER TABLE "ClientPortalAccount" ADD CONSTRAINT "ClientPortalAccount_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalInvitation"
  ADD CONSTRAINT "ClientPortalInvitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalInvitation_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalInvitation_senderId_firmId_fkey" FOREIGN KEY ("senderId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalInvitation_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalSession"
  ADD CONSTRAINT "ClientPortalSession_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalSession_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalChallenge"
  ADD CONSTRAINT "ClientPortalChallenge_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalChallenge_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMatterAccess"
  ADD CONSTRAINT "ClientMatterAccess_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientMatterAccess_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientMatterAccess_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientPortalUpdate"
  ADD CONSTRAINT "ClientPortalUpdate_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalUpdate_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientPortalUpdate_createdById_firmId_fkey" FOREIGN KEY ("createdById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientDocumentReference"
  ADD CONSTRAINT "ClientDocumentReference_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientDocumentReference_matterId_firmId_fkey" FOREIGN KEY ("matterId", "firmId") REFERENCES "Matter"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientDocumentReference_clientId_firmId_fkey" FOREIGN KEY ("clientId", "firmId") REFERENCES "ClientPortalAccount"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "ClientDocumentReference_reviewedById_firmId_fkey" FOREIGN KEY ("reviewedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;
