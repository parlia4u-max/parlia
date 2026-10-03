export function canInviteStaff(activeStaff: number, pendingInvitations: number, staffSeatLimit: number | null) {
  return staffSeatLimit === null || activeStaff + pendingInvitations < staffSeatLimit;
}
