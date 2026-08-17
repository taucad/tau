/**
 * Zod schema for the opaque {@link RuntimeFileSystem} value used in
 * transport options validation.
 *
 * The schema enforces only that the value is structurally a
 * {@link RuntimeFileSystem} (carries the package-private handle
 * symbol). It does **not** crack the opaque envelope to validate the
 * underlying handle — that contract lives inside the runtime package.
 *
 * @internal
 */

import { z } from 'zod';
import { isRuntimeFileSystem } from '#filesystem/runtime-filesystem.js';
import type { RuntimeFileSystem } from '#filesystem/runtime-filesystem.js';

/**
 * Validator that accepts any value satisfying {@link isRuntimeFileSystem}.
 *
 * Use inside transport client/host options schemas where a
 * {@link RuntimeFileSystem} field is required.
 *
 * @public
 */
export const runtimeFileSystemSchema = z
  .custom<RuntimeFileSystem>((value) => isRuntimeFileSystem(value), {
    message: 'expected a RuntimeFileSystem produced by a fromX factory',
  })
  .describe('Opaque RuntimeFileSystem (constructed via fromMemoryFs / fromNodeFs / fromBrowserFs / fromFsLike)');
