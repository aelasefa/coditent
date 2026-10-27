import assert from "node:assert/strict";
import test from "node:test";

import {
  safeAdminNextDestination,
  safeNextDestination,
} from "../src/lib/auth-redirect.ts";

test("safe next destinations stay on the current origin", () => {
  assert.equal(safeNextDestination("/dashboard?tab=security"), "/dashboard?tab=security");
  assert.equal(safeNextDestination("https://evil.example"), null);
  assert.equal(safeNextDestination("//evil.example"), null);
  assert.equal(safeNextDestination("/\\evil.example"), null);
  assert.equal(safeNextDestination("/%5cevil.example"), null);
});

test("admin next destinations cannot leave the admin surface", () => {
  assert.equal(safeAdminNextDestination("/admin/users?active=true"), "/admin/users?active=true");
  assert.equal(safeAdminNextDestination("/dashboard"), null);
  assert.equal(safeAdminNextDestination("//evil.example/admin"), null);
});
