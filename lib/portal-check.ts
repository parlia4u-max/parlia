import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { hashVerificationCode } from "./security.ts";

const CHALLENGE_MINUTES = 30;

function sign(nonce: string, expires: number, answer: number) {
  return hashVerificationCode(`human-check:${nonce}:${expires}:${answer}`);
}

export function createHumanCheck(now = Date.now()) {
  const left = randomInt(2, 10);
  const right = randomInt(2, 10);
  const nonce = randomBytes(8).toString("hex");
  const expires = now + CHALLENGE_MINUTES * 60_000;
  return { question: `What is ${left} plus ${right}?`, token: `${nonce}.${expires}.${sign(nonce, expires, left + right)}` };
}

export function verifyHumanCheck(token: unknown, answer: unknown, now = Date.now()) {
  if (typeof token !== "string" || typeof answer !== "string") return false;
  const [nonce, expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  const number = Number(answer.trim());
  if (!nonce || !signature || !Number.isInteger(expires) || expires < now || !Number.isInteger(number)) return false;
  const expected = Buffer.from(sign(nonce, expires, number));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const ACCESS_REQUEST_LIMITS = { windowMinutes: 15, perIp: 5, perEmail: 3, perFirm: 30 } as const;

export function isRateLimited(counts: { ip: number; email: number; firm: number }) {
  return counts.ip >= ACCESS_REQUEST_LIMITS.perIp || counts.email >= ACCESS_REQUEST_LIMITS.perEmail || counts.firm >= ACCESS_REQUEST_LIMITS.perFirm;
}
