/**
 * Shared harness of the CLI headless scenarios: the built `tau` run from an empty home and config directory, and the
 * shard of a sharded CI lane. Each scenario file owns its own scratch directory and passes it in.
 */
import { spawn } from 'node:child_process';
import { join, resolve as resolvePath, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, inject } from 'vitest';

declare module 'vitest' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- Vitest's ProvidedContext is augmented through interface merging.
  interface ProvidedContext {
    /** This run's shard of a sharded CI lane, from `TAU_CI_SHARD` (vitest.scenarios.config.ts). */
    scenarioShard: { index: number; count: number };
  }
}

export const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), '../../..');
export const cliBinPath = resolvePath(repoRoot, 'packages/cli/dist/bin/tau.mjs');
export const examplesRoot = resolvePath(repoRoot, 'libs/tau-examples/src/kernels');

/** What one run of the built `tau` produced. */
export type Run = {
  readonly code: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
  readonly pid: number | undefined;
  readonly timedOut: boolean;
  /** Milliseconds from spawning the process until its output streams close. */
  readonly elapsed: number;
  readonly stdout: string;
  readonly stderr: string;
};

/**
 * The built `tau` and the environment it runs in, for one scenario file.
 *
 * @param scratchDirectory - The file's scratch directory, read at each call (it is created in `beforeAll`).
 * @returns The helpers that spawn the built `tau`.
 */
export const scenarioProcesses = (
  scratchDirectory: () => string,
): {
  readonly isolated: (extra?: Readonly<Record<string, string>>) => Record<string, string>;
  readonly binArguments: (args: readonly string[]) => string[];
  readonly tau: (
    args: readonly string[],
    options?: { readonly env?: Readonly<Record<string, string>>; readonly cwd?: string; readonly runTimeout?: number },
  ) => Promise<Run>;
} => {
  /**
   * The environment every scenario runs in: an empty home and config directory, no managed profile, and no CI opener.
   *
   * @param extra - Variables this scenario adds.
   * @returns The child environment.
   */
  const isolated = (extra: Readonly<Record<string, string>> = {}): Record<string, string> => {
    /* Built by assignment so no environment key is a source literal. */
    const env: Record<string, string> = { ...(process.env as Record<string, string>) };
    env['HOME'] = join(scratchDirectory(), 'home');
    env['TAU_CONFIG_DIR'] = join(scratchDirectory(), 'config');
    env['XDG_CONFIG_HOME'] = join(scratchDirectory(), 'home', '.config');
    env['XDG_CACHE_HOME'] = join(scratchDirectory(), 'home', '.cache');
    env['XDG_DATA_HOME'] = join(scratchDirectory(), 'home', '.local', 'share');
    env['TAU_ACQUISITION'] = '';
    env['TAU_DEPENDENCY_DIR'] = '';
    env['TAU_DEPENDENCY_MIRROR'] = '';
    env['TAU_HOST_RELAY_URL'] = '';
    env['TAU_HOST_UI_DIR'] = '';
    env['TAU_HOST_AGENT_PORT'] = '';
    env['NX_PREFER_NODE_STRIP_TYPES'] = 'true';
    env['CI'] = 'true';
    return { ...env, ...extra };
  };

  /** The argv that runs the built binary; the workspace's `@taucad/*` export TypeScript source, so it needs a loader. */
  const binArguments = (args: readonly string[]): string[] => [
    '--import',
    '@oxc-node/core/register',
    cliBinPath,
    ...args,
  ];

  /**
   * Run the built `tau` to completion.
   *
   * @param args - Its arguments.
   * @param options - Environment additions and a working directory.
   * @returns Its exit code, termination diagnostics and fully drained output.
   */
  const tau = async (
    args: readonly string[],
    options: {
      readonly env?: Readonly<Record<string, string>>;
      readonly cwd?: string;
      readonly runTimeout?: number;
    } = {},
  ): Promise<Run> =>
    new Promise((resolve, reject) => {
      const started = performance.now();
      const child = spawn(process.execPath, binArguments(args), {
        cwd: options.cwd ?? repoRoot,
        env: isolated(options.env),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, options.runTimeout ?? 300_000);
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
      });
      child.once('close', (code, signal) => {
        resolve({
          code: code ?? undefined,
          signal: signal ?? undefined,
          pid: child.pid,
          timedOut,
          elapsed: Math.round(performance.now() - started),
          stdout,
          stderr,
        });
      });
    });

  return { isolated, binArguments, tau };
};

/** The one JSON record a `--json` run printed. */
export const recordOf = (run: Run): Record<string, unknown> => {
  const lines = run.stdout.trim().split('\n').filter(Boolean);
  expect(lines, `${run.stdout}\n${run.stderr}`).toHaveLength(1);
  return JSON.parse(lines[0]!) as Record<string, unknown>;
};

/** This run's shard of a sharded CI lane (`TAU_CI_SHARD`, see vitest.scenarios.config.ts); 1/1 when not sharded. */
const scenarioShard = (): { readonly index: number; readonly count: number } => inject('scenarioShard');

/**
 * Take this shard's share of a list that one scenario splits across the shards: every count-th entry from the index-th.
 *
 * @param entries - The whole list, in a stable order.
 * @returns The entries this shard runs.
 */
export const shardSlice = <Entry>(entries: readonly Entry[]): Entry[] => {
  const { index, count } = scenarioShard();
  return entries.filter((_entry, position) => position % count === index - 1);
};
