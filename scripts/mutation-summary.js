// Summarizes a Stryker JSON report (reports/mutation/mutation.json) and gates CI on it.
// Usage: node scripts/mutation-summary.js [--report <path>] [--floor <n>] [--changed-lines <path>]
//   --floor <n>           fail when any file's mutation score is below n (default 0 = off)
//   --changed-lines <p>   JSON {"src/x.ts": [12, 13]}: fail when a survivor touches a changed line
// Always fails when a survived or uncovered mutant empties a whole function body (pseudo-tested function).
// Writes the table to $GITHUB_STEP_SUMMARY when it is set.
import { appendFileSync, readFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { z } from 'zod';

const position = z.object({ line: z.number().int(), column: z.number().int() });

const mutantSchema = z.object({
  id: z.string(),
  mutatorName: z.string(),
  replacement: z.string().optional(),
  status: z.enum([
    'Killed',
    'Survived',
    'NoCoverage',
    'Timeout',
    'CompileError',
    'RuntimeError',
    'Ignored',
    'Pending',
  ]),
  location: z.object({ start: position, end: position }),
});

const reportSchema = z.object({
  files: z.record(z.string(), z.object({ source: z.string(), mutants: z.array(mutantSchema) })),
});

const changedLinesSchema = z.record(z.string(), z.array(z.number().int().positive()));

/** @typedef {z.infer<typeof reportSchema>} Report */
/** @typedef {z.infer<typeof mutantSchema>} Mutant */
/** @typedef {Record<string, number[]>} ChangedLines */
/** @typedef {{ file: string, killed: number, survived: number, noCoverage: number, timeout: number, score: number | null }} FileRow */
/** @typedef {{ file: string, line: number, column: number, endLine: number, mutatorName: string, replacement: string, status: string }} MutantRef */

/** @param {unknown} json @returns {Report} */
export function parseReport(json) {
  return reportSchema.parse(json);
}

/** @param {unknown} json @returns {ChangedLines} */
export function parseChangedLines(json) {
  const parsed = changedLinesSchema.parse(json);
  return Object.fromEntries(
    Object.entries(parsed).map(([file, lines]) => [normalizePath(file), lines]),
  );
}

/** @param {string} file */
function normalizePath(file) {
  return file.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Per-file counts. Score follows Stryker: (killed + timeout) / (killed + timeout + survived + no coverage),
 * as a percentage; null when the file has no valid mutants.
 * @param {Report} report
 * @returns {FileRow[]}
 */
export function fileRows(report) {
  return Object.entries(report.files)
    .map(([file, { mutants }]) => {
      const count = (/** @type {string} */ status) =>
        mutants.filter((m) => m.status === status).length;
      const killed = count('Killed');
      const survived = count('Survived');
      const noCoverage = count('NoCoverage');
      const timeout = count('Timeout');
      const valid = killed + survived + noCoverage + timeout;
      const score = valid === 0 ? null : Math.round(((killed + timeout) / valid) * 10000) / 100;
      return { file: normalizePath(file), killed, survived, noCoverage, timeout, score };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * @param {Report} report
 * @param {readonly string[]} statuses
 * @returns {MutantRef[]}
 */
function mutantsWithStatus(report, statuses) {
  return Object.entries(report.files)
    .flatMap(([file, { mutants }]) =>
      mutants
        .filter((m) => statuses.includes(m.status))
        .map((m) => ({
          file: normalizePath(file),
          line: m.location.start.line,
          column: m.location.start.column,
          endLine: m.location.end.line,
          mutatorName: m.mutatorName,
          replacement: oneLine(m.replacement ?? ''),
          status: m.status,
        })),
    )
    .sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}

/** @param {string} text */
function oneLine(text) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 80 ? `${flat.slice(0, 77)}...` : flat;
}

/** @param {Report} report */
export function survivors(report) {
  return mutantsWithStatus(report, ['Survived']);
}

const CONTROL_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'with']);

/**
 * Heuristic: is the `{` at the 1-based (line, column) the body of a function?
 * True for `=> {`, and for `name(...) {` / `function (...) {` / `name(...): Type {` unless `name` is a
 * control keyword (if, for, while, switch, catch, with). False for else/try/finally/do and bare blocks.
 * @param {string} source
 * @param {{ line: number, column: number }} start
 */
export function isFunctionBody(source, start) {
  const lines = source.split('\n');
  if (start.line < 1 || start.line > lines.length) return false;
  const offset =
    lines.slice(0, start.line - 1).reduce((sum, l) => sum + l.length + 1, 0) + start.column - 1;
  if (source[offset] !== '{') return false;
  const before = source.slice(0, offset).trimEnd();
  if (before.endsWith('=>')) return true;
  const close = before.lastIndexOf(')');
  if (close === -1) return false;
  // Between `)` and `{` only an optional return type annotation is allowed.
  if (!/^\s*(:[^;{}()=]*)?$/.test(before.slice(close + 1))) return false;
  let depth = 0;
  let open = -1;
  for (let i = close; i >= 0; i--) {
    if (before[i] === ')') depth++;
    else if (before[i] === '(') depth--;
    if (depth === 0) {
      open = i;
      break;
    }
  }
  if (open === -1) return false;
  // `function* (` and `name<T>(` put a non-word char before `(`; skip it to reach the keyword or name.
  const head = before
    .slice(0, open)
    .replace(/(\*|<[^<>()]*>)\s*$/, '')
    .trimEnd();
  const last = /[A-Za-z_$][\w$]*$/.exec(head)?.[0];
  if (last === undefined) return false;
  if (CONTROL_KEYWORDS.has(last)) return false;
  if (last === 'await' && /\bfor\s+await$/.test(head)) return false;
  return true;
}

/**
 * Survived or uncovered mutants that replace a whole function body with `{}`:
 * the function can be emptied and no test notices.
 * @param {Report} report
 * @returns {MutantRef[]}
 */
export function pseudoTestedFunctions(report) {
  return mutantsWithStatus(report, ['Survived', 'NoCoverage']).filter((ref) => {
    if (ref.mutatorName !== 'BlockStatement') return false;
    const entry = Object.entries(report.files).find(([file]) => normalizePath(file) === ref.file);
    return entry !== undefined && isFunctionBody(entry[1].source, ref);
  });
}

/**
 * @param {FileRow[]} rows
 * @param {number} floor
 */
export function filesBelowFloor(rows, floor) {
  if (floor <= 0) return [];
  return rows.filter((row) => row.score !== null && row.score < floor);
}

/**
 * Survivors whose span (start line..end line) includes a changed line of the same file.
 * @param {MutantRef[]} refs
 * @param {ChangedLines} changedLines
 */
export function survivorsOnChangedLines(refs, changedLines) {
  return refs.filter((ref) => {
    const lines = changedLines[ref.file] ?? [];
    return lines.some((line) => line >= ref.line && line <= ref.endLine);
  });
}

/** @param {MutantRef} ref */
function describe(ref) {
  return `${ref.file}:${String(ref.line)}:${String(ref.column)} ${ref.mutatorName} -> ${ref.replacement || '(removed)'}`;
}

/** @param {FileRow[]} rows */
export function formatTable(rows) {
  const header =
    '| File | Killed | Survived | No coverage | Timeout | Score |\n|---|---:|---:|---:|---:|---:|';
  const body = rows.map(
    (r) =>
      `| ${r.file} | ${String(r.killed)} | ${String(r.survived)} | ${String(r.noCoverage)} | ${String(r.timeout)} | ${r.score === null ? 'n/a' : `${r.score.toFixed(2)}%`} |`,
  );
  return [header, ...body].join('\n');
}

/**
 * @param {Report} report
 * @param {{ floor?: number, changedLines?: ChangedLines }} [options]
 */
export function summarize(report, options = {}) {
  const floor = options.floor ?? 0;
  const rows = fileRows(report);
  const survived = survivors(report);
  const pseudoTested = pseudoTestedFunctions(report);
  const belowFloor = filesBelowFloor(rows, floor);
  const onChangedLines = options.changedLines
    ? survivorsOnChangedLines(survived, options.changedLines)
    : [];

  const failures = [
    ...pseudoTested.map((ref) => `pseudo-tested function (${ref.status}): ${describe(ref)}`),
    ...belowFloor.map(
      (row) => `below floor ${String(floor)}%: ${row.file} at ${String(row.score)}%`,
    ),
    ...onChangedLines.map((ref) => `survivor on a changed line: ${describe(ref)}`),
  ];

  const table = formatTable(rows);
  const survivorList = survived.length
    ? survived.map((ref) => `- ${describe(ref)}`).join('\n')
    : '- none';
  const verdict = failures.length
    ? `Mutation gate FAILED:\n${failures.map((f) => `- ${f}`).join('\n')}`
    : 'Mutation gate passed.';
  const text = `${table}\n\nSurvivors (${String(survived.length)}):\n${survivorList}\n\n${verdict}\n`;
  const markdown = `## Mutation testing\n\n${table}\n\n${verdict}\n`;

  return {
    rows,
    survivors: survived,
    pseudoTested,
    belowFloor,
    onChangedLines,
    failures,
    text,
    markdown,
    exitCode: failures.length ? 1 : 0,
  };
}

/** @param {string[]} argv */
export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      report: { type: 'string', default: 'reports/mutation/mutation.json' },
      floor: { type: 'string', default: '0' },
      'changed-lines': { type: 'string' },
    },
  });
  const floor = z.coerce.number().min(0).max(100).parse(values.floor);
  return { reportPath: values.report, floor, changedLinesPath: values['changed-lines'] };
}

/** @param {string} path */
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const changedLines = args.changedLinesPath
    ? parseChangedLines(readJson(args.changedLinesPath))
    : undefined;
  const result = summarize(parseReport(readJson(args.reportPath)), {
    floor: args.floor,
    changedLines,
  });
  process.stdout.write(result.text);
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, result.markdown);
  process.exitCode = result.exitCode;
}

if (import.meta.main) main();
