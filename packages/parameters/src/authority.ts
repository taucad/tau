/* oxlint-disable typescript/no-restricted-types -- Checked filesystem preconditions use null for absence. */
import { digestContent } from '@taucad/cache-core';
import { validTarget } from '#request.js';
import type { CheckedFileWrite, CheckedFileWriteResult, FileWritePrecondition } from '@taucad/types';
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
  semanticPreconditions(
    target: ParameterSetTarget,
    signal: AbortSignal,
    resolution?: ParameterResolutionOptions,
  ): Promise<readonly FileWritePrecondition[]>;
  /**
   * Map a manifest source-file key (a rooted path) to the path this authority uses in its
   * preconditions. Defaults to the rooted path itself.
   */
  sourcePath?(file: string): string;
}>;

const staleManifest = (message: string): Error =>
  Object.assign(new Error(message), { code: 'STALE_MANIFEST', applicationState: 'known-not-applied' });
const rootedPath = (path: string): string => path.replace(/^\/+/u, '');
const encoder = new TextEncoder();

/**
 * Prove the manifest was derived from the pinned source bytes: every source file the manifest
 * names must be present in the preconditions with the digest it was compiled from, and files the
 * manifest saw as missing stay pinned as absent.
 */
const pinManifestSources = async (
  manifest: ParameterManifest,
  preconditions: readonly FileWritePrecondition[],
  sourcePath: (file: string) => string,
): Promise<readonly FileWritePrecondition[]> => {
  if (manifest.scope.kind !== 'source') {
    return preconditions;
  }
  const files = Object.entries(manifest.identity.sourceFiles);
  if (files.length === 0) {
    throw staleManifest('The parameter manifest has no source-file snapshot.');
  }
  const byPath = new Map(preconditions.map((precondition) => [rootedPath(precondition.path), precondition]));
  const pinned = [...preconditions];
  const observed = await Promise.all(
    files.map(async ([file, digest]) => {
      const path = sourcePath(file);
      const precondition = byPath.get(rootedPath(path));
      const bytes = precondition?.expected ?? null;
      const content = typeof bytes === 'string' ? encoder.encode(bytes) : bytes;
      const actual = content === null ? 'missing' : await digestContent({ bytes: content });
      return { file, digest, path, precondition, actual };
    }),
  );
  for (const { file, digest, path, precondition, actual } of observed) {
    if (actual !== digest) {
      throw staleManifest(`The parameter source ${file} no longer matches its manifest.`);
    }
    if (digest === 'missing' && precondition === undefined) {
      pinned.push({ path, expected: null });
    }
  }
  return pinned;
};

const sameBytes = (
  left: Uint8Array<ArrayBuffer> | string | null,
  right: Uint8Array<ArrayBuffer> | string | null,
): boolean => {
  if (left === null || right === null) {
    return left === right;
  }
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
    throw staleManifest('Parameter source changed during resolution.');
  }
  const preconditions = await pinManifestSources(manifest, after, authority.sourcePath ?? rootedPath);
  const bytes = await authority.read(target, signal);
  signal.throwIfAborted();
  return resolveParameterSnapshot({ target, manifest, bytes, path: authority.path(target), preconditions });
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

const sameSources = (held: readonly FileWritePrecondition[], observed: readonly FileWritePrecondition[]): boolean => {
  const heldByPath = new Map(held.map((item) => [rootedPath(item.path), item.expected]));
  const observedByPath = new Map(observed.map((item) => [rootedPath(item.path), item.expected]));
  return [...new Set([...heldByPath.keys(), ...observedByPath.keys()])].every((path) =>
    sameBytes(heldByPath.get(path) ?? null, observedByPath.get(path) ?? null),
  );
};

/**
 * Re-read a held snapshot for a read in the same resolution mode. The producer's source bytes are
 * snapshotted first: when they still equal the held pins only the sidecar is re-read, otherwise the
 * manifest is resolved again. Without a held snapshot this is a full load.
 * @public
 */
export const reloadParameterSnapshot = async (
  input: Parameters<typeof loadParameterSnapshot>[0] & Readonly<{ current?: ParameterSnapshot }>,
): Promise<ParameterSnapshot> => {
  const { current, authority, target, signal, resolution } = input;
  if (current !== undefined) {
    const observed = await authority.semanticPreconditions(target, signal, resolution);
    if (sameSources(current.preconditions, observed)) {
      return refreshParameterSnapshot({ current, authority, signal });
    }
  }
  return loadParameterSnapshot(input);
};
