/* oxlint-disable typescript/no-restricted-types -- Checked filesystem preconditions use null for absence. */
import { validTarget } from '#request.js';
import { sameRecordBytes } from '#record.js';
import type { CheckedFileWrite, CheckedFileWriteResult } from '@taucad/types';
import type { ParameterManifest, ParameterResolutionOptions } from '#manifest.js';
import type { ParameterSetTarget } from '#types.js';
import type { ParameterChange } from '#planning.js';
import { resolveParameterSnapshot } from '#snapshot.js';
import type { ParameterSnapshot } from '#snapshot.js';

/** Host-owned byte access; the domain supplies no filesystem implementation. @public */
export type ParameterAuthority = Readonly<{
  path(target: ParameterSetTarget): string;
  read(target: ParameterSetTarget, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null>;
  writeChecked(write: CheckedFileWrite): Promise<CheckedFileWriteResult>;
}>;

/**
 * Resolve the producer's semantics, then retain the exact sidecar bytes. Source files are neither
 * read nor digested here: a source change produces a new manifest revision, which is what refuses a
 * request built against the old one. @public
 */
export const loadParameterSnapshot = async (
  input: Readonly<{
    target: ParameterSetTarget;
    authority: ParameterAuthority;
    resolution?: ParameterResolutionOptions;
    signal: AbortSignal;
    manifest(
      target: ParameterSetTarget,
      signal: AbortSignal,
      resolution?: ParameterResolutionOptions,
    ): Promise<ParameterManifest>;
  }>,
): Promise<ParameterSnapshot> => {
  const { authority, target, signal, resolution } = input;
  if (!validTarget(target)) {
    throw new TypeError('Invalid parameter authority target.');
  }
  signal.throwIfAborted();
  const manifest = await input.manifest(target, signal, resolution);
  const bytes = await authority.read(target, signal);
  signal.throwIfAborted();
  return resolveParameterSnapshot({ target, manifest, bytes, path: authority.path(target) });
};

/** Perform exactly one checked replacement without re-resolving producer semantics. @public */
export const commitParameterChange = async (
  input: Readonly<{
    change: Extract<ParameterChange, { status: 'prepared' }>;
    authority: Pick<ParameterAuthority, 'writeChecked'>;
    signal: AbortSignal;
  }>,
): Promise<CheckedFileWriteResult> => {
  input.signal.throwIfAborted();
  // The planner only prepares source-unit changes a producer advertised as record-interpreted;
  // an explicit matching confirmation is still required before that one record write.
  if (input.change.confirmation !== undefined && input.change.confirmed !== input.change.confirmation.planFingerprint) {
    throw Object.assign(new Error('Source-unit changes require explicit confirmation of this plan.'), {
      code: 'CONFIRMATION_REQUIRED',
      applicationState: 'known-not-applied',
    });
  }
  const result = await input.authority.writeChecked({ ...input.change.write, signal: input.signal });
  if (result.status !== 'conflict' && !sameRecordBytes(result.content, input.change.write.data)) {
    throw new Error('The checked authority returned bytes that differ from the prepared change.');
  }
  return result;
};

/** Refresh only sidecar evidence; source changes require a new full load. @public */
export const refreshParameterSnapshot = async (
  input: Readonly<{
    current: ParameterSnapshot;
    authority: Pick<ParameterAuthority, 'read'>;
    signal: AbortSignal;
  }>,
): Promise<ParameterSnapshot> => {
  input.signal.throwIfAborted();
  const bytes = await input.authority.read(input.current.target, input.signal);
  input.signal.throwIfAborted();
  return resolveParameterSnapshot({ ...input.current, bytes });
};
