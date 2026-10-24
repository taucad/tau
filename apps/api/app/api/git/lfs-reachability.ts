import { referencedLfsOids } from '#api/git/lfs-references.js';
import { applyLfsReachability } from '#api/git/lfs-reachability-marks.js';
import type { LfsReachabilityDependencies } from '#api/git/lfs-reachability-marks.js';

/*
 * DC1 splits the pass in two: the walk (`referencedLfsOids`) lives in
 * `lfs-references.ts`, which tau-storage imports without a database, and the
 * marks (`applyLfsReachability`, `writeLfsReachability`) in
 * `lfs-reachability-marks.ts`, which tau-api imports without git. This module
 * joins them for a caller that holds both a lease and the database.
 */

export type LfsReachabilityArguments = {
  readonly projectId: string;
  readonly ownerId: string;
  /** The lease this project's state is hydrated into, before it is disposed. */
  readonly directory: string;
  /** The moment an object first seen unreachable is marked with. */
  readonly at: Date;
};

/**
 * Records which of a project's LFS objects the repository still reaches (D6).
 *
 * Run in the derivation step after a push commits, over the same lease, and
 * again whenever a request finds `derived_generation` behind the manifest
 * (D19) — there is no nightly walk of every repository. Two statements, one
 * per direction, so the cost is the walk rather than the row count.
 *
 * Idempotent in both directions: a referenced object's mark is cleared however
 * often the pass runs, and an unreferenced object keeps the *first* moment it
 * was seen unreachable, which is the instant the retirement window is measured
 * from. Under the owner lock, the same one a "present" batch answer takes, so
 * a mark and a destructive recheck cannot interleave (D18).
 *
 * @param dependencies - The database handle.
 * @param args - The project, its owner, the lease and the observation moment.
 * @returns How many rows ended reachable and how many ended unreachable.
 */
export const markLfsReachability = async (
  dependencies: LfsReachabilityDependencies,
  args: LfsReachabilityArguments,
): Promise<{ reachable: number; unreachable: number }> =>
  applyLfsReachability(dependencies, {
    projectId: args.projectId,
    ownerId: args.ownerId,
    referenced: [...(await referencedLfsOids(args.directory))],
    at: args.at,
  });
