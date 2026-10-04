// Checks the database without keeping any data: connects, confirms the tables exist, and tries a rolled-back sign-up.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let step = "connect";
const rollback = new Error("rollback");
try {
  await db.$queryRaw`SELECT 1`;
  step = "tables-exist";
  await db.firm.count();
  await db.user.count();
  step = "rolled-back-sign-up";
  await db.$transaction(async (tx) => {
    const firm = await tx.firm.create({ data: { name: "Diagnostic firm" } });
    await tx.setupConfiguration.create({ data: { firmId: firm.id, draft: {}, published: {} } });
    const role = await tx.role.create({ data: { firmId: firm.id, name: "Owner", isTemplate: true } });
    await tx.user.create({ data: { firmId: firm.id, roleId: role.id, name: "Diagnostic", email: `diagnostic-${Date.now()}@invalid.example`, passwordHash: "x", isOwner: true } });
    throw rollback;
  });
} catch (error) {
  if (error === rollback) {
    console.log("OK: connection, tables and sign-up writes all work (nothing was saved).");
  } else {
    const e = error ?? {};
    console.error(`FAILED at step "${step}": ${e.name ?? "Error"} ${e.code ?? e.errorCode ?? ""}`);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
}