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

const loadDependency = createRequire(import.meta.url);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));

function loadSource(relativePath, mocks = {}) {
  const filename = path.join(testDirectory, "..", relativePath);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : loadDependency(name),
  }, { filename });
  return exports;
}

const cn = (...values) => values.filter(Boolean).join(" ");
const styles = {
  root: "root",
  small: "small",
  medium: "medium",
  large: "large",
  inline: "inline",
  center: "center",
  page: "page",
  brand: "brand",
  current: "current",
  ring: "ring",
};
const { LoadingSpinner } = loadSource("src/components/ui/loading-spinner.tsx", {
  "@/lib/cn": { cn },
  "./loading-spinner.module.css": styles,
});

test("loader exposes accessible loading semantics and the branded ring", () => {
  const html = renderToStaticMarkup(React.createElement(LoadingSpinner, { size: "small", label: "Sending message" }));

  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-label="Sending message"/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /class="root small inline brand"/);
  assert.match(html, /class="ring" aria-hidden="true"/);
  assert.doesNotMatch(html, /<svg|data-phase/);
});

test("button loaders can be decorative when the button owns the busy state", () => {
  const html = renderToStaticMarkup(React.createElement(LoadingSpinner, { announce: false, tone: "current" }));

  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /class="root medium inline current"/);
  assert.doesNotMatch(html, /role="status"|aria-live=|aria-label=|aria-busy=/);
});

test("all size and placement variants preserve their layout classes", () => {
  for (const size of ["small", "medium", "large"]) {
    for (const placement of ["inline", "center", "page"]) {
      const html = renderToStaticMarkup(React.createElement(LoadingSpinner, { size, placement }));
      assert.match(html, new RegExp(`class="root ${size} ${placement} brand"`));
    }
  }
});

test("CSS uses a thin rotating ring and preserves centered loading contexts", () => {
  const css = fs.readFileSync(path.join(testDirectory, "../src/components/ui/loading-spinner.module.css"), "utf8");

  assert.match(css, /\.ring[\s\S]*border:\s*var\(--spinner-stroke\) solid/);
  assert.match(css, /border-top-color:\s*currentColor/);
  assert.match(css, /@keyframes spinner-rotate[\s\S]*transform:\s*rotate\(360deg\)/);
  assert.match(css, /\.center,[\s\S]*\.page[\s\S]*place-items:\s*center/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ring[\s\S]*animation:\s*none !important/);
  assert.doesNotMatch(css, /cod-wait|cod-draw|stroke-dash/);
});
