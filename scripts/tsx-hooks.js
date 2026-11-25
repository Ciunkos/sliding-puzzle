// Lets Node import .tsx files: transpiles them on demand to plain React calls.
// Node strips types from .ts on its own but refuses .tsx, so tests could not load components.
// oxc-transform does what `tsc` did here: the automatic JSX runtime (jsx: react-jsx), ES2023 output,
// type-only imports removed and every other import kept (verbatimModuleSyntax), an inline source map.
// Usage: node --import ./scripts/tsx-hooks.js ...
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import { transformSync } from 'oxc-transform';

const options = {
  lang: /** @type {const} */ ('tsx'),
  sourceType: /** @type {const} */ ('module'),
  target: 'es2023',
  jsx: { runtime: /** @type {const} */ ('automatic') },
  typescript: { onlyRemoveTypeImports: true },
  sourcemap: true,
};

/** @param {string} fileName @param {string} source */
function transpile(fileName, source) {
  const { code, map, errors } = transformSync(fileName, source, options);
  if (errors.length > 0) {
    throw new SyntaxError(`${fileName}: ${errors.map((e) => e.message).join('; ')}`);
  }
  const inline = Buffer.from(JSON.stringify(map)).toString('base64');
  return `${code}\n//# sourceMappingURL=data:application/json;base64,${inline}\n`;
}

registerHooks({
  load(url, context, nextLoad) {
    const { pathname } = new URL(url);
    if (!pathname.endsWith('.tsx')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const source = transpile(fileName, readFileSync(fileName, 'utf8'));
    return { format: 'module', source, shortCircuit: true };
  },
});
