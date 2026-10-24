import { livePackBound } from '#api/git/store/limits.js';

/**
 * How many bytes of lease disk one git operation reserves, from the manifest
 * it will hydrate (Hosted Remote Storage DA3; blueprint OD2, which replaces
 * D33's flat 2.5 GiB per lease).
 *
 * The flat figure was D20's worst case, taken before the manifest was read: a
 * 398-byte repository reserved what a 1 GiB one with a full repack needs, so
 * a 7.3 GiB Machine held two leases. Each figure below is what that kind of
 * lease can write to disk, measured by W0a, and nothing more:
 *
 * | Kind | What reaches disk | Reservation |
 * | --- | --- | --- |
 * | `fetch` (upload-pack, publication derive, ref removal) | the hydrated packs and their `.idx` | 1.0× + index + floor |
 * | `push` (receive-pack) | the hydrate, the quarantine, and the `--keep-pack` transient when the arrival compacts | 1.0× + index + quarantine bound (+ rewritten tail + quarantine) + floor |
 * | `compaction` (full `repack -a -d`) | old and new packs together before the unlink | 2 × (1.0× + index) + floor |
 *
 * Pure and free of Nest, the service and the store: it moves to `tau-storage`
 * with `git.service.ts` (north star "Straight to C2"), where the worker's
 * admission calls it with the same inputs.
 */
export type LeaseKind = 'fetch' | 'push' | 'compaction';

export type LeaseDemand = {
  readonly kind: LeaseKind;
  /** The byte size of every live pack the manifest names; empty for generation 0. */
  readonly packBytes: readonly number[];
  /** `push` only: the most bytes the receive quarantine can hold ({@link pushQuarantineBound}). */
  readonly quarantineBytes?: number;
};

/**
 * What every lease writes whatever the repository's size: the bare skeleton,
 * the hook, `packed-refs`, git's scratch for `upload-pack` and for
 * materializing derived state, and the loose objects a ref removal or a small
 * push leaves. **64 MiB**, the per-lease reserve W3's C1i emulation ran its
 * storms with (W3 §4.4: 0 refusals at K = 32), and four orders of magnitude
 * above the 76 KiB the capacity test's clone actually wrote.
 */
export const reservationFloorBytes = 64 * 1024 ** 2;

/**
 * A stored or derived `.idx` beside each pack: W0a measured 28 B per object,
 * 0.17 % of pack bytes. Allowed as 1/512 (0.195 %), rounded up.
 */
const indexAllowanceDivisor = 512;

const assertByteCount = (bytes: number, what: string): void => {
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new RangeError(`${what} must be a whole, non-negative byte count, got ${String(bytes)}`);
  }
};

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

/**
 * The bytes a hydrate of these packs leaves on disk: the packs and an index
 * allowance. It is also what a lease reports as landed once its hydrate is
 * done, so admission stops counting those bytes twice (`lease-admission.ts`).
 *
 * @param packBytes - The live pack sizes the manifest names.
 * @returns Bytes on disk after the hydrate.
 */
export const hydratedBytes = (packBytes: readonly number[]): number => {
  for (const bytes of packBytes) {
    assertByteCount(bytes, 'a pack size');
  }
  const packs = sum(packBytes);
  return packs + Math.ceil(packs / indexAllowanceDivisor);
};

/**
 * The most a push can write into its receive quarantine. `receive-pack` runs
 * with `receive.maxInputSize` set to this, so the bound is enforced by git
 * while the pack arrives, not only measured by `pre-receive` after it landed:
 * what is left of the owner's plan or of D20's ceiling, whichever is smaller,
 * plus the slack that lets the hook rather than git word an ordinary overrun.
 *
 * @param bounds - The plan's and the ceiling's remaining bytes for this repository, and the slack
 *   (`quotaOverrunSlackBytes` in `git.constants.ts`).
 * @returns The quarantine bound in bytes.
 */
export const pushQuarantineBound = (bounds: {
  readonly planRemainingBytes: number;
  readonly ceilingRemainingBytes: number;
  readonly slackBytes: number;
}): number => Math.max(0, Math.min(bounds.planRemainingBytes, bounds.ceilingRemainingBytes)) + bounds.slackBytes;

/**
 * The lease disk one operation reserves.
 *
 * A push compacts when its arriving pack takes the repository past
 * {@link livePackBound} (`receive-pack` with `transfer.unpackLimit=1` writes one
 * pack per push). `repack -a -d --keep-pack=<largest>` then writes every pack
 * but the largest, plus the arrival, into a new pack before unlinking the old
 * ones, so the transient is the live bytes less the largest pack plus the
 * quarantine. At W0a's realistic ceiling shape that is the measured 1.08×.
 *
 * @param demand - The kind of lease and the manifest's pack sizes.
 * @param floorBytes - The per-lease floor; the service's test seam passes its own.
 * @returns Bytes to reserve.
 * @throws RangeError When a figure is not a whole, non-negative byte count.
 */
export const reservationFor = (demand: LeaseDemand, floorBytes: number = reservationFloorBytes): number => {
  assertByteCount(floorBytes, 'the reservation floor');
  const hydrated = hydratedBytes(demand.packBytes);
  switch (demand.kind) {
    case 'fetch': {
      return hydrated + floorBytes;
    }
    case 'compaction': {
      return 2 * hydrated + floorBytes;
    }
    case 'push': {
      const quarantine = demand.quarantineBytes ?? 0;
      assertByteCount(quarantine, 'the quarantine bound');
      const compacts = demand.packBytes.length + 1 > livePackBound;
      const rewritten = compacts ? sum(demand.packBytes) - Math.max(0, ...demand.packBytes) + quarantine : 0;
      return hydrated + quarantine + rewritten + floorBytes;
    }
  }
};
