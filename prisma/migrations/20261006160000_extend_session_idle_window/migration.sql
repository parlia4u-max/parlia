UPDATE "Session"
SET "expiresAt" = GREATEST("expiresAt", "lastActivityAt" + INTERVAL '14 days')
WHERE "expiresAt" > CURRENT_TIMESTAMP;