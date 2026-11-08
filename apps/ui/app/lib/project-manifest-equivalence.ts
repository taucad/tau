/**
 * When two `tau.json` declarations say the same thing (charter D12: a linked
 * import keeps the repository's own bytes when they do).
 *
 * @module
 */

import { parseProjectManifestBytes, projectToManifest, serializeProjectManifest } from '@taucad/types';
import type { ProjectManifest } from '@taucad/types';

/* A declaration with every explicit default dropped: `syncChats` absent means on, `syncLargeExports` absent means off. */
const normalized = (manifest: Omit<ProjectManifest, '$schema'>): Uint8Array<ArrayBuffer> => {
  const { syncChats, syncLargeExports, ...rest } = projectToManifest(manifest);
  return serializeProjectManifest({
    ...rest,
    ...(syncChats === false ? { syncChats } : {}),
    ...(syncLargeExports === true ? { syncLargeExports } : {}),
  });
};

const sameBytes = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): boolean =>
  left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);

/**
 * Whether authored `tau.json` bytes parse strictly and declare exactly
 * `manifest`, however they are indented, ordered or terminated, and whether
 * or not they spell out a default.
 *
 * @param bytes - The authored bytes.
 * @param manifest - The declaration to compare with.
 * @returns `true` when committing `bytes` commits `manifest`.
 */
export const declaresManifest = (
  bytes: Uint8Array<ArrayBuffer>,
  manifest: Omit<ProjectManifest, '$schema'>,
): boolean => {
  const parsed = parseProjectManifestBytes(bytes);
  return parsed.success && sameBytes(normalized(parsed.data), normalized(manifest));
};
