import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { ActionError } from "./errors.ts";

function encryptionKey() {
  const value = process.env.SENSITIVE_DATA_ENCRYPTION_KEY;
  if (!value || !/^[\da-fA-F]{64}$/.test(value)) {
    throw new ActionError("Sensitive HR data is unavailable until SENSITIVE_DATA_ENCRYPTION_KEY is configured as 32-byte hex.");
  }
  return Buffer.from(value, "hex");
}

export function encryptSensitive(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), authTag: cipher.getAuthTag().toString("base64") };
}

export function decryptSensitive(ciphertext: string, iv: string, authTag: string) {
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function fingerprintSensitive(value: string, scope: string) {
  return createHmac("sha256", encryptionKey()).update(scope).update("\0").update(value).digest("hex");
}
