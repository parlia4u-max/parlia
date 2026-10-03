CREATE TABLE "SetupConfiguration" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "draft" JSONB NOT NULL,
    "published" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SetupConfiguration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SetupConfiguration_firmId_key" ON "SetupConfiguration"("firmId");
ALTER TABLE "SetupConfiguration"
    ADD CONSTRAINT "SetupConfiguration_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
