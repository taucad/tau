import { createHash } from 'node:crypto';
import type { Provider } from '@nestjs/common';
import type { GitExecutor } from '#api/git/forwarding/git-executor.js';
import { gitExecutorKey } from '#api/git/forwarding/git-executor.js';
import { defaultRoute } from '#api/git/routing/route.js';
import type { PreviewWriter } from '#api/projects/project-preview-store.js';
import { previewWriterKey } from '#api/projects/project-preview.service.js';

/**
 * The catalog-preview writer tau-api uses (DC1): the preview is validated here and
 * stored by tau-storage under a grant that names its SHA-256, so the API image
 * issues no write under `repos/`.
 *
 * @param executor - The API's git executor.
 * @returns The writer.
 */
export const executorPreviewWriter =
  (executor: GitExecutor): PreviewWriter =>
  async ({ ownerId, projectId, bytes, createOnly }) =>
    executor.putPreview(
      {
        owner: ownerId,
        project: projectId,
        callerId: ownerId,
        committedBy: ownerId,
        remainingBytes: 0,
        storageLimitBytes: 0,
        recordedGeneration: 0,
        route: { store: defaultRoute.store, authoritative: true },
        bodySha256: createHash('sha256').update(bytes).digest('hex'),
        createOnly,
      },
      bytes,
    );

/** Binds {@link executorPreviewWriter} for `ProjectPreviewService`. */
export const previewWriterProvider: Provider = {
  provide: previewWriterKey,
  useFactory: (executor: GitExecutor): PreviewWriter => executorPreviewWriter(executor),
  inject: [gitExecutorKey],
};
