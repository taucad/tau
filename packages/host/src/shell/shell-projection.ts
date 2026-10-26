import type { NodeFsRootScope } from '@taucad/filesystem/backend/node';
import { classify } from '@taucad/filesystem/path-registry';
import type { CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import { assertRootedPath } from '@taucad/utils/path';

type FileBytes = FileWritePrecondition['expected'];

/** One regular-file observation; absence is distinct from an empty file. @internal */
export type ShellProjectionFile = Readonly<{
  path: string;
  baseline: FileBytes;
  projected: FileBytes;
}>;

/** The caller retains this observation until durable reconciliation acknowledges it. @internal */
export type ShellProjectionPublication =
  | Readonly<{ status: 'refused'; reason: 'protected-path' | 'size-limit' }>
  | Readonly<{ status: 'settled'; observation: ShellProjectionFile; result: CheckedFileWriteResult }>;

/**
 * Publish one captured regular-file change through the held root claim of its admitted checkout.
 *
 * This is only the outbound reconciliation primitive. It neither observes disk nor launches a shell. The owner
 * must capture a stable regular file, retain its journal and checkout custody, and stop publication when that
 * admission is revoked. A conflict preserves the captured bytes and never retries against a newer baseline.
 * Directory moves, symlinks, inbound updates, quotas and recovery are deliberately not implemented here.
 * The scope comes from the served filesystem owner's `run`, never from a wire client: a wire mutation of the
 * same root awaited inside a held claim waits on that claim forever (PO-Q5).
 *
 * @internal
 * @param scope - The held claim's checked mutation methods for the exact admitted checkout.
 * @param observation - The last acknowledged bytes and newly captured shell bytes for one root-relative file.
 * @param options - Maximum combined bytes retained for this publication and cancellation.
 * @returns The authority's conflict or commit result alongside owned copies of the observation.
 */
export const publishShellProjectionFile = async (
  scope: Pick<NodeFsRootScope, 'writeFileChecked' | 'deleteFileChecked'>,
  observation: ShellProjectionFile,
  options: Readonly<{ maximumBytes: number; signal: AbortSignal }>,
): Promise<ShellProjectionPublication> => {
  options.signal.throwIfAborted();
  assertRootedPath(observation.path);
  if (observation.path === '') {
    throw new TypeError('A shell projection file must name a file inside its checkout.');
  }
  if (!Number.isSafeInteger(options.maximumBytes) || options.maximumBytes < 0) {
    throw new TypeError('The shell projection publication limit must be a nonnegative safe integer.');
  }
  if (classify(observation.path).agentAccess !== 'read-write') {
    return { status: 'refused', reason: 'protected-path' };
  }
  const size = (value: FileBytes): number =>
    typeof value === 'string' ? Buffer.byteLength(value) : (value?.byteLength ?? 0);
  if (size(observation.baseline) + size(observation.projected) > options.maximumBytes) {
    return { status: 'refused', reason: 'size-limit' };
  }
  const copy = (value: FileBytes): FileBytes => (value instanceof Uint8Array ? new Uint8Array(value) : value);
  const owned: ShellProjectionFile = {
    path: observation.path,
    baseline: copy(observation.baseline),
    projected: copy(observation.projected),
  };
  const input = {
    path: owned.path,
    preconditions: [{ path: owned.path, expected: owned.baseline }],
    signal: options.signal,
  };
  const result =
    owned.projected === null
      ? await scope.deleteFileChecked(input)
      : await scope.writeFileChecked({ ...input, data: owned.projected });
  return { status: 'settled', observation: owned, result };
};
