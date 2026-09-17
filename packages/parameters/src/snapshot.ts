/* oxlint-disable typescript/no-restricted-types -- Checked filesystem preconditions use null for absence. */
import { fileParameterEntrySchema } from '@taucad/types';
import type { FileParameterEntry } from '@taucad/types';
import type { ParameterManifest } from '#manifest.js';
import type { ParameterSetAuthoritySnapshot, ParameterSetTarget } from '#types.js';
import { validTarget } from '#request.js';
import { requireParameterRecord } from '#record.js';

/**
 * Derive the authority snapshot for one record entry. The identity names only the manifest the
 * record was read against; the record itself carries no revision, and value-level change is proved
 * by the sidecar bytes the snapshot already holds. @internal
 */
export const snapshotFor = (entry: FileParameterEntry, manifest: ParameterManifest): ParameterSetAuthoritySnapshot => ({
  identity: { manifestRevision: manifest.revision },
  entry: fileParameterEntrySchema.parse(entry),
});

/** Correlated semantic and byte evidence required to plan a checked change. @public */
export type ParameterSnapshot = ParameterSetAuthoritySnapshot &
  Readonly<{
    target: ParameterSetTarget;
    manifest: ParameterManifest;
    path: string;
    bytes: Uint8Array<ArrayBuffer> | null;
  }>;

/**
 * Resolve supplied data without creating or modifying a file. The manifest is admitted once where
 * it enters the process, not here: a sidecar re-read carries no new semantic evidence. @public
 */
export const resolveParameterSnapshot = (
  input: Readonly<{
    target: ParameterSetTarget;
    manifest: ParameterManifest;
    path: string;
    bytes: Uint8Array<ArrayBuffer> | null;
  }>,
): ParameterSnapshot => {
  if (!validTarget(input.target) || !input.path.trim()) {
    throw new TypeError('Invalid parameter authority target.');
  }
  // Capture the caller's evidence without cloning the manifest: it is deep-frozen at compile time,
  // and only the bytes need to be isolated from later caller mutation.
  const evidence = { ...input, bytes: input.bytes === null ? null : Uint8Array.from(input.bytes) };
  // Producer scope describes its rooted execution filesystem; target identifies the
  // host's sidecar authority. They need not use the same root or authority ID.
  // The admitted manifest revision pins the producer scope independently.
  const stored = evidence.bytes === null ? undefined : requireParameterRecord(evidence.bytes);
  const entry =
    stored ?? fileParameterEntrySchema.parse({ activeGroup: 'default', groups: { default: { values: {} } } });
  return { ...evidence, ...snapshotFor(entry, evidence.manifest) };
};
