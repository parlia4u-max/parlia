import { PrismaClient } from "@prisma/client";
import { ActionError } from "@/lib/errors";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new ActionError("Database is not configured. Set DATABASE_URL to a PostgreSQL connection string.");
  }
  return globalForPrisma.prisma ?? (globalForPrisma.prisma = new PrismaClient());
}
