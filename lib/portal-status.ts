export type PortalStatus = "Not invited" | "Invited" | "Active" | "Access removed";

export function portalInviteStatus(input: {
  activeAccessCount: number;
  removedAccessCount: number;
  latestInvitation: { createdAt: Date; expiresAt: Date; acceptedAt: Date | null } | null;
  reminderDays: number;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  if (input.activeAccessCount > 0) return { status: "Active" as PortalStatus, invitedAt: null, expired: false, needsReminder: false };
  const invitation = input.latestInvitation && !input.latestInvitation.acceptedAt ? input.latestInvitation : null;
  if (invitation) {
    const waitedDays = (now.getTime() - invitation.createdAt.getTime()) / 86_400_000;
    return {
      status: "Invited" as PortalStatus,
      invitedAt: invitation.createdAt,
      expired: invitation.expiresAt <= now,
      needsReminder: input.reminderDays > 0 && (invitation.expiresAt <= now || waitedDays >= input.reminderDays),
    };
  }
  if (input.removedAccessCount > 0) return { status: "Access removed" as PortalStatus, invitedAt: null, expired: false, needsReminder: false };
  return { status: "Not invited" as PortalStatus, invitedAt: null, expired: false, needsReminder: false };
}
