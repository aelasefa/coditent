import { readFile } from "node:fs/promises";
import ts from "typescript";

const TYPESCRIPT_MODULE = /\.(?:mts|ts|tsx)$/;

export async function load(url, context, nextLoad) {
  if (!TYPESCRIPT_MODULE.test(new URL(url).pathname)) {
    return nextLoad(url, context);
  }

  const source = await readFile(new URL(url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    fileName: new URL(url).pathname,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return { format: "module", source: outputText, shortCircuit: true };
}
