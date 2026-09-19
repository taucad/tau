/**
 * Named crash points in the write path, so a test can kill a worker at each
 * step and assert I1–I3 rather than hoping a real kill lands in the right
 * microsecond (charter W2, success criterion S1).
 *
 * This is a production seam rather than a test helper: the commit protocol
 * awaits an optional callback at each point and does nothing when none is
 * given, which is one `await` and no branch in the deployed path. Threading a
 * callback is cheaper — and far more honest — than a module-level registry a
 * test mutates.
 */
export const faultPoints = [
  /** Every new pack is in the store; no manifest names any of them yet. */
  'after-pack-upload',
  /** The next manifest is built and the conditional write is about to go out. */
  'before-manifest-commit',
  /** The manifest is durable; the client has not been acknowledged. */
  'after-manifest-commit',
  /** `repack -a -d` has rewritten the lease; nothing is uploaded. */
  'mid-compaction',
  /** The commit is durable and the sweep has deleted some of its keys. */
  'mid-sweep',
] as const;

export type FaultPoint = (typeof faultPoints)[number];

/** Called at each point. Throwing stands in for the worker dying there. */
export type FaultInjector = (point: FaultPoint) => void | Promise<void>;
