const DAY = 24 * 60 * 60 * 1000;

// emailCount 1 means only the first email went out; reminder N is due reminderDays[N-1] days after creation.
export function reminderDue(input: { createdAt: Date; emailCount: number; now: Date; reminderDays: number[]; reminderMax: number }) {
  const reminderIndex = input.emailCount - 1;
  if (input.emailCount < 1 || reminderIndex >= input.reminderMax || !input.reminderDays.length) return false;
  const days = input.reminderDays[Math.min(reminderIndex, input.reminderDays.length - 1)];
  return input.now.getTime() - input.createdAt.getTime() >= days * DAY;
}

// Notifications that need no action from the client are finished once the client has looked at them.
export const VIEW_ONLY_KINDS = ["NewUpdate", "NewDocument", "UploadReviewed", "Meeting"] as const;

export const KIND_LABELS: Record<string, string> = {
  NewUpdate: "New update",
  NewDocument: "New document",
  DocumentRequested: "Document requested",
  InvoicePublished: "Invoice published",
  Meeting: "Meeting",
  UploadReviewed: "Something you sent was reviewed",
};