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
  return (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-imports');
}

const cases: [string, string, boolean][] = [
  ['src/game/store.ts', "import '../profile/store.ts';", true], // deep import
  ['src/game/store.ts', "import '../profile/index.ts';", false],
  ['src/profile/store.ts', "import '../game/index.ts';", true], // not in allowlist
  ['src/puzzle/board.ts', "import { z } from 'zod'; export { z };", true], // puzzle is pure
  ['src/puzzle/board.test.ts', "import 'node:test'; import 'node:assert/strict';", false], // tests may use the runner
  ['src/puzzle/board.test.ts', "import 'zod';", true],
  ['src/db/driver.ts', "import '../game/index.ts';", true],
  ['src/game/server.ts', "import '../game/client.tsx';", true], // server <-> client
  ['src/game/client.tsx', "import 'node:fs';", true],
  ['src/web/main.tsx', "import '../game/server.ts';", true],
  ['src/web/main.tsx', "import '../game/client.tsx';", false],
  ['src/server/create-app.ts', "import '../game/client.tsx';", true],
  ['src/server/create-app.ts', "import '../game/server.ts';", false],
  ['src/game/store.ts', "import '../server/create-app.ts';", true], // modules never import roots
];

for (const [file, code, shouldFail] of cases) {
  test(`${shouldFail ? 'rejects' : 'allows'}: ${file} <- ${code}`, async () => {
    const msgs = await lint(file, code);
    assert.equal(msgs.length > 0, shouldFail, JSON.stringify(msgs.map((m) => m.message)));
  });
}
