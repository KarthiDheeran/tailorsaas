import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

// Executes the actual TypeScript module with explicitly supplied boundary
// dependencies. This avoids using production credentials or Next request state.
export function loadSourceModule(relativePath, dependencies = {}) {
  const filename = new URL(`../${relativePath}`, import.meta.url);
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: filename.pathname,
  });
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  const require = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith("@/")) return {};
    return nativeRequire(name);
  };
  const execute = vm.runInThisContext(`(function(exports,require,module){${outputText}\n})`, { filename: filename.pathname });
  execute(module.exports, require, module);
  return module.exports;
}
