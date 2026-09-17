/* oxlint-disable typescript/no-restricted-types -- Checked filesystem preconditions use null for absence. */
import { canonicalizeCacheValue, digestContent } from '@taucad/cache-core';
import type { CacheValue } from '@taucad/cache-core';
import { fileParameterEntrySchema, fileParameterRecordProfile } from '@taucad/types';
import type { FileParameterEntry, FileWritePrecondition } from '@taucad/types';
import { admitParameterManifest } from '#manifest.js';
import type { ParameterManifest } from '#manifest.js';
import type { ParameterSetAuthoritySnapshot, ParameterSetTarget } from '#types.js';
import { validTarget } from '#request.js';
import { requireParameterRecord } from '#record.js';
const encoder = new TextEncoder();
const revisionFor = async (entry: FileParameterEntry): Promise<string> => {
  const { identity: _identity, lastOperation: _lastOperation, ...state } = entry;
  return digestContent({
    bytes: encoder.encode(canonicalizeCacheValue({ value: state as unknown as CacheValue })),
  });
};

/** Derive the authority snapshot and identity for one record entry. @internal */
export const snapshotFor = async (
  entry: FileParameterEntry,
  manifest: ParameterManifest,
): Promise<ParameterSetAuthoritySnapshot> => {
  const identity = {
    sourceRevision: manifest.source.revision,
    manifestRevision: manifest.revision,
    valueRevision: await revisionFor(entry),
    dependencyRevision: manifest.identity.dependency,
  };
  return {
    identity,
    entry: fileParameterEntrySchema.parse({ ...entry, identity }),
  };
};

/** Correlated semantic and byte evidence required to plan a checked change. @public */
export type ParameterSnapshot = ParameterSetAuthoritySnapshot &
  Readonly<{
    target: ParameterSetTarget;
    manifest: ParameterManifest;
    path: string;
    bytes: Uint8Array<ArrayBuffer> | null;
    preconditions: readonly FileWritePrecondition[];
  }>;

/** Resolve supplied data without creating or modifying a file. @public */
export const resolveParameterSnapshot = async (
  input: Readonly<{
    target: ParameterSetTarget;
    manifest: ParameterManifest;
    path: string;
    bytes: Uint8Array<ArrayBuffer> | null;
    preconditions: readonly FileWritePrecondition[];
  }>,
): Promise<ParameterSnapshot> => {
  if (!validTarget(input.target) || !input.path.trim()) {
    throw new TypeError('Invalid parameter authority target.');
  }
  // Capture the caller's evidence without cloning the manifest: it is deep-frozen at compile time,
  // and only the bytes and precondition list need to be isolated from later caller mutation.
  const evidence = {
    ...input,
    bytes: input.bytes === null ? null : Uint8Array.from(input.bytes),
    preconditions: [...input.preconditions],
  };
  await admitParameterManifest(evidence.manifest);
  // Producer scope describes its rooted execution filesystem; target identifies the
  // host's sidecar authority. They need not use the same root or authority ID.
  // The admitted manifest revision pins the producer scope independently.
  const stored = evidence.bytes === null ? undefined : requireParameterRecord(evidence.bytes);
  const entry =
    stored ??
    fileParameterEntrySchema.parse({
      recordVersion: 1,
      profile: fileParameterRecordProfile,
      activeGroup: 'default',
      order: ['default'],
      groups: { default: { values: {} } },
    });
  return { ...evidence, ...(await snapshotFor(entry, evidence.manifest)) };
};
