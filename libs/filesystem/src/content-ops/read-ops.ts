/**
 * The read content operations a rooted connection serves (charter D2, W3).
 *
 * Every host composed this identically — the browser worker, the node host and
 * two suites — so the composition lives here instead of four times: the view
 * plus `archive` and `contents` over it, with the caller's own export filter
 * built from the injected policy. The mask is the view's and is never
 * re-declared; `versionedOnly` is the whole-project export's own choice.
 *
 * `search` and `statTree` are deliberately *not* here. They are not functions
 * of the port: they read the root's `TreeIndex`, which only the rooted
 * filesystem owns, and they are masked by `composeView` itself — so they arrive
 * on the view already and this wrapper simply keeps them.
 *
 * @module
 */

import { joinRelativePath } from '@taucad/utils/path';
import { archive } from '#content-ops/archive.js';
import { contents } from '#content-ops/contents.js';
import type { ContentFileSystem } from '#content-ops/contents.js';
import type { WalkOptions } from '#content-ops/walk.js';
import type { PathPolicy } from '#types.js';

/**
 * The caller-owned filter on a read content operation.
 *
 * @public
 */
export type ContentExportFilter = Readonly<{ versionedOnly?: boolean }>;

/** What {@link withReadContentOps} adds to a view. @public */
export type ReadContentOps = {
  archive(path: string, filter?: ContentExportFilter): Promise<Blob>;
  contents(path: string, filter?: ContentExportFilter): Promise<Record<string, Uint8Array<ArrayBuffer>>>;
};

/**
 * Serve `archive` and `contents` over one composed view.
 *
 * @param view - The surface the operations read through; its mask is inherited.
 * @param policy - The reserved layout `versionedOnly` is asked about (D6).
 * @returns The same view, now answering the read content operations.
 * @public
 *
 * @example <caption>A host's rooted handler</caption>
 * ```typescript
 * import { composeView } from '@taucad/filesystem/composed-view';
 * import { withReadContentOps } from '@taucad/filesystem/content-ops';
 * import { tauPathPolicy } from '@taucad/filesystem/path-registry';
 * import type { RootedFileSystem } from '@taucad/filesystem';
 *
 * export async function exampleProjectArchive(filesystem: RootedFileSystem): Promise<Blob> {
 *   const view = composeView({ filesystem }, { consumer: 'user', policy: tauPathPolicy });
 *   return withReadContentOps(view, tauPathPolicy).archive('', { versionedOnly: true });
 * }
 * ```
 */
export const withReadContentOps = <View extends ContentFileSystem>(
  view: View,
  policy: Pick<PathPolicy, 'classify'>,
): View & ReadContentOps => {
  /* The registry answers about project-relative spellings, and an archive root
   * can be any directory of the project. The join assumes the view is rooted at
   * the project root, as the file manager's is; a view rooted below it would
   * need its own root joined first (charter W12). */
  const options = (path: string, filter?: ContentExportFilter): WalkOptions =>
    filter?.versionedOnly === true
      ? {
          admits: (relativePath, kind) =>
            kind === 'dir' || policy.classify(joinRelativePath(path, relativePath)).versioned,
        }
      : {};

  return Object.assign(view, {
    archive: async (path: string, filter?: ContentExportFilter): Promise<Blob> =>
      archive(view, path, options(path, filter)),
    contents: async (path: string, filter?: ContentExportFilter): Promise<Record<string, Uint8Array<ArrayBuffer>>> =>
      contents(view, path, options(path, filter)),
  });
};
