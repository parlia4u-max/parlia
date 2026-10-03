import assert from "node:assert/strict";
import test from "node:test";
import { hashVerificationCode } from "../lib/security.ts";

test("owner code HMAC requires a configured high-entropy secret", () => {
  const original = process.env.OWNER_CODE_HMAC_KEY;
  try {
    delete process.env.OWNER_CODE_HMAC_KEY;
    assert.throws(() => hashVerificationCode("012345"), /OWNER_CODE_HMAC_KEY/);
    process.env.OWNER_CODE_HMAC_KEY = "abc123";
    assert.throws(() => hashVerificationCode("012345"), /OWNER_CODE_HMAC_KEY/);
  } finally {
    if (original === undefined) delete process.env.OWNER_CODE_HMAC_KEY;
    else process.env.OWNER_CODE_HMAC_KEY = original;
  }
});

test("owner code HMAC is keyed and deterministic", () => {
  const original = process.env.OWNER_CODE_HMAC_KEY;
  try {
    process.env.OWNER_CODE_HMAC_KEY = "1".repeat(64);
    const first = hashVerificationCode("012345");
    assert.equal(first, hashVerificationCode("012345"));
    process.env.OWNER_CODE_HMAC_KEY = "2".repeat(64);
    assert.notEqual(first, hashVerificationCode("012345"));
  } finally {
    if (original === undefined) delete process.env.OWNER_CODE_HMAC_KEY;
    else process.env.OWNER_CODE_HMAC_KEY = original;
  }
});
