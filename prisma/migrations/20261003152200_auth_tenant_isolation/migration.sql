-- Populate new tenant keys before making them mandatory.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "User" AS u JOIN "Role" AS r ON r."id" = u."roleId"
    WHERE u."roleId" IS NOT NULL AND u."firmId" <> r."firmId"
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant constraints: a user is assigned a role from another firm.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "SupervisorLink" AS sl
    JOIN "User" AS member_user ON member_user."id" = sl."userId"
    JOIN "User" AS supervisor_user ON supervisor_user."id" = sl."supervisorId"
    WHERE member_user."firmId" <> supervisor_user."firmId"
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant constraints: a supervisor link crosses firms.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "Invitation" AS invite
    JOIN "User" AS inviter_user ON inviter_user."id" = invite."inviterId"
    JOIN "Role" AS invite_role ON invite_role."id" = invite."roleId"
    WHERE inviter_user."firmId" <> invite."firmId" OR invite_role."firmId" <> invite."firmId"
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant constraints: an invitation references a user or role from another firm.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "AuditLog" AS audit_log
    JOIN "User" AS audit_actor ON audit_actor."id" = audit_log."actorId"
    WHERE audit_log."actorId" IS NOT NULL AND audit_actor."firmId" <> audit_log."firmId"
  ) THEN
    RAISE EXCEPTION 'Cannot add tenant constraints: an audit log references an actor from another firm.';
  END IF;
END $$;

ALTER TABLE "RolePermission" ADD COLUMN "firm_id" TEXT;
ALTER TABLE "SupervisorLink" ADD COLUMN "firm_id" TEXT;
ALTER TABLE "Session" ADD COLUMN "firm_id" TEXT;
ALTER TABLE "LoginChallenge" ADD COLUMN "firm_id" TEXT;
ALTER TABLE "PasswordReset" ADD COLUMN "firm_id" TEXT;

UPDATE "RolePermission" AS rp
SET "firm_id" = r."firmId"
FROM "Role" AS r
WHERE rp."roleId" = r."id";

UPDATE "SupervisorLink" AS sl
SET "firm_id" = u."firmId"
FROM "User" AS u
WHERE sl."userId" = u."id";

UPDATE "Session" AS s
SET "firm_id" = u."firmId"
FROM "User" AS u
WHERE s."userId" = u."id";

UPDATE "LoginChallenge" AS lc
SET "firm_id" = u."firmId"
FROM "User" AS u
WHERE lc."userId" = u."id";

UPDATE "PasswordReset" AS pr
SET "firm_id" = u."firmId"
FROM "User" AS u
WHERE pr."userId" = u."id";

-- Existing codes used an unkeyed digest and must not remain valid after the format change.
DELETE FROM "LoginChallenge";

ALTER TABLE "RolePermission" ALTER COLUMN "firm_id" SET NOT NULL;
ALTER TABLE "SupervisorLink" ALTER COLUMN "firm_id" SET NOT NULL;
ALTER TABLE "Session" ALTER COLUMN "firm_id" SET NOT NULL;
ALTER TABLE "LoginChallenge" ALTER COLUMN "firm_id" SET NOT NULL;
ALTER TABLE "PasswordReset" ALTER COLUMN "firm_id" SET NOT NULL;

CREATE UNIQUE INDEX "User_id_firmId_key" ON "User"("id", "firmId");
CREATE UNIQUE INDEX "Role_id_firmId_key" ON "Role"("id", "firmId");

DROP INDEX "SupervisorLink_supervisorId_idx";
CREATE INDEX "SupervisorLink_firm_id_supervisorId_idx" ON "SupervisorLink"("firm_id", "supervisorId");
DROP INDEX "Session_userId_expiresAt_idx";
CREATE INDEX "Session_firm_id_userId_expiresAt_idx" ON "Session"("firm_id", "userId", "expiresAt");
DROP INDEX "LoginChallenge_userId_expiresAt_idx";
CREATE INDEX "LoginChallenge_firm_id_userId_expiresAt_idx" ON "LoginChallenge"("firm_id", "userId", "expiresAt");
CREATE INDEX "PasswordReset_firm_id_userId_expiresAt_idx" ON "PasswordReset"("firm_id", "userId", "expiresAt");

ALTER TABLE "User" DROP CONSTRAINT "User_roleId_fkey";
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_roleId_fkey";
ALTER TABLE "SupervisorLink" DROP CONSTRAINT "SupervisorLink_userId_fkey";
ALTER TABLE "SupervisorLink" DROP CONSTRAINT "SupervisorLink_supervisorId_fkey";
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_inviterId_fkey";
ALTER TABLE "Invitation" DROP CONSTRAINT "Invitation_roleId_fkey";
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";
ALTER TABLE "Session" DROP CONSTRAINT "Session_userId_fkey";
ALTER TABLE "LoginChallenge" DROP CONSTRAINT "LoginChallenge_userId_fkey";
ALTER TABLE "PasswordReset" DROP CONSTRAINT "PasswordReset_userId_fkey";

ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission"
  ADD CONSTRAINT "RolePermission_roleId_firm_id_fkey"
  FOREIGN KEY ("roleId", "firm_id") REFERENCES "Role"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupervisorLink"
  ADD CONSTRAINT "SupervisorLink_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupervisorLink"
  ADD CONSTRAINT "SupervisorLink_userId_firm_id_fkey"
  FOREIGN KEY ("userId", "firm_id") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupervisorLink"
  ADD CONSTRAINT "SupervisorLink_supervisorId_firm_id_fkey"
  FOREIGN KEY ("supervisorId", "firm_id") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User"
  ADD CONSTRAINT "User_roleId_firmId_fkey"
  FOREIGN KEY ("roleId", "firmId") REFERENCES "Role"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_inviterId_firmId_fkey"
  FOREIGN KEY ("inviterId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Invitation"
  ADD CONSTRAINT "Invitation_roleId_firmId_fkey"
  FOREIGN KEY ("roleId", "firmId") REFERENCES "Role"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;
ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_actorId_firmId_fkey"
  FOREIGN KEY ("actorId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session"
  ADD CONSTRAINT "Session_userId_firm_id_fkey"
  FOREIGN KEY ("userId", "firm_id") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LoginChallenge"
  ADD CONSTRAINT "LoginChallenge_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginChallenge"
  ADD CONSTRAINT "LoginChallenge_userId_firm_id_fkey"
  FOREIGN KEY ("userId", "firm_id") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PasswordReset"
  ADD CONSTRAINT "PasswordReset_firm_id_fkey"
  FOREIGN KEY ("firm_id") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PasswordReset"
  ADD CONSTRAINT "PasswordReset_userId_firm_id_fkey"
  FOREIGN KEY ("userId", "firm_id") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
