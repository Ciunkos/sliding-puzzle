import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fileRows,
  filesBelowFloor,
  isFunctionBody,
  parseChangedLines,
  parseCliArgs,
  parseReport,
  pseudoTestedFunctions,
  summarize,
  survivors,
  survivorsOnChangedLines,
} from './mutation-summary.js';

/** Builds a mutant at (line, column) .. (endLine, 2). */
function mutant(id, status, mutatorName, line, column, replacement = 'x', endLine = line) {
  return {
    id,
    status,
    mutatorName,
    replacement,
    location: { start: { line, column }, end: { line: endLine, column: 2 } },
  };
}

// Line 1: function body. Line 2: arrow body. Line 3: if block. Line 4: plain code.
const SOURCE = [
  'export function f(a: number): number {',
  'const g = (x) => {',
  'if (a > 1) {',
  'return a + 1;',
].join('\n');

function report(mutants, source = SOURCE, file = 'src/a.ts') {
  return parseReport({ files: { [file]: { language: 'typescript', source, mutants } } });
}

test('fileRows counts statuses and scores (killed + timeout) / valid, ignoring errors', () => {
  const rows = fileRows(
    report([
      mutant('1', 'Killed', 'ArithmeticOperator', 4, 10),
      mutant('2', 'Timeout', 'ArithmeticOperator', 4, 10),
      mutant('3', 'Survived', 'ArithmeticOperator', 4, 10),
      mutant('4', 'NoCoverage', 'ArithmeticOperator', 4, 10),
      mutant('5', 'CompileError', 'ArithmeticOperator', 4, 10),
    ]),
  );
  assert.deepEqual(rows, [
    { file: 'src/a.ts', killed: 1, survived: 1, noCoverage: 1, timeout: 1, score: 50 },
  ]);
});

test('fileRows gives a null score to a file with no valid mutants', () => {
  assert.equal(fileRows(report([]))[0]?.score, null);
});

test('survivors lists only Survived mutants with file, line and replacement', () => {
  const refs = survivors(
    report([
      mutant('1', 'Killed', 'ArithmeticOperator', 4, 10, 'a - 1'),
      mutant('2', 'Survived', 'ArithmeticOperator', 4, 10, 'a   -\n 1'),
    ]),
  );
  assert.equal(refs.length, 1);
  assert.equal(refs[0]?.file, 'src/a.ts');
  assert.equal(refs[0]?.line, 4);
  assert.equal(refs[0]?.replacement, 'a - 1');
});

test('isFunctionBody: true for function and arrow bodies', () => {
  assert.equal(isFunctionBody(SOURCE, { line: 1, column: 38 }), true);
  assert.equal(isFunctionBody(SOURCE, { line: 2, column: 18 }), true);
  assert.equal(isFunctionBody('class A { m(x) { } }', { line: 1, column: 16 }), true);
  assert.equal(isFunctionBody('function* g<T>(a: T) {}', { line: 1, column: 22 }), true);
});

test('isFunctionBody: false for control-flow blocks and non-brace positions', () => {
  assert.equal(isFunctionBody(SOURCE, { line: 3, column: 12 }), false);
  assert.equal(isFunctionBody('try {} finally {}', { line: 1, column: 5 }), false);
  assert.equal(isFunctionBody('try {} catch (e) {}', { line: 1, column: 18 }), false);
  assert.equal(isFunctionBody('for await (const x of y) {}', { line: 1, column: 26 }), false);
  assert.equal(isFunctionBody(SOURCE, { line: 4, column: 1 }), false);
});

test('rule pseudo-tested: a survived or uncovered BlockStatement on a function body fails', () => {
  for (const status of ['Survived', 'NoCoverage']) {
    const r = report([mutant('1', status, 'BlockStatement', 1, 38, '{}', 4)]);
    assert.equal(pseudoTestedFunctions(r).length, 1, status);
    const result = summarize(r);
    assert.equal(result.exitCode, 1, status);
    assert.match(result.failures[0] ?? '', /pseudo-tested function/);
  }
});

test('rule pseudo-tested: killed function bodies, emptied if-blocks and other mutators pass', () => {
  const r = report([
    mutant('1', 'Killed', 'BlockStatement', 1, 38, '{}', 4),
    mutant('2', 'Timeout', 'BlockStatement', 2, 18, '{}', 4),
    mutant('3', 'Survived', 'BlockStatement', 3, 12, '{}', 4),
    mutant('4', 'Survived', 'ConditionalExpression', 1, 38, 'false'),
  ]);
  assert.deepEqual(pseudoTestedFunctions(r), []);
  assert.equal(summarize(r).exitCode, 0);
});

test('rule floor: a file below --floor fails', () => {
  const r = report([
    mutant('1', 'Killed', 'ArithmeticOperator', 4, 10),
    mutant('2', 'Survived', 'ArithmeticOperator', 4, 10),
  ]);
  assert.equal(filesBelowFloor(fileRows(r), 60).length, 1);
  const result = summarize(r, { floor: 60 });
  assert.equal(result.exitCode, 1);
  assert.match(result.failures[0] ?? '', /below floor 60%: src\/a\.ts at 50%/);
});

test('rule floor: at or above the floor passes, and floor 0 is off', () => {
  const r = report([
    mutant('1', 'Killed', 'ArithmeticOperator', 4, 10),
    mutant('2', 'Survived', 'ArithmeticOperator', 4, 10),
  ]);
  assert.equal(summarize(r, { floor: 50 }).exitCode, 0);
  assert.equal(summarize(r, { floor: 0 }).exitCode, 0);
  assert.equal(summarize(r).exitCode, 0);
  assert.deepEqual(
    filesBelowFloor(
      [{ file: 'x', killed: 0, survived: 0, noCoverage: 0, timeout: 0, score: null }],
      90,
    ),
    [],
  );
});

test('rule changed lines: a survivor whose span touches a changed line fails', () => {
  const r = report([mutant('1', 'Survived', 'ArithmeticOperator', 2, 10, 'x', 3)]);
  const changed = parseChangedLines({ './src/a.ts': [3] });
  assert.equal(survivorsOnChangedLines(survivors(r), changed).length, 1);
  const result = summarize(r, { changedLines: changed });
  assert.equal(result.exitCode, 1);
  assert.match(result.failures[0] ?? '', /survivor on a changed line: src\/a\.ts:2:10/);
});

test('rule changed lines: survivors off the changed lines, killed mutants on them, other files pass', () => {
  const r = report([
    mutant('1', 'Survived', 'ArithmeticOperator', 4, 10),
    mutant('2', 'Killed', 'ArithmeticOperator', 2, 10),
  ]);
  assert.equal(summarize(r, { changedLines: { 'src/a.ts': [1, 2, 3] } }).exitCode, 0);
  assert.equal(summarize(r, { changedLines: { 'src/b.ts': [4] } }).exitCode, 0);
  assert.equal(summarize(r).exitCode, 0, 'no changed-lines file: rule is off');
});

test('summarize text has the per-file table and the survivor list; markdown has the table', () => {
  const result = summarize(report([mutant('1', 'Survived', 'StringLiteral', 4, 10, '""')]));
  assert.match(result.text, /\| File \| Killed \| Survived \| No coverage \| Timeout \| Score \|/);
  assert.match(result.text, /\| src\/a\.ts \| 0 \| 1 \| 0 \| 0 \| 0\.00% \|/);
  assert.match(result.text, /- src\/a\.ts:4:10 StringLiteral -> ""/);
  assert.match(result.markdown, /\| src\/a\.ts \|/);
});

test('parseReport and parseChangedLines reject malformed input', () => {
  assert.throws(() => parseReport({ files: { 'a.ts': { mutants: [] } } }));
  assert.throws(() => parseChangedLines({ 'a.ts': ['3'] }));
});

test('parseCliArgs: defaults and explicit values', () => {
  assert.deepEqual(parseCliArgs([]), {
    reportPath: 'reports/mutation/mutation.json',
    floor: 0,
    changedLinesPath: undefined,
  });
  assert.deepEqual(
    parseCliArgs(['--floor', '75', '--changed-lines', 'c.json', '--report', 'r.json']),
    {
      reportPath: 'r.json',
      floor: 75,
      changedLinesPath: 'c.json',
    },
  );
  assert.throws(() => parseCliArgs(['--floor', 'abc']));
});
