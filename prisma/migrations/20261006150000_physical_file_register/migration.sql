ALTER TABLE "PhysicalFile"
ADD COLUMN "fileStatus" TEXT NOT NULL DEFAULT 'Open',
ADD COLUMN "storageStatus" TEXT NOT NULL DEFAULT 'InOffice',
ADD COLUMN "cupboard" TEXT,
ADD COLUMN "shelfRow" TEXT,
ADD COLUMN "shelfColumn" TEXT,
ADD COLUMN "outOfFilingLocation" TEXT;

UPDATE "PhysicalFile"
SET "fileStatus" = CASE WHEN "status" = 'Closed' THEN 'Closed' ELSE 'Open' END,
    "storageStatus" = CASE WHEN "status" = 'Closed' THEN 'Storage' ELSE 'InOffice' END;

INSERT INTO "PhysicalFile" (
  "id", "firmId", "matterId", "location", "folder", "status", "fileStatus", "storageStatus", "createdAt", "updatedAt"
)
SELECT
  'backfill-' || md5(m."id" || m."firmId"), m."firmId", m."id", '', '', 'InStorage', 'Open', 'InOffice', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Matter" m
LEFT JOIN "PhysicalFile" pf ON pf."firmId" = m."firmId" AND pf."matterId" = m."id"
WHERE pf."id" IS NULL;