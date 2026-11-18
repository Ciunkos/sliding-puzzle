// Shared end-to-end fixtures. Every test fails when a page of it logs a console error or warning
// or throws, and `expectAccessible` fails on any WCAG 2.1 A/AA violation found by axe.
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { type BrowserContext, test as base, expect, type Page } from '@playwright/test';

const PROBLEM_TYPES = new Set(['error', 'warning']);
const WCAG_21_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

interface Fixtures {
  /** Console errors/warnings and uncaught page errors of every page in the test; asserted empty at the end. */
  consoleProblems: string[];
  /** A page in a second browser context: separate storage, same device as the project. Closed after the test. */
  otherBrowserPage: Page;
}

/** Records every console error/warning and uncaught error of every page in `context`. */
function watchConsole(context: BrowserContext, problems: string[]): void {
  context.on('console', (message) => {
    if (!PROBLEM_TYPES.has(message.type())) return;
    problems.push(`${message.type()}: ${message.text()} (${message.location().url})`);
  });
  context.on('weberror', (error) => problems.push(`pageerror: ${error.error().message}`));
}

export const test = base.extend<Fixtures>({
  consoleProblems: [
    async ({ context }, use) => {
      const problems: string[] = [];
      watchConsole(context, problems);
      await use(problems);
      expect(problems, 'the pages logged errors or warnings').toEqual([]);
    },
    { auto: true },
  ],
  otherBrowserPage: async (
    {
      browser,
      consoleProblems,
      baseURL,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    },
    use,
  ) => {
    const context = await browser.newContext({
      baseURL,
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
    });
    watchConsole(context, consoleProblems);
    await use(await context.newPage());
    await context.close();
  },
});

/**
 * A nickname of the running test alone, e.g. 'desktop-play22' (project, file, line): the projects share one
 * database, so the project is part of it. The database is deleted when a run starts (the API webServer
 * command in playwright.config.ts), so no per-run suffix is needed. At most 20 characters.
 */
export function uniqueNickname(): string {
  const info = test.info();
  return `${info.project.name}-${path.basename(info.file).slice(0, 4)}${String(info.line)}`;
}

/** Asserts that the page as it is now has no WCAG 2.1 A/AA violations; the message lists each rule and element. */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(WCAG_21_AA).analyze();
  const summary = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')} (${violation.help})`),
  );
  // Soft, so every checked screen is reported in one run; the test still fails.
  expect.soft(summary, 'axe found accessibility violations').toEqual([]);
}

export { expect };
