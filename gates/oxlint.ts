// Runs oxlint on throwaway fixture projects for the lint gate tests. A fixture is a temporary folder
// laid out like this repository (src/..., e2e/...), so the globs of the real config apply to it.
// oxlint has no Node API: the gate spawns the CLI and reads its JSON report.
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { z } from 'zod';

const ROOT = path.resolve(import.meta.dirname, '..');
const OXLINT = path.join(ROOT, 'node_modules/oxlint/bin/oxlint');
const CONFIG = path.join(ROOT, 'oxlint.config.ts');
const STANDARD = path.join(ROOT, 'lint/test-standard.js');

/**
 * `full`: the repository's oxlint.config.ts without type information (fixtures have no tsconfig).
 * `typed`: the repository's oxlint.config.ts as it is, with type information (its tsconfig.json).
 * `standard`: only the test-standard overrides, as the ESLint gate used only those config arrays.
 */
const CONFIGS = {
  full: `import config from ${JSON.stringify(CONFIG)};
export default { ...config, options: { ...config.options, typeAware: false } };
`,
  typed: `export { default } from ${JSON.stringify(CONFIG)};
`,
  standard: `import { PLUGIN_PATH, e2eStandard, productionLimits, testStandard } from ${JSON.stringify(STANDARD)};
export default {
  plugins: ['import'],
  jsPlugins: [PLUGIN_PATH],
  categories: { correctness: 'off' },
  options: { reportUnusedDisableDirectives: 'error' },
  overrides: [...testStandard, ...e2eStandard, ...productionLimits],
};
`,
};

const Diagnostic = z.object({
  /** `plugin(rule)`, e.g. `test-standard(literal-expected)`; absent for unused directives. */
  code: z.string().optional(),
  message: z.string(),
  help: z.string().optional(),
  filename: z.string(),
});
export type Diagnostic = z.infer<typeof Diagnostic>;
const Report = z.object({ diagnostics: z.array(Diagnostic) });

/** Reports without a rule code that are not parse errors. */
const NOT_A_RULE = /^(Unused (eslint|oxlint)-(disable|enable) directive|Error running JS plugin)/;

/** Message and help together: native rules put the config's custom message into `help`. */
export const text = (d: Diagnostic): string => (d.help ? `${d.message} ${d.help}` : d.message);

/**
 * Writes `files` into a new fixture project, lints `targets` (default: every file) and returns the
 * diagnostics. Throws when oxlint fails for another reason than lint errors.
 */
export async function lintFixture(
  files: Record<string, string>,
  config: keyof typeof CONFIGS,
  targets: string[] = Object.keys(files),
): Promise<Diagnostic[]> {
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'oxlint-gate-')));
  try {
    writeFileSync(path.join(dir, 'oxlint.config.ts'), CONFIGS[config]);
    if (config === 'typed') {
      // tsgolint, the type-aware linter, and the types it reads are found through node_modules.
      copyFileSync(path.join(ROOT, 'tsconfig.json'), path.join(dir, 'tsconfig.json'));
      symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'));
    }
    for (const [file, code] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
      writeFileSync(path.join(dir, file), code);
    }
    const args = [OXLINT, '-c', 'oxlint.config.ts', '--format=json', ...targets];
    const { status, stdout, stderr } = await run(args, dir);
    const parsed = Report.safeParse(safeJson(stdout));
    if (!parsed.success || (status !== 0 && parsed.data.diagnostics.length === 0)) {
      throw new Error(`oxlint failed (exit ${String(status)}):\n${stderr}\n${stdout}`);
    }
    // A snippet that does not parse is linted by no rule, so an "allows" case would pass for nothing.
    const unparsed = parsed.data.diagnostics.filter(
      (d) => d.code === undefined && !NOT_A_RULE.test(d.message),
    );
    if (unparsed.length > 0) {
      throw new Error(`oxlint could not parse a fixture:\n${unparsed.map(text).join('\n')}`);
    }
    return parsed.data.diagnostics;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Lints one snippet under a path inside the fixture project. */
export function lintSnippet(
  file: string,
  code: string,
  config: keyof typeof CONFIGS,
): Promise<Diagnostic[]> {
  return lintFixture({ [file]: code }, config);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function run(args: string[], cwd: string) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}
