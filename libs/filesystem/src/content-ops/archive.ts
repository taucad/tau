/**
 * ZIP encoding, the one place it lives (charter D2, D15).
 *
 * @module
 */

import { contents } from '#content-ops/contents.js';
import type { ContentFileSystem } from '#content-ops/contents.js';
import type { WalkOptions } from '#content-ops/walk.js';

/**
 * Package a directory's subtree into a ZIP archive.
 *
 * @param filesystem - Provider, rooted filesystem or composed view to read through.
 * @param path       - Root-relative directory to archive; `''` is the surface's own root.
 * @param options    - Optional caller filter and abort signal.
 * @returns ZIP archive as a `Blob`.
 * @public
 */
export async function archive(filesystem: ContentFileSystem, path: string, options?: WalkOptions): Promise<Blob> {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- JSZip is the library's class name
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  for (const [relativePath, content] of Object.entries(await contents(filesystem, path, options))) {
    zip.file(relativePath, content);
  }
  return zip.generateAsync({ type: 'blob' });
}
