import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ActionError } from "./errors.ts";

const scrypt = promisify(scryptCallback);

export function randomToken() {
  return randomBytes(32).toString("base64url");
}

export function randomVerificationCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashVerificationCode(value: string) {
  const key = process.env.OWNER_CODE_HMAC_KEY;
  if (!key || !/^[0-9a-f]{64,}$/i.test(key) || key.length % 2 !== 0) {
    throw new ActionError("Owner verification is not configured. Set OWNER_CODE_HMAC_KEY to at least 32 random bytes encoded as hexadecimal.");
  }
  return createHmac("sha256", Buffer.from(key, "hex")).update(value).digest("hex");
}

export async function hashPassword(password: string) {
  if (password.length < 12) throw new ActionError("Password must contain at least 12 characters.");
  if (password.length > 1024) throw new ActionError("Password must contain no more than 1024 characters.");
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (password.length > 1024) return false;
  const [salt, hash] = stored.split(":");
  if (!salt || !/^[0-9a-f]{128}$/i.test(hash ?? "")) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function required(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.trim()) throw new ActionError(`${label} is required.`);
  return value.trim();
}

export function requiredSecret(value: FormDataEntryValue | null, label: string) {
  if (typeof value !== "string" || !value.length) throw new ActionError(`${label} is required.`);
  return value;
}

export function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
