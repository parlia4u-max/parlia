import { getDb } from "@/lib/db";
import { getFirmPortalContext, sendBrandedEmail } from "@/lib/firm-portal";
import { hashToken, randomToken } from "@/lib/security";

type Db = ReturnType<typeof getDb>;

// Creates a single-use invitation addressed only to the email already on the matter record.
export async function createPortalInvitation(db: Db, params: {
  firmId: string;
  matterId: string;
  senderId: string;
  email: string;
  name: string;
  replacePending: boolean;
}) {
  const { settings } = await getFirmPortalContext(params.firmId);
  const token = randomToken();
  const invitation = await db.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Matter" WHERE "id" = ${params.matterId} AND "firmId" = ${params.firmId} FOR UPDATE`;
    const pending = { firmId: params.firmId, matterId: params.matterId, email: params.email, acceptedAt: null, expiresAt: { gt: new Date() } };
    if (params.replacePending) await tx.clientPortalInvitation.deleteMany({ where: pending });
    else if (await tx.clientPortalInvitation.findFirst({ where: pending, select: { id: true } })) {
      return null;
    }
    return tx.clientPortalInvitation.create({
      data: {
        firmId: params.firmId, matterId: params.matterId, senderId: params.senderId, email: params.email, name: params.name,
        tokenHash: hashToken(token), expiresAt: new Date(Date.now() + settings.inviteExpiryDays * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
  });
  if (!invitation) return null;
  try {
    await sendBrandedEmail(params.firmId, params.email, "You are invited to our client portal", "You are invited",
      [`Hello ${params.name},`, settings.invitationWording, `This link works once and expires in ${settings.inviteExpiryDays} days.`],
      { label: "Set up my portal access", path: `/client/invitation?token=${encodeURIComponent(token)}` });
  } catch (error) {
    await db.clientPortalInvitation.deleteMany({ where: { id: invitation.id, firmId: params.firmId, acceptedAt: null } });
    throw error;
  }
  return invitation;
}
