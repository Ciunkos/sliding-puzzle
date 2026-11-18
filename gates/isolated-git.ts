// Runs git so that it can only touch the folder it is given, whatever environment it inherits.
import { spawnSync } from 'node:child_process';
import { sep } from 'node:path';
import process from 'node:process';

/**
 * The environment for git commands of the gates self-test. Git exports GIT_DIR, GIT_WORK_TREE,
 * GIT_INDEX_FILE and others to hooks; inherited, they would point every command at the real
 * repository instead of the throwaway clone. NODE_TEST_CONTEXT would make a nested `node --test`
 * stop failing through its exit code.
 */
export function isolatedGitEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept = Object.entries(env).filter(
    ([name]) => !name.startsWith('GIT_') && name !== 'NODE_TEST_CONTEXT',
  );
  return { ...Object.fromEntries(kept), GATES_SELF_TEST: '1' };
}

/** True when `path` is `folder` or lies below it. */
export function isInside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder + sep);
}

/** Runs the given git arguments in `cwd`, then answers the absolute git dir git uses there. */
export function gitDirOf(cwd: string, env: NodeJS.ProcessEnv, first: string[] = []): string {
  if (first.length > 0) spawnSync('git', first, { cwd, env, encoding: 'utf8' });
  const result = spawnSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd,
    env,
    encoding: 'utf8',
  });
  return result.stdout.trim();
}

/** Throws unless git, run in `repo` with `env`, acts on a repository inside `repo`. */
export function assertIsolated(repo: string, env: NodeJS.ProcessEnv): void {
  const gitDir = gitDirOf(repo, env);
  if (!isInside(gitDir, repo)) {
    throw new Error(
      `Refusing to run the gates self-test: git in ${repo} would act on ${gitDir}. ` +
        'Its commands must only ever touch the throwaway clone.',
    );
  }
}

export const SELF_TEST_ENV = isolatedGitEnv(process.env);
