export const DUTY_METHODS = ["In person", "E-filing", "Courier", "Post", "Email"] as const;

export type TracePolicy = {
  allowed: boolean;
  reason?: "maximum-attempts" | "wait-period";
  nextAllowedAt?: Date;
};

export function tracingPolicy({
  attemptCount,
  maxAttempts,
  waitDays,
  lastAttemptAt,
  startedAt,
}: {
  attemptCount: number;
  maxAttempts: number;
  waitDays: number;
  lastAttemptAt: Date | null;
  startedAt: Date;
}, now = new Date()): TracePolicy {
  if (attemptCount >= maxAttempts) return { allowed: false, reason: "maximum-attempts" };
  const referenceDate = lastAttemptAt ?? startedAt;
  const nextAllowedAt = new Date(referenceDate.getTime() + waitDays * 86_400_000);
  if (now.getTime() < nextAllowedAt.getTime()) return { allowed: false, reason: "wait-period", nextAllowedAt };
  return { allowed: true };
}

export function isDutyMethod(value: string): value is (typeof DUTY_METHODS)[number] {
  return (DUTY_METHODS as readonly string[]).includes(value);
}
