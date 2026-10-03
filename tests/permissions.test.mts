import assert from "node:assert/strict";
import test from "node:test";
import { hasPermission, permissionScope } from "../lib/permissions.ts";

test("permission levels distinguish view and edit", () => {
  const user = {
    isOwner: false,
    role: { permissions: [{ module: "people", level: "View", scope: "Team" }] },
  };

  assert.equal(hasPermission(user, "people", "View"), true);
  assert.equal(hasPermission(user, "people", "Edit"), false);
  assert.equal(hasPermission(user, "settings", "View"), false);
});

test("owners bypass role restrictions and always have firm scope", () => {
  const owner = { isOwner: true, role: { permissions: [] } };

  assert.equal(hasPermission(owner, "settings", "Edit"), true);
  assert.equal(permissionScope(owner, "people"), "Firm");
});

test("missing or malformed scope is safely limited to own", () => {
  assert.equal(permissionScope({ isOwner: false }, "people"), "Own");
  assert.equal(
    permissionScope({ isOwner: false, role: { permissions: [{ module: "people", level: "View", scope: "invalid" }] } }, "people"),
    "Own",
  );
});
