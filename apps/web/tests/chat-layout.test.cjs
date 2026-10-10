const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

function loadSource(relativePath, mocks = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
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
