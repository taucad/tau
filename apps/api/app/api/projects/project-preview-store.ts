import type { ObjectStorageService } from '#storage/object-storage.service.js';
import { projectPreviewKey } from '#api/projects/project-preview-key.js';

/**
 * Where a project's catalog preview lives, and the one writer of it (DC1).
 *
 * The key is under the repository's own prefix, `tenants/<owner>/repos/<project>/`,
 * so a project purge removes it with the repository. tau-api reads it there
 * but never writes under `repos/`: its writer is `executorPreviewWriter`, which
 * has tau-storage call {@link objectStoragePreviewWriter}.
 */

/** Stores a validated preview; `lost` when `createOnly` met an existing one. */
export type PreviewWriter = (input: {
  readonly ownerId: string;
  readonly projectId: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly createOnly: boolean;
}) => Promise<{ readonly lost: boolean }>;

/**
 * The preview writer over the object store: tau-storage's, and the suites'.
 *
 * @param storage - The object storage driver.
 * @returns The writer.
 */
export const objectStoragePreviewWriter =
  (storage: Pick<ObjectStorageService, 'putBlob'>): PreviewWriter =>
  async (input) => {
    const result = await storage.putBlob({
      namespace: 'tenants',
      key: projectPreviewKey(input),
      tier: 'private',
      body: input.bytes,
      signal: AbortSignal.timeout(5000),
      contentType: 'image/webp',
      cacheControl: 'private, no-store',
      ...(input.createOnly ? { ifNoneMatch: '*' } : {}),
    });
    return { lost: result.lost };
  };
