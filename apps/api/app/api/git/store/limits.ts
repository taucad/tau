/**
 * The numbers the commit protocol is built around, in one file so the operator
 * can see every bound at once.
 *
 * Charter D16, D20, **D33**; north star "Size bounds", NI4, NI5. D33 is the
 * coordinator's ruling from W0a's report
 * (`execution/W0/w0a-report.md`), and the two figures below are its figures,
 * not this lane's.
 */

/**
 * Per-repository ceiling on non-LFS bytes (charter D20, operator ruling O5,
 * 2026-09-18). `pre-receive` enforces it on the incoming quarantine so a push
 * is refused while it arrives; the commit protocol checks the committed total
 * as a backstop, because the hook measures only what this push added.
 *
 * Spelled in the same units as `storageLimitBytesByTier`, which D20 names.
 * Counted over pack bytes only: a stored `.idx` is a derived 0.17 % that the
 * user did not push.
 */
export const repositoryByteCeiling = 1024 ** 3;

/**
 * How many live packs a repository carries before the committing lease holder
 * compacts. **Eight (D33, from W0a).**
 *
 * W0a's finding is that pack count is second-order at the ceiling and
 * first-order everywhere else. At the 1 GiB ceiling a cold hydrate costs
 * 8.9–15 s at 0 ms injected latency and 9.4–28.5 s at 100 ms *at every pack
 * bound* — the byte terms (3.3–4.7 s of download plus 5.0–9.0 s of
 * `index-pack`) dominate, and 126 packs indexed no slower than 32 did. At the
 * size Tau repositories actually are — L4's median pack is 398 B — the byte
 * terms vanish and hydrate is `N · (RTT + per-pack cost)` at L5's ~70 ms per
 * pack: N=8 is ~1.4 s at 100 ms round trips, inside Rule 9's window with
 * margin, where N=16 is ~2.7 s and N=32 is outside it.
 *
 * Eight also matches the fetch concurrency W0a recommends, so a repository at
 * the bound hydrates in one parallel round.
 */
export const livePackBound = 8;

/**
 * Scratch a worker reserves per in-flight lease: **2.5 GiB (D33, from W0a)**,
 * against D20's 1 GiB ceiling. W0a's measured components, out of process
 * because an in-process sampler cannot fire while `execFileSync` blocks:
 *
 * | Component | measured | allowance |
 * | --- | --- | --- |
 * | Packs on disk after hydration | 1.00× repository | 1.0 GiB |
 * | Derived or stored `.idx` | 28 B/object, 0.17 % of pack bytes | 0.01 GiB |
 * | Full `repack -a -d` transient (new pack written before the old unlink) | 1.98–1.99× | +1.0 GiB |
 * | `receive-pack` quarantine, `tmp_pack_*`, index scratch | bounded by D20 | +0.5 GiB |
 *
 * Admission is concurrent leases × this figure against the worker's ephemeral
 * disk, which admits three ceiling-sized leases on an 8 GiB Fly rootfs. It is
 * set by the *full* repack, which the push path no longer performs — a
 * push-path-only lease peaks at 1.08× and needs 1.5 GiB — but an explicit full
 * compaction must stay possible somewhere, so 2.5 GiB is what W4 admits
 * against.
 */
export const leaseDiskBytesPerLease = Math.round(2.5 * 1024 ** 3);

/**
 * The hard deadline for the commit phase, measured from before the first
 * object upload (AR-A attack 4). A worker past it abandons the push without
 * attempting the manifest write, so no committer can still be naming keys by
 * the time the sweep's orphan threshold considers them abandoned.
 *
 * Sized from W0b's real round-trip times to staging R2 — a conditional PUT is
 * p50 ≈700 ms and p95 ≈1.4 s from NZ — plus W0a's worst measured on-push cost
 * at the ceiling: 2.8 s for `repack -a -d --keep-pack` and a ~1.4 MiB upload,
 * against 11–21 s for the full repack the push path no longer runs. Five
 * minutes is an order of magnitude above both and well under the 10-minute RPC
 * timeout the receive phase already has.
 */
export const commitDeadlineMilliseconds = 5 * 60 * 1000;

/**
 * How old an object no manifest has ever listed must be before the sweeping
 * lease holder deletes it (NI4, second rule). Far above the commit deadline
 * plus any clock skew between workers, which is the whole of its job.
 */
export const orphanThresholdMilliseconds = 24 * 60 * 60 * 1000;

/**
 * The one retention window (charter D10, D16; NI4, NI7). It is both the
 * compaction grace — how long a replaced pack stays fetchable for a reader
 * that is still hydrating it — and the reconstruction window, and the wait
 * between a tombstone and its purge.
 */
export const retentionWindowMilliseconds = 30 * 24 * 60 * 60 * 1000;
