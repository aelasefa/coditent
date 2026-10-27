import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);

function loadSource(path, mocks) {
  const filename = new URL(path, import.meta.url);
  const { outputText } = ts.transpileModule(readFileSync(filename, "utf8"), {
    fileName: filename.pathname,
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  });
  const loadedModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, process,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  });
  return loadedModule.exports;
}

test("API uses the shared client and clears credentials only after successful revocation", async () => {
  const calls = [];
  let rejectRequest = true;
  const failure = { response: { status: 503 } };
  const client = {
    interceptors: { request: { use() {} }, response: { use() {} } },
    post: async (url) => {
      calls.push(url);
      if (rejectRequest) throw failure;
      return { data: { detail: "Logged out of all devices successfully." } };
    },
  };
  const { logoutAllDevices } = loadSource("../src/lib/api.ts", {
    axios: { create: () => client },
    "@/lib/asset-url": {},
    "@/lib/file-validation": {},
    "@/lib/constants": { AUTH_TOKEN_KEY: "test-token" },
    "@/lib/auth": {
      removeToken: () => calls.push("removeToken"),
      removeTrustedDevice: () => calls.push("removeTrustedDevice"),
    },
  });
  await assert.rejects(logoutAllDevices(), (error) => error === failure);
  assert.deepEqual(calls, ["/auth/logout-all-devices"]);
  rejectRequest = false;
  calls.length = 0;
  await logoutAllDevices();
  assert.deepEqual(calls, ["/auth/logout-all-devices", "removeToken", "removeTrustedDevice"]);
});

// Render the component with isolated hooks to exercise its event handlers without a DOM.
function setup({ role = "CANDIDATE", authenticated = true, request = async () => {} } = {}) {
  const slots = [];
  const events = [];
  let cursor = 0;
  const { LogoutAllDevices } = loadSource("../src/components/security/logout-all-devices.tsx", {
    react: {
      useState(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = initial;
        return [slots[index], (value) => { slots[index] = value; }];
      },
      useRef(initial) {
        const index = cursor++;
        if (!(index in slots)) slots[index] = { current: initial };
        return slots[index];
      },
    },
    "next/navigation": { useRouter: () => ({ replace: (url) => events.push(url) }) },
    "@tanstack/react-query": {
      useQuery: () => ({ data: authenticated ? { role } : undefined }),
      useQueryClient: () => ({ clear: () => events.push("clear-cache") }),
    },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dialog": { Dialog: "dialog" },
    "@/components/ui/toast": { useToast: () => ({ toast: () => events.push("success-toast") }) },
    "@/lib/api": { getMe() {}, logoutAllDevices: () => { events.push("request"); return request(); } },
    "@/lib/api-error": loadSource("../src/lib/api-error.ts", {}),
  });
  const render = () => { cursor = 0; return LogoutAllDevices(); };
  const dialog = () => render().props.children.find((child) => child.type === "dialog");
  const trigger = () => render().props.children.find((child) => child.type === "button");
  const confirm = () => dialog().props.footer.props.children[1].props.onClick();
  return { render, dialog, trigger, confirm, events };
}

test("signed-out users have no action; opening and cancelling never sends a request", () => {
  assert.equal(setup({ authenticated: false }).render(), null);
  const ui = setup();
  assert.equal(ui.dialog().props.open, false);
  ui.trigger().props.onClick();
  assert.equal(ui.dialog().props.open, true);
  ui.dialog().props.onClose();
  assert.equal(ui.dialog().props.open, false);
  assert.deepEqual(ui.events, []);
});

for (const role of ["CANDIDATE", "RECRUITER", "ADMIN"]) {
  test(`${role}: pending confirmation is locked, then success clears cache and redirects`, async () => {
    let resolveRequest;
    const ui = setup({ role, request: () => new Promise((resolve) => { resolveRequest = resolve; }) });
    ui.trigger().props.onClick();
    const result = ui.confirm();
    await ui.confirm();
    assert.deepEqual(ui.events, ["request"]);
    assert.equal(ui.dialog().props.footer.props.children[1].props.loading, true);
    assert.equal(ui.dialog().props.footer.props.children[0].props.disabled, true);
    ui.dialog().props.onClose();
    assert.equal(ui.dialog().props.open, true);
    resolveRequest();
    await result;
    assert.deepEqual(ui.events, ["request", "clear-cache", "success-toast", role === "ADMIN" ? "/admin/login" : "/login"]);
    assert.equal(ui.dialog().props.open, false);
  });
}

test("503 keeps the session UI and cache, announces the error, and allows a retry", async () => {
  let fail = true;
  const detail = "Could not revoke sessions because session storage is unavailable.";
  const ui = setup({ request: async () => {
    if (fail) throw { response: { status: 503, data: { detail } } };
  } });
  ui.trigger().props.onClick();
  await ui.confirm();
  assert.deepEqual(ui.events, ["request"]);
  assert.equal(ui.dialog().props.open, true);
  assert.equal(ui.dialog().props.footer.props.children[1].props.loading, false);
  const alert = ui.dialog().props.children.find((child) => child?.props?.role === "alert");
  assert.equal(alert.props.children, detail);
  fail = false;
  await ui.confirm();
  assert.deepEqual(ui.events, ["request", "request", "clear-cache", "success-toast", "/login"]);
});
