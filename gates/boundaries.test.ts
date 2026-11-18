import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

async function lint(filePath: string, code: string) {
  // Snippets use virtual file paths, so lint them without type information.
  const eslint = new ESLint({
    overrideConfig: [
      { languageOptions: { parserOptions: { projectService: false } } },
      tseslint.configs.disableTypeChecked,
    ],
  });
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter(
    (m) => m.ruleId?.endsWith('no-restricted-imports') === true,
  );
}

const cases: [string, string, boolean][] = [
  ['src/game/store.ts', "import '../profile/store.ts';", true], // deep import
  ['src/game/store.ts', "import '../profile/index.ts';", false],
  ['src/profile/store.ts', "import '../game/index.ts';", true], // not in allowlist
  ['src/game/engine.ts', "import '../puzzle/index.ts';", true], // the engine never knows a feature
  ['src/profile/store.ts', "import '../puzzle/index.ts';", true], // nor does any foundation
  ['src/puzzle/definition.ts', "import '../game/index.ts';", false], // a feature plugs into the engine
  ['src/puzzle/rules.ts', "import { z } from 'zod'; export { z };", true], // game rules are pure
  ['src/puzzle/definition.ts', "import { z } from 'zod'; export { z };", false],
  ['src/puzzle/rules.test.ts', "import '../test-support/grid.ts';", false], // tests may use test-support
  ['src/game/store.ts', "import '../test-support/db.ts';", true], // production code may not
  ['src/game/store.ts', "import fc from 'fast-check'; export { fc };", true],
  ['src/db/driver.ts', "import '../game/index.ts';", true],
  ['src/db/index.test.ts', "import '../test-support/d1.ts';", false], // db tests may use test-support
  ['src/db/driver.ts', "import '../test-support/d1.ts';", true],
  ['src/game/server.ts', "import '../game/client.tsx';", true], // server <-> client
  ['src/game/client.tsx', "import 'node:fs';", true],
  ['src/web/main.tsx', "import '../game/server.ts';", true],
  ['src/web/main.tsx', "import '../puzzle/client.tsx';", false],
  ['src/server/create-app.ts', "import '../game/client.tsx';", true],
  ['src/server/create-app.ts', "import '../puzzle/server.ts';", false],
  ['src/server/create-app.test.ts', "import '../test-support/db.ts';", false], // root tests may use test-support
  ['src/web/app.test.tsx', "import '../test-support/db.ts';", false],
  ['src/game/store.ts', "import '../server/create-app.ts';", true], // modules never import roots
];

for (const [file, code, shouldFail] of cases) {
  test(`${shouldFail ? 'rejects' : 'allows'}: ${file} <- ${code}`, async () => {
    const msgs = await lint(file, code);
    assert.equal(msgs.length > 0, shouldFail, JSON.stringify(msgs.map((m) => m.message)));
  });
}
