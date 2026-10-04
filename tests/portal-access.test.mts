import assert from "node:assert/strict";
import test from "node:test";
import { portalInviteStatus } from "../lib/portal-status.ts";
import { createHumanCheck, isRateLimited, verifyHumanCheck } from "../lib/portal-check.ts";
import { DEFAULT_PORTAL_SETTINGS, portalSettingsFromConfig, slugFromName, validatePortalSettings } from "../lib/portal-settings.ts";

process.env.OWNER_CODE_HMAC_KEY ||= "ab".repeat(32);
const day = 86_400_000;
const now = new Date("2026-01-20T00:00:00Z");

test("portal status covers each state", () => {
  const base = { activeAccessCount: 0, removedAccessCount: 0, latestInvitation: null, reminderDays: 3, now };
  assert.equal(portalInviteStatus(base).status, "Not invited");
  assert.equal(portalInviteStatus({ ...base, removedAccessCount: 1 }).status, "Access removed");
  assert.equal(portalInviteStatus({ ...base, activeAccessCount: 1 }).status, "Active");
  const fresh = portalInviteStatus({ ...base, latestInvitation: { createdAt: new Date(now.getTime() - day), expiresAt: new Date(now.getTime() + 6 * day), acceptedAt: null } });
  assert.equal(fresh.status, "Invited");
  assert.equal(fresh.needsReminder, false);
  const old = portalInviteStatus({ ...base, latestInvitation: { createdAt: new Date(now.getTime() - 4 * day), expiresAt: new Date(now.getTime() + 3 * day), acceptedAt: null } });
  assert.equal(old.needsReminder, true);
});

test("human check accepts only the signed answer", () => {
  const check = createHumanCheck();
  const [a, b] = check.question.match(/\d+/g)!.map(Number);
  assert.equal(verifyHumanCheck(check.token, String(a + b)), true);
  assert.equal(verifyHumanCheck(check.token, String(a + b + 1)), false);
  assert.equal(verifyHumanCheck(check.token, String(a + b), Date.now() + 3_600_000), false);
  assert.equal(verifyHumanCheck("x.1.y", "1"), false);
});

test("rate limits trigger per ip, email or firm", () => {
  assert.equal(isRateLimited({ ip: 0, email: 0, firm: 0 }), false);
  assert.equal(isRateLimited({ ip: 5, email: 0, firm: 0 }), true);
  assert.equal(isRateLimited({ ip: 0, email: 3, firm: 0 }), true);
  assert.equal(isRateLimited({ ip: 0, email: 0, firm: 30 }), true);
});

test("portal settings validate and default", () => {
  validatePortalSettings(DEFAULT_PORTAL_SETTINGS);
  assert.throws(() => validatePortalSettings({ ...DEFAULT_PORTAL_SETTINGS, inviteExpiryDays: 0 }));
  assert.throws(() => validatePortalSettings({ ...DEFAULT_PORTAL_SETTINGS, introVideoUrl: "http://x.test" }));
  assert.equal(portalSettingsFromConfig({}).inviteExpiryDays, 7);
  assert.equal(slugFromName("Smith & Sons Attorneys!"), "smith-sons-attorneys");
  assert.equal(slugFromName("!!!"), "firm");
});
