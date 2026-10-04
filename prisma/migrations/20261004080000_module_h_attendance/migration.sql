CREATE TYPE "AttendanceEventType" AS ENUM (
  'ClockIn',
  'LunchStart',
  'LunchEnd',
  'ClockOut',
  'DutyCheckIn',
  'DutyCheckOut'
);

CREATE TABLE "AttendanceLocation" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "radiusMeters" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceLocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceLocation_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
  CONSTRAINT "AttendanceLocation_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180),
  CONSTRAINT "AttendanceLocation_radiusMeters_check" CHECK ("radiusMeters" BETWEEN 25 AND 2000)
);

CREATE TABLE "AttendanceDay" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceDay_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceEvent" (
  "id" TEXT NOT NULL,
  "firmId" TEXT NOT NULL,
  "dayId" TEXT NOT NULL,
  "type" "AttendanceEventType" NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locationId" TEXT NOT NULL,
  "locationName" TEXT NOT NULL,
  "siteLatitude" DOUBLE PRECISION NOT NULL,
  "siteLongitude" DOUBLE PRECISION NOT NULL,
  "radiusMeters" INTEGER NOT NULL,
  "dutyId" TEXT,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "accuracyMeters" DOUBLE PRECISION NOT NULL,
  "distanceMeters" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AttendanceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AttendanceEvent_gps_check" CHECK (
    "latitude" BETWEEN -90 AND 90 AND
    "longitude" BETWEEN -180 AND 180 AND
    "siteLatitude" BETWEEN -90 AND 90 AND
    "siteLongitude" BETWEEN -180 AND 180 AND
    "accuracyMeters" > 0 AND "accuracyMeters" <= 100 AND
    "distanceMeters" >= 0 AND
    "radiusMeters" BETWEEN 25 AND 2000 AND
    "distanceMeters" + "accuracyMeters" <= "radiusMeters"
  ),
  CONSTRAINT "AttendanceEvent_duty_type_check" CHECK (
    ("type" IN ('DutyCheckIn', 'DutyCheckOut') AND "dutyId" IS NOT NULL) OR
    ("type" NOT IN ('DutyCheckIn', 'DutyCheckOut') AND "dutyId" IS NULL)
  )
);

CREATE UNIQUE INDEX "AttendanceLocation_id_firmId_key" ON "AttendanceLocation"("id", "firmId");
CREATE UNIQUE INDEX "AttendanceLocation_firmId_name_key" ON "AttendanceLocation"("firmId", "name");
CREATE INDEX "AttendanceLocation_firmId_active_idx" ON "AttendanceLocation"("firmId", "active");
CREATE UNIQUE INDEX "AttendanceDay_id_firmId_key" ON "AttendanceDay"("id", "firmId");
CREATE UNIQUE INDEX "AttendanceDay_firmId_userId_workDate_key" ON "AttendanceDay"("firmId", "userId", "workDate");
CREATE INDEX "AttendanceDay_firmId_workDate_idx" ON "AttendanceDay"("firmId", "workDate");
CREATE UNIQUE INDEX "AttendanceEvent_id_firmId_key" ON "AttendanceEvent"("id", "firmId");
CREATE INDEX "AttendanceEvent_firmId_dayId_occurredAt_idx" ON "AttendanceEvent"("firmId", "dayId", "occurredAt");
CREATE INDEX "AttendanceEvent_firmId_locationId_occurredAt_idx" ON "AttendanceEvent"("firmId", "locationId", "occurredAt");
CREATE INDEX "AttendanceEvent_firmId_dutyId_occurredAt_idx" ON "AttendanceEvent"("firmId", "dutyId", "occurredAt");

ALTER TABLE "AttendanceLocation"
  ADD CONSTRAINT "AttendanceLocation_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceDay"
  ADD CONSTRAINT "AttendanceDay_firmId_fkey"
  FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceDay_userId_firmId_fkey"
  FOREIGN KEY ("userId", "firmId") REFERENCES "User"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceEvent"
  ADD CONSTRAINT "AttendanceEvent_dayId_firmId_fkey"
  FOREIGN KEY ("dayId", "firmId") REFERENCES "AttendanceDay"("id", "firmId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceEvent_locationId_firmId_fkey"
  FOREIGN KEY ("locationId", "firmId") REFERENCES "AttendanceLocation"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "AttendanceEvent_dutyId_firmId_fkey"
  FOREIGN KEY ("dutyId", "firmId") REFERENCES "DutyRecord"("id", "firmId") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "RolePermission" ("id", "firm_id", "roleId", "module", "level", "scope")
SELECT
  md5(random()::text || clock_timestamp()::text),
  r."firmId",
  r."id",
  'attendance',
  CASE lower(r."name")
    WHEN 'lawyer' THEN 'Edit'::"PermissionLevel"
    WHEN 'candidate attorney' THEN 'Edit'::"PermissionLevel"
    WHEN 'admin' THEN 'View'::"PermissionLevel"
    ELSE 'None'::"PermissionLevel"
  END,
  CASE lower(r."name")
    WHEN 'lawyer' THEN 'Team'::"PermissionScope"
    WHEN 'admin' THEN 'Firm'::"PermissionScope"
    ELSE 'Own'::"PermissionScope"
  END
FROM "Role" r
WHERE NOT EXISTS (
  SELECT 1 FROM "RolePermission" p
  WHERE p."roleId" = r."id" AND p."module" = 'attendance'
);

UPDATE "SetupConfiguration" s
SET
  "draft" = jsonb_set(
    s."draft",
    '{permissions,roles}',
    COALESCE((
      SELECT jsonb_agg(jsonb_set(
        role,
        '{permissions,attendance}',
        jsonb_build_object(
          'level', CASE lower(role->>'name')
            WHEN 'lawyer' THEN 'Edit'
            WHEN 'candidate attorney' THEN 'Edit'
            WHEN 'admin' THEN 'View'
            ELSE 'None'
          END,
          'scope', CASE lower(role->>'name')
            WHEN 'lawyer' THEN 'Team'
            WHEN 'admin' THEN 'Firm'
            ELSE 'Own'
          END
        ),
        true
      ))
      FROM jsonb_array_elements(s."draft"#>'{permissions,roles}') role
    ), '[]'::jsonb),
    true
  ),
  "published" = jsonb_set(
    s."published",
    '{permissions,roles}',
    COALESCE((
      SELECT jsonb_agg(jsonb_set(
        role,
        '{permissions,attendance}',
        jsonb_build_object(
          'level', CASE lower(role->>'name')
            WHEN 'lawyer' THEN 'Edit'
            WHEN 'candidate attorney' THEN 'Edit'
            WHEN 'admin' THEN 'View'
            ELSE 'None'
          END,
          'scope', CASE lower(role->>'name')
            WHEN 'lawyer' THEN 'Team'
            WHEN 'admin' THEN 'Firm'
            ELSE 'Own'
          END
        ),
        true
      ))
      FROM jsonb_array_elements(s."published"#>'{permissions,roles}') role
    ), '[]'::jsonb),
    true
  );
