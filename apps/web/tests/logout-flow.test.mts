import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const loadDependency = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function loadLogoutFlow(api: object, replace: (path: string) => void) {
  const filename = path.join(testDirectory, "../src/lib/logout-flow.ts");
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(
    compiled,
    {
      exports,
      require: (name: string) =>
        name === "@/lib/api" ? api : loadDependency(name),
      window: { location: { replace } },
    },
    { filename },
  );
  return exports.logoutAndRedirect as (options?: {
    redirectTo?: string;
    endCandidatePresence?: boolean;
  }) => Promise<void>;
}

test("candidate logout waits for session revocation but not advisory presence", async () => {
  const calls: string[] = [];
  const redirects: string[] = [];
  let finishLogout!: () => void;
  let finishPresence!: () => void;
  const logoutRequest = new Promise<void>((resolve) => { finishLogout = resolve; });
  const presenceRequest = new Promise<void>((resolve) => { finishPresence = resolve; });
  const logoutAndRedirect = loadLogoutFlow(
    {
      logoutSession: () => { calls.push("logout"); return logoutRequest; },
      getPresenceConnectionId: () => { calls.push("connection"); return "presence-id"; },
      endPresence: (id: string) => { calls.push(`presence:${id}`); return presenceRequest; },
    },
    (target) => redirects.push(target),
  );

  const operation = logoutAndRedirect({ endCandidatePresence: true });

  assert.deepEqual(calls, ["logout", "connection", "presence:presence-id"]);
  assert.deepEqual(redirects, []);
  finishLogout();
  await operation;
  assert.deepEqual(redirects, ["/login"]);
  finishPresence();
});

test("logout redirects after failures and skips candidate presence when unused", async () => {
  const calls: string[] = [];
  const redirects: string[] = [];
  const logoutAndRedirect = loadLogoutFlow(
    {
      logoutSession: async () => { calls.push("logout"); throw new Error("offline"); },
      getPresenceConnectionId: () => { calls.push("connection"); return "unused"; },
      endPresence: async () => { calls.push("presence"); },
    },
    (target) => redirects.push(target),
  );

  await logoutAndRedirect({ redirectTo: "/admin/login" });

  assert.deepEqual(calls, ["logout"]);
  assert.deepEqual(redirects, ["/admin/login"]);
});
