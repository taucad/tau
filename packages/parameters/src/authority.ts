/* oxlint-disable typescript/no-restricted-types -- Checked filesystem preconditions use null for absence. */
import { digestContent } from '@taucad/cache-core';
import { validTarget } from '#request.js';
import { readParameterRecord, planParameterRecordMigration } from '#record.js';
import type { CheckedFileWrite, CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
import type { ParameterManifest, ParameterResolutionOptions } from '#manifest.js';
import type { ParameterSetTarget } from '#types.js';
import type { ParameterChange } from '#planning.js';
import { resolveParameterSnapshot } from '#snapshot.js';
import type { ParameterSnapshot } from '#snapshot.js';

/** Host-owned byte access; the domain supplies no filesystem implementation. @public */
export type ParameterAuthority = Readonly<{
  backupLegacy?(
    target: ParameterSetTarget,
    input: Readonly<{ bytes: Uint8Array<ArrayBuffer>; sourceDigest: string }>,
    signal: AbortSignal,
  ): Promise<string>;
  path(target: ParameterSetTarget): string;
  read(target: ParameterSetTarget, signal: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null>;
  writeChecked(write: CheckedFileWrite): Promise<CheckedFileWriteResult>;
  semanticPreconditions(
    target: ParameterSetTarget,
    signal: AbortSignal,
    resolution?: ParameterResolutionOptions,
  ): Promise<readonly FileWritePrecondition[]>;
}>;

const sameBytes = (
  left: Uint8Array<ArrayBuffer> | string | null,
  right: Uint8Array<ArrayBuffer> | string | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
  const encoder = new TextEncoder();
  const a = typeof left === 'string' ? encoder.encode(left) : left;
  const b = typeof right === 'string' ? encoder.encode(right) : right;
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
};

/** Pin producer inputs around manifest resolution, then retain exact sidecar bytes. @public */
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
  const before = await authority.semanticPreconditions(target, signal, resolution);
  const manifest = await input.manifest(target, signal, resolution);
  const after = await authority.semanticPreconditions(target, signal, resolution);
  if (
    before.length !== after.length ||
    before.some((item, index) => item.path !== after[index]?.path || !sameBytes(item.expected, after[index].expected))
  ) {
    throw Object.assign(new Error('Parameter source changed during resolution.'), { code: 'STALE_MANIFEST' });
  }
  let bytes = await authority.read(target, signal);
  if (bytes !== null && authority.backupLegacy !== undefined) {
    const record = readParameterRecord(bytes, { migrationAvailable: true });
    if (record.status === 'migration-ready') {
      const backupRevision = await authority.backupLegacy(
        target,
        { bytes, sourceDigest: await digestContent({ bytes }) },
        signal,
      );
      const migration = await planParameterRecordMigration(record, backupRevision);
      const result = await authority.writeChecked({
        path: authority.path(target),
        data: migration.bytes,
        preconditions: [...after, { path: authority.path(target), expected: bytes }],
        signal,
      });
      if (result.status === 'conflict') {
        throw Object.assign(new Error('Parameter record changed before migration.'), { code: 'STALE_MANIFEST' });
      }
      bytes = result.content;
    }
  }
  signal.throwIfAborted();
  return resolveParameterSnapshot({ target, manifest, bytes, path: authority.path(target), preconditions: after });
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
  if (result.status !== 'conflict' && !sameBytes(result.content, input.change.write.data)) {
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
