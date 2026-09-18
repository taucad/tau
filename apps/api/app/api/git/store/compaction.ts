import { runGit } from '#api/git/store/lease.js';
import type { RepositoryLease } from '#api/git/store/lease.js';

/**
 * Server "gc" is nothing more than bounding the pack count (north star,
 * "Compaction instead of garbage collection"). Deletes and non-fast-forwards
 * are refused for every ref family, so a committed object never becomes
 * unreachable and there is nothing to collect.
 *
 * It is explicit, synchronous and writer-side: the worker that already holds a
 * lease runs it, and the result rides the same manifest write as the push it
 * came in with. git's own automatic maintenance is off in a lease (AR-A E6).
 */
export const shouldCompact = (livePackCount: number, bound: number): boolean => livePackCount > bound;

/**
 * Rewrites the lease's packs as one, optionally keeping `keepPackFile`
 * byte-for-byte (charter D33).
 *
 * `--keep-pack` is the difference between an affordable compaction and an
 * unaffordable one at the D20 ceiling. W0a measured the realistic shape — one
 * ~965 MiB base pack plus nine small turn-end packs:
 *
 * | Strategy | packs | wall | lease peak | bytes to upload |
 * | --- | --- | --- | --- | --- |
 * | `repack -a -d` | 10 → 1 | 9 505 ms | 1.99× | ~1 GiB |
 * | `repack -d --geometric=2` | 10 → 1 | 28 678 ms | 1.98× | ~1 GiB |
 * | `repack -a -d --keep-pack=<largest>` | 10 → 2 | **2 769 ms** | **1.08×** | **~1.4 MiB** |
 *
 * `--geometric=2` on git 2.55 rewrote the whole repository and took three
 * times as long as the full repack, so it is rejected rather than deferred.
 * `repack -d` without `-a` is a no-op once everything is packed. The full form
 * — no `keepPackFile` — is what an explicit maintenance path would use, and is
 * also what a first compaction with nothing to keep falls back to.
 */
export const compactLease = async (lease: RepositoryLease, keepPackFile?: string): Promise<void> => {
  await runGit(lease.directory, [
    'repack',
    '-a',
    '-d',
    '--quiet',
    ...(keepPackFile === undefined ? [] : [`--keep-pack=${keepPackFile}`]),
  ]);
};
