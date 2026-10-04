export function describeError(error: unknown) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const name = error instanceof Error ? error.name : typeof error;
  const code = typeof record.code === "string" ? record.code : typeof record.errorCode === "string" ? record.errorCode : undefined;
  return code ? `${name} ${code}` : name;
}

// Logs only the step and the error name or code, never messages or user data.
export function logFailure(scope: string, step: string, error: unknown) {
  console.error(`[${scope}] failed at step "${step}": ${describeError(error)}`);
}

const checks: Array<[string, (value: string) => boolean]> = [
  ["DATABASE_URL", (v) => /^postgres(ql)?:\/\/[^\s@]+@[^\s/:]+:\d+\/\S+$/.test(v)],
  ["DIRECT_URL", (v) => /^postgres(ql)?:\/\/[^\s@]+@[^\s/:]+:\d+\/\S+$/.test(v)],
  ["APP_URL", (v) => /^https?:\/\/[^\s/]+[^\s]*$/.test(v) && !v.endsWith("/")],
  ["OWNER_CODE_HMAC_KEY", (v) => /^[0-9a-fA-F]{64,}$/.test(v)],
  ["SENSITIVE_DATA_ENCRYPTION_KEY", (v) => /^[0-9a-fA-F]{64}$/.test(v)],
  ["RESEND_API_KEY", (v) => /^re_\S+$/.test(v)],
  ["EMAIL_FROM", (v) => /^([^<>]+<[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.test(v.trim())],
  ["SUPPORT_EMAIL", (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)],
];

export function checkEnvironment() {
  const missing: string[] = [];
  const invalid: string[] = [];
  for (const [name, valid] of checks) {
    const value = process.env[name];
    if (!value) missing.push(name);
    else if (!valid(value)) invalid.push(name);
  }
  if (missing.length) console.error(`[env] missing variables: ${missing.join(", ")}`);
  if (invalid.length) console.error(`[env] variables with an invalid format: ${invalid.join(", ")}`);
  return { missing, invalid };
}