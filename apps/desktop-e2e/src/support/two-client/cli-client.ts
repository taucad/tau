/* eslint-disable @typescript-eslint/naming-convention -- environment variable names are not camelCase. */
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { desktopE2EApiUrl } from '#support/config.js';

/**
 * The terminal as the third client (revisions charter W15).
 *
 * `tau` exactly as a person runs it, signed in with the same account's session
 * as the other two clients: `TAU_API_URL` and `TAU_API_TOKEN`, the pair
 * `tau open`, `tau publish` and `tau revisions save` are told. Spawned from its
 * TypeScript source through the workspace's `tsx`, as `packages/cli`'s own
 * integration tests spawn it, so this tier needs no CLI build.
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(import.meta.dirname, '../../../../..');
const binPath = resolve(workspaceRoot, 'packages/cli/src/bin.ts');

/** How one `tau` run ended. */
export type CliRun = Readonly<{ code: number; stdout: string; stderr: string }>;

/**
 * Run one `tau` verb against the suite's API as the signed-in account.
 *
 * @param args - The verb and its arguments.
 * @param token - The account's bearer session token.
 * @returns Its exit code and output; a refusal resolves rather than throws.
 */
export const runCli = async (args: readonly string[], token: string): Promise<CliRun> => {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, ['--import', 'tsx', binPath, ...args], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        TAU_API_URL: desktopE2EApiUrl,
        TAU_API_TOKEN: token,
        /* The operator's own git configuration must not decide what a terminal proves. */
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_TERMINAL_PROMPT: '0',
      },
      maxBuffer: 16 * 1024 * 1024,
      timeout: 300_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: number; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === 'number' ? failure.code : 1,
      stdout: failure.stdout ?? '',
      stderr: failure.stderr ?? String(error),
    };
  }
};

/**
 * The versioned JSON record a `--json` verb wrote last.
 *
 * @param run - A run of a verb given `--json`.
 * @returns Its final record.
 */
export const cliRecord = (run: CliRun): Readonly<Record<string, unknown>> => {
  const last = run.stdout.trim().split('\n').at(-1);
  if (last === undefined || last === '') {
    throw new Error(`tau wrote no JSON record (exit ${String(run.code)}): ${run.stderr}`);
  }
  return JSON.parse(last) as Readonly<Record<string, unknown>>;
};
