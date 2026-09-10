/**
 * Locating the two out-of-tree artifacts the conformance suite binds: the
 * pinned Jujutsu binary and the compiled revision algebra.
 *
 * Neither is committed. A host names them through an environment variable; the
 * machine that qualified them also has them at their recorded evidence paths.
 * When neither resolves, the suites that need them are skipped rather than
 * quietly reduced, and the suites that need neither still run.
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = resolve(import.meta.dirname, '../../..');

const firstExisting = (candidates: readonly string[]): string | undefined =>
  candidates.map((candidate) => resolve(candidate)).find((candidate) => existsSync(candidate));

/** Environment variable naming the compiled revision-algebra artifact. */
export const algebraArtifactEnvironmentVariable = 'TAU_REVISION_ALGEBRA_WASM';

/**
 * Resolve the qualified `raw-full.wasm`.
 *
 * @returns An absolute path, or `undefined` when this host has no artifact.
 */
export const resolveAlgebraArtifact = (): string | undefined => {
  const explicit = process.env[algebraArtifactEnvironmentVariable];
  return firstExisting([
    ...(explicit === undefined || explicit === '' ? [] : [explicit]),
    resolve(
      workspaceRoot,
      'repos/tau-brain/research/artifacts/agent-revisions-and-compute-cache-spike-closeout/execution/RC2/attempt-3/evidence/final/artifacts/raw-full.wasm',
    ),
    resolve(workspaceRoot, '.codex-spike-build/rc1-2026-09-08/artifacts/raw-full.wasm'),
  ]);
};

/**
 * Resolve the pinned Jujutsu binary.
 *
 * @returns An absolute path, or `undefined` when this host has no binary.
 */
export const resolveTestJjExecutable = (): string | undefined => {
  const explicit = process.env['TAU_JJ_EXECUTABLE'];
  return firstExisting([
    ...(explicit === undefined || explicit === '' ? [] : [explicit]),
    resolve(workspaceRoot, '.codex-spike-build/s0/cargo-target-attempt2/aarch64-apple-darwin/release/jj'),
  ]);
};
