// The repository's oxlint config as a whole: type-aware rules run, the presets' options are kept,
// and the per-folder exceptions hold. Each case lints a snippet in a throwaway project.
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { lintSnippet } from './oxlint.ts';

/** The rule codes reported for `code` at `file`, with type information. */
async function codes(file: string, code: string): Promise<string[]> {
  const found = await lintSnippet(file, code, 'typed');
  return found.map((d) => d.code ?? `(no rule) ${d.message}`);
}

const FLOATING =
  'export async function load(): Promise<number> {\n  return Promise.resolve(1);\n}\n';

describe('type-aware rules (tsgolint)', () => {
  test('a promise left floating in production code is reported', async () => {
    const found = await codes(
      'src/game/flow.ts',
      `${FLOATING}export function go(): void {\n  load();\n}\n`,
    );
    assert.ok(found.includes('typescript(no-floating-promises)'), found.join('\n'));
  });

  test('a number in a template literal is reported, as strictTypeChecked sets it', async () => {
    const found = await codes(
      'src/game/flow.ts',
      'export const label = (n: number): string => `${n}`;\n',
    );
    assert.ok(found.includes('typescript(restrict-template-expressions)'), found.join('\n'));
  });

  test('tests and e2e specs may leave a promise floating', async () => {
    const code = `${FLOATING}export function go(): void {\n  load();\n}\n`;
    assert.ok(
      !(await codes('src/game/flow.test.ts', code)).includes('typescript(no-floating-promises)'),
    );
    assert.ok(
      !(await codes('e2e/support/flow.ts', code)).includes('typescript(no-floating-promises)'),
    );
  });

  test('plain JavaScript is not type-checked', async () => {
    const found = await codes('scripts/flow.js', 'export const n = JSON.parse("1") + 1;\n');
    assert.deepEqual(found, []);
  });
});

describe('the working rules of AGENTS.md', () => {
  test('no any, no non-null assertion, no console in modules', async () => {
    const found = await codes(
      'src/game/flow.ts',
      'export function f(a: any, b?: string): string {\n  console.log(a);\n  return b!;\n}\n',
    );
    assert.deepEqual(
      [
        'eslint(no-console)',
        'typescript(no-explicit-any)',
        'typescript(no-non-null-assertion)',
      ].filter((c) => !found.includes(c)),
      [],
    );
  });

  test('the console is allowed in the node entry point, config files and scripts', async () => {
    const code = "console.log('ready');\nexport {};\n";
    assert.deepEqual(await codes('src/server/node.ts', code), []);
    assert.deepEqual(await codes('vite.config.ts', code), []);
    assert.deepEqual(await codes('scripts/run.js', code), []);
  });

  test('a config file in another folder gets no console exemption', async () => {
    const found = await codes('src/game/flow.config.ts', "console.log('ready');\nexport {};\n");
    assert.ok(found.includes('eslint(no-console)'), found.join('\n'));
  });

  test('an unused variable is reported even when its name starts with _ (as in ESLint)', async () => {
    const found = await codes(
      'src/game/flow.ts',
      'export function f(): number {\n  const _x = 1;\n  return 2;\n}\n',
    );
    assert.ok(found.includes('eslint(no-unused-vars)'), found.join('\n'));
  });
});
