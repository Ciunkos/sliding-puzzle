// Lets Node import .tsx files: transpiles them on demand to plain React calls.
// Node strips types from .ts on its own but refuses .tsx, so tests could not load components.
// Usage: node --import ./scripts/tsx-hooks.js ...
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import ts from 'typescript';

const compilerOptions = {
  jsx: ts.JsxEmit.ReactJSX,
  module: ts.ModuleKind.ESNext,
  target: ts.ScriptTarget.ES2023,
  verbatimModuleSyntax: true,
  inlineSourceMap: true,
  inlineSources: true,
};

registerHooks({
  load(url, context, nextLoad) {
    const { pathname } = new URL(url);
    if (!pathname.endsWith('.tsx')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions,
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});
