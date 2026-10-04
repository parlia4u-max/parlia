CREATE TYPE "IntegrationProvider" AS ENUM ('GoogleCalendar', 'Microsoft365Calendar');

CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "connectedEmail" TEXT NOT NULL,
    "encryptedTokens" TEXT NOT NULL,
    "tokensIv" TEXT NOT NULL,
    "tokensAuthTag" TEXT NOT NULL,
    "scopes" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationOAuthState" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "stateHash" TEXT NOT NULL,
    "encryptedCodeVerifier" TEXT NOT NULL,
    "verifierIv" TEXT NOT NULL,
    "verifierAuthTag" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationOAuthState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationConnection_id_firmId_key" ON "IntegrationConnection"("id", "firmId");
CREATE UNIQUE INDEX "IntegrationConnection_firmId_provider_key" ON "IntegrationConnection"("firmId", "provider");
CREATE INDEX "IntegrationConnection_firmId_provider_accessTokenExpiresAt_idx" ON "IntegrationConnection"("firmId", "provider", "accessTokenExpiresAt");
CREATE UNIQUE INDEX "IntegrationOAuthState_stateHash_key" ON "IntegrationOAuthState"("stateHash");
CREATE UNIQUE INDEX "IntegrationOAuthState_id_firmId_key" ON "IntegrationOAuthState"("id", "firmId");
CREATE INDEX "IntegrationOAuthState_firmId_userId_expiresAt_idx" ON "IntegrationOAuthState"("firmId", "userId", "expiresAt");

ALTER TABLE "IntegrationConnection"
    ADD CONSTRAINT "IntegrationConnection_firmId_fkey"
        FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "IntegrationConnection_connectedById_firmId_fkey"
        FOREIGN KEY ("connectedById", "firmId") REFERENCES "User"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "IntegrationOAuthState"
    ADD CONSTRAINT "IntegrationOAuthState_firmId_fkey"
        FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "IntegrationOAuthState_userId_firmId_fkey"
        FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
