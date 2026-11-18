// Measures the built app with Lighthouse: builds it, serves it with the Node server on a free port
// (a throwaway database), runs Lighthouse 5 times (mobile, its default throttling) in Playwright's
// Chromium, prints every run and the median, and exits 1 when a median misses its threshold.
// Usage: npm run lighthouse
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium } from '@playwright/test';
import { z } from 'zod';

/** Pinned: the version is part of what the numbers mean. */
const LIGHTHOUSE = 'lighthouse@13.5.0';
const RUNS = 5;
const DB_PATH = '.e2e/lighthouse.db';
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo'];
/** Scores are 0-100; CLS is unitless, TBT is in milliseconds. */
const THRESHOLDS = {
  performance: { min: 90 },
  accessibility: { min: 95 },
  'best-practices': { min: 95 },
  seo: { min: 90 },
  cls: { max: 0.1 },
};

const reportSchema = z.object({
  categories: z.record(z.string(), z.object({ score: z.number().nullable() })),
  audits: z.object({
    'cumulative-layout-shift': z.object({ numericValue: z.number() }),
    'total-blocking-time': z.object({ numericValue: z.number() }),
  }),
});

/** A port nobody listens on right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });
  });
}

async function waitForHealth(origin) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await globalThis.fetch(`${origin}/sliding-puzzle/api/health`);
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(100);
  }
  throw new Error(`the server at ${origin} did not answer its health check`);
}

/** One Lighthouse run; returns the scores (0-100), CLS and TBT. */
function measure(url, dir, run) {
  const output = join(dir, `run-${String(run)}.json`);
  execFileSync(
    'npx',
    [
      '--yes',
      LIGHTHOUSE,
      url,
      '--output=json',
      `--output-path=${output}`,
      `--only-categories=${CATEGORIES.join(',')}`,
      '--chrome-flags=--headless=new',
      '--quiet',
    ],
    { stdio: 'inherit', env: { ...process.env, CHROME_PATH: chromium.executablePath() } },
  );
  const report = reportSchema.parse(JSON.parse(readFileSync(output, 'utf8')));
  const scores = Object.fromEntries(
    CATEGORIES.map((name) => [name, Math.round((report.categories[name]?.score ?? 0) * 100)]),
  );
  return {
    ...scores,
    cls: report.audits['cumulative-layout-shift'].numericValue,
    tbt: Math.round(report.audits['total-blocking-time'].numericValue),
  };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

/** One message per median that misses its threshold. */
function misses(medians) {
  return Object.entries(THRESHOLDS).flatMap(([name, limit]) => {
    const value = medians[name];
    if ('min' in limit && value < limit.min)
      return [`${name} ${String(value)} < ${String(limit.min)}`];
    if ('max' in limit && value > limit.max)
      return [`${name} ${String(value)} > ${String(limit.max)}`];
    return [];
  });
}

async function main() {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  rmSync(DB_PATH, { force: true });
  const port = await freePort();
  const origin = `http://localhost:${String(port)}`;
  const server = spawn('node', ['src/server/node.ts'], {
    stdio: 'ignore',
    env: { ...process.env, PORT: String(port), DB_PATH },
  });
  const dir = mkdtempSync(join(tmpdir(), 'lighthouse-'));
  try {
    await waitForHealth(origin);
    const runs = [];
    for (let run = 1; run <= RUNS; run++) {
      runs.push({ run, ...measure(`${origin}/sliding-puzzle`, dir, run) });
    }
    const keys = [...CATEGORIES, 'cls', 'tbt'];
    const medians = Object.fromEntries(keys.map((key) => [key, median(runs.map((r) => r[key]))]));
    console.table([...runs, { run: 'median', ...medians }]);
    const problems = misses(medians);
    if (problems.length > 0) {
      console.error(`lighthouse: below the thresholds\n  ${problems.join('\n  ')}`);
      process.exitCode = 1;
    } else console.log('lighthouse: every median meets its threshold');
  } finally {
    server.kill('SIGTERM');
    rmSync(dir, { recursive: true, force: true });
  }
}

await main();
