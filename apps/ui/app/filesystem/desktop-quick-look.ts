import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { assertRootedPath } from '@taucad/utils/path';
import { mimeTypes } from '@taucad/types/constants';
import { desktopKernelOptions } from '#constants/desktop-kernel-options.js';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';

type PreviewProjectFileOptions = {
  readonly path: string;
  readonly projectId: string;
  readonly runtimeFileSystem: RuntimeFileSystem;
};

/** Convert one disk-backed project file when needed and open native macOS Quick Look. */
export const previewProjectFileInQuickLook = async (options: PreviewProjectFileOptions): Promise<void> => {
  const bridge = desktopBridge();
  if (!bridge) {
    throw new Error('Quick Look is available only in the Tau desktop app.');
  }
  const config = await getProjectFileSystemConfig(options.projectId);
  if (config?.backend !== 'node') {
    throw new Error('Quick Look requires a project stored on this Mac.');
  }
  const path = assertRootedPath(options.path);
  const displayName = path.split('/').pop() ?? path;
  const systemPreview = bridge.quickLook.directPreviewExtensions.some((extension) =>
    path.toLowerCase().endsWith(`.${extension}`),
  );
  if (systemPreview) {
    const root = config.path ?? nodeHomeRoot();
    const result = await bridge.quickLook.previewPath({
      path: `${root}/${config.providerBasePath}/${path}`,
      displayName,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
    return;
  }

  const [{ createRuntimeClient }, resolveOptions] = await Promise.all([
    import('@taucad/runtime/client'),
    desktopKernelOptions(options.projectId)(),
  ]);
  const client = createRuntimeClient(resolveOptions({ fileSystem: options.runtimeFileSystem }));
  try {
    await client.connect();
    const exported = await client.export('usdz', { source: { path } });
    if (!exported.success) {
      throw new Error(exported.issues[0]?.message ?? 'USDZ export failed');
    }
    const file = exported.data[0];
    if (exported.data.length !== 1 || file?.name.endsWith('.usdz') !== true || file.mimeType !== mimeTypes.usdz) {
      throw new Error('Quick Look conversion did not return one USDZ file.');
    }
    const result = await bridge.quickLook.previewUsdz({ bytes: file.bytes, displayName: file.name });
    if (!result.success) {
      throw new Error(result.error);
    }
  } finally {
    client.terminate();
  }
};
