import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Only the in-memory CommonJS produced by TypeScript needs this loader.
const loadDependency = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function loadSource(relativePath, mocks = {}) {
  const filename = path.join(testDirectory, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : loadDependency(name),
  }, { filename });
  return exports;
}

function renderLayout(query) {
  const { default: Layout } = loadSource("src/app/chat/layout.tsx", {
    "@tanstack/react-query": { useQuery: () => query },
    "@/lib/api": { getMe: () => {}, logoutSession: () => {} },
    "@/lib/chat-workspace-identity": loadSource("src/lib/chat-workspace-identity.ts"),
    "@/components/shell/candidate-shell": {
      CandidateShell: ({ children }) => React.createElement("nav", { "data-shell": "candidate" }, children),
    },
    "@/components/shell/company-top-shell": {
      CompanyTopShell: ({ children, user }) => React.createElement("nav", { "data-shell": "company", "data-user": user.name }, children),
    },
  });
  return renderToStaticMarkup(React.createElement(Layout, null, "Conversation content"));
}

test("recruitment chat renders the company shell for company users and recruiters", () => {
  for (const role of ["COMPANY_USER", "RECRUITER"]) {
    const html = renderLayout({ data: { role, full_name: "Recruiter name" } });
    assert.match(html, /data-shell="company"/);
    assert.match(html, /company-theme/);
    assert.match(html, /Recruiter name/);
    assert.match(html, /Conversation content/);
    assert.doesNotMatch(html, /data-shell="candidate"/);
  }
});

test("candidate chat retains the candidate shell and conversation", () => {
  const html = renderLayout({ data: { role: "CANDIDATE" } });
  assert.match(html, /data-shell="candidate"/);
  assert.match(html, /Conversation content/);
  assert.doesNotMatch(html, /data-shell="company"/);
});

test("loading does not flash a candidate shell or mount the conversation", () => {
  const html = renderLayout({ isPending: true });
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /data-shell|Conversation content/);
});

test("failed identity requests show a retry instead of candidate navigation", () => {
  const html = renderLayout({ isError: true });
  assert.match(html, /role="alert"/);
  assert.match(html, /Try again/);
  assert.doesNotMatch(html, /data-shell|Conversation content/);
});
