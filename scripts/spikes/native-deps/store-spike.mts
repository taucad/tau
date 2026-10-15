/**
 * Purpose: Shared helpers for the wave 2 payload-store spikes S4, S26, S28 and S30 (native dependency charter).
 * Why: Each spike drives the built `tau` CLI against a scratch payload store and reads the receipts it seals; the
 *   process, store and summary plumbing is the same for all four.
 * Environment: Node 24+; the built CLI at packages/cli/dist/bin/tau.mjs (`pnpm nx run cli:build`).
 * Usage: import { runTau, sealedReceipts, Summary } from './store-spike.mts';
 * Exit codes: none (library module).
 */

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';
import process from 'node:process';

/** The checkout this script runs from. */
export const repoRoot = resolvePath(import.meta.dirname, '../../..');
/** The built CLI entry the spikes drive. */
export const tauBin = join(repoRoot, 'packages/cli/dist/bin/tau.mjs');
/** The TypeScript loader the built CLI needs for its workspace dependencies (as the `cli:tau` target runs it). */
export const loaderUrl = import.meta.resolve('@oxc-node/core/register');
/** The digest-addressed build123d seed `pnpm nx run build123d:seed` fills. */
export const build123dSeed = join(repoRoot, 'out/cache/build123d-seed');

/** One finished `tau` invocation. */
export type TauRun = {
  readonly args: readonly string[];
  readonly exitCode: number | undefined;
  readonly signal: NodeJS.Signals | undefined;
  readonly stdout: string;
  readonly stderr: string;
  readonly milliseconds: number;
};

/** Options of {@link runTau}. */
export type TauRunOptions = {
  /** `TAU_CONFIG_DIR`: the store is `<configDirectory>/payloads`. */
  readonly configDirectory: string;
  /** `TAU_PAYLOAD_DIR`, or none. */
  readonly seed?: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  /** Milliseconds before the run is killed. */
  readonly killTimeout?: number;
  /** Called with each stderr chunk and the elapsed milliseconds. */
  readonly onStderr?: (text: string, elapsed: number) => void;
  /** Receives the child once started, so a caller can signal it. */
  readonly onSpawn?: (child: ReturnType<typeof spawn>) => void;
};

/**
 * Run the built CLI with a scratch store and a clean preparation environment.
 *
 * @param args - CLI arguments.
 * @param options - Store, seed and environment.
 * @returns The exit, output and wall time.
 */
export const runTau = async (args: readonly string[], options: TauRunOptions): Promise<TauRun> => {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  env['TAU_CONFIG_DIR'] = options.configDirectory;
  env['TAU_PAYLOAD_DIR'] = options.seed ?? '';
  env['TAU_PAYLOAD_MIRROR'] = '';
  env['TAU_PAYLOAD_MIRROR_NO_FALLBACK'] = '';
  env['TAU_PAYLOAD_TARGET'] = '';
  env['NO_COLOR'] = '1';
  Object.assign(env, options.env);
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', loaderUrl, tauBin, ...args], {
      cwd: options.cwd ?? repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    options.onSpawn?.(child);
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on('data', (text: string) => {
      stderr += text;
      options.onStderr?.(text, performance.now() - started);
    });
    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
      },
      options.killTimeout ?? 20 * 60_000,
    );
    child.once('error', reject);
    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolve({
        args,
        exitCode: exitCode ?? undefined,
        signal: signal ?? undefined,
        stdout,
        stderr,
        milliseconds: Math.round(performance.now() - started),
      });
    });
  });
};

/** The receipt fields the spikes read. */
export type SealedReceipt = {
  readonly [field: string]: unknown;
  readonly package: string;
  readonly dependency: string;
  readonly root: string;
  readonly closureIntegrity: string;
  readonly treeIntegrity: string;
  readonly files: ReadonlyArray<{
    readonly path: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly mode: number;
    readonly symlinkTarget?: string;
    readonly payload?: string;
  }>;
  readonly payloads: ReadonlyArray<{
    readonly name: string;
    readonly integrity: string;
    readonly sha256: string;
    readonly acquiredFrom: unknown;
  }>;
};

/**
 * Every sealed closure of a store, read from `closures/sha256/<hex>/receipt.json`.
 *
 * @param store - The payload store root.
 * @returns The receipts, with `root` set to where each closure is now.
 */
export const sealedReceipts = (store: string): SealedReceipt[] => {
  const closures = join(store, 'closures', 'sha256');
  if (!existsSync(closures)) {
    return [];
  }
  return readdirSync(closures)
    .filter((key) => existsSync(join(closures, key, 'receipt.json')))
    .map((key) => ({
      ...(JSON.parse(readFileSync(join(closures, key, 'receipt.json'), 'utf8')) as SealedReceipt),
      root: join(closures, key),
    }));
};

/**
 * The one sealed closure of a package's dependency.
 *
 * @param store - The payload store root.
 * @param packageName - Such as `@taucad/build123d`.
 * @param dependency - Such as `engine` or `runtime`.
 * @returns The receipt.
 */
export const receiptOf = (store: string, packageName: string, dependency: string): SealedReceipt => {
  const found = sealedReceipts(store).filter(
    (receipt) => receipt.package === packageName && receipt.dependency === dependency,
  );
  if (found.length !== 1) {
    throw new Error(`expected one ${packageName} ${dependency} closure in ${store}, found ${String(found.length)}`);
  }
  return found[0]!;
};

/** The two kernels and the dependency each launches from. */
export const kernels = [
  { kernel: 'build123d', package: '@taucad/build123d', dependency: 'engine', extension: 'py' },
  { kernel: 'picogk', package: '@taucad/picogk', dependency: 'runtime', extension: 'cs' },
] as const;

/** A build123d model with parameters, exported by the tampering cases. */
export const build123dModel = `from dataclasses import dataclass

from build123d import Box


@dataclass(frozen=True)
class Params:
    width: float = 10.0


def main(params: Params):
    return Box(params.width, 20, 30)
`;

/** A PicoGK model: a 20 mm voxel sphere. */
export const picogkModel = `using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm));
});

public static class Params
{
    [Range(0.05, 5.0)]
    public static float VoxelSizeMm { get; set; } = 1.0f;

    [Range(1.0, 100.0)]
    public static float RadiusMm { get; set; } = 20.0f;
}
`;

/**
 * Write the two models into a project directory.
 *
 * @param directory - The project directory (created).
 */
export const writeModels = (directory: string): void => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'main.py'), build123dModel);
  writeFileSync(join(directory, 'main.cs'), picogkModel);
};

/**
 * Drop the unified buffer cache (macOS `purge`), so the next reads come from disk. Best effort elsewhere.
 *
 * @returns Whether the cache was purged.
 */
export const purgePageCache = (): boolean => {
  try {
    if (process.platform === 'darwin') {
      execFileSync('sudo', ['-n', 'purge'], { stdio: 'ignore' });
      return true;
    }
    execFileSync('sudo', ['-n', 'sh', '-c', 'sync; echo 3 > /proc/sys/vm/drop_caches'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

/**
 * Free bytes on the volume holding `path`, from `df` (counts APFS clones as shared, unlike `du`).
 *
 * @param path - Any path on the volume.
 * @returns Available bytes.
 */
export const freeBytes = (path: string): number => {
  const lines = execFileSync('df', ['-k', path], { encoding: 'utf8' }).trim().split('\n');
  const fields = lines.at(-1)!.trim().split(/\s+/u);
  return Number(fields[3]) * 1024;
};

/**
 * Apparent allocated size of a tree from `du -sk`.
 *
 * @param path - The tree.
 * @returns Bytes.
 */
export const duBytes = (path: string): number =>
  Number(execFileSync('du', ['-sk', path], { encoding: 'utf8' }).trim().split(/\s+/u)[0]) * 1024;

/** A plain-text summary written beside the JSON records and re-emitted as annotations and the step summary. */
export class Summary {
  readonly #path: string;

  /**
   * @param path - Summary text file (truncated).
   */
  public constructor(path: string) {
    this.#path = path;
    writeFileSync(path, '');
  }

  /**
   * Append a line and echo it.
   *
   * @param line - Text.
   */
  public line(line: string): void {
    appendFileSync(this.#path, `${line}\n`);
    process.stdout.write(`${line}\n`);
  }
}

/**
 * The tail of a text, for records.
 *
 * @param text - Any text.
 * @param characters - Kept characters.
 * @returns The trimmed tail.
 */
export const tail = (text: string, characters = 1200): string => text.trim().slice(-characters);

/**
 * Milliseconds rounded to one decimal.
 *
 * @param value - Milliseconds.
 * @returns Rounded value.
 */
export const round1 = (value: number): number => Math.round(value * 10) / 10;
