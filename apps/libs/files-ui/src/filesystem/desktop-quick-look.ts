import type { RuntimeClient } from '@taucad/runtime';
import type { RuntimeClientOptionsWithTransport } from '@taucad/runtime/client';
import type { RuntimeFileSystem } from '@taucad/runtime/filesystem';
import { assertRootedPath } from '@taucad/utils/path';
import { mimeTypes } from '@taucad/types/constants';
import { getComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import type { ComputeReuseMode } from '@taucad/ui-core/lib/compute-reuse-preference';
import { desktopBridge, nodeHomeRoot } from '#filesystem/desktop-bridge.js';
import { getProjectFileSystemConfig } from '#filesystem/handle-store.js';

type PreviewProjectFileOptions = {
  readonly path: string;
  readonly projectId: string;
  readonly runtimeFileSystem: RuntimeFileSystem;
};

/** What only the app supplies to a Quick Look conversion: its desktop kernel and its runtime telemetry. */
export type QuickLookServices = {
  /** The project's desktop kernel options, resolved when a file needs converting to USDZ. */
  readonly resolveKernelOptions: (
    projectId: string,
    computeMode: ComputeReuseMode,
  ) => Promise<(deps: { readonly fileSystem: RuntimeFileSystem }) => RuntimeClientOptionsWithTransport>;
  /** Load the observer that reports the conversion's runtime attempts; it returns the observation's stop. */
  readonly loadRuntimeObserver: () => Promise<(client: RuntimeClient) => () => void>;
};

/**
 * Convert one disk-backed project file when needed and open native macOS Quick Look.
 *
 * @param options - The project-relative path, its project and the runtime filesystem the conversion reads.
 * @param services - The app's desktop kernel and runtime observer.
 */
export const previewProjectFileInQuickLook = async (
  options: PreviewProjectFileOptions,
  services: QuickLookServices,
): Promise<void> => {
  const quickLook = desktopBridge()?.quickLook;
  if (!quickLook) {
    throw new Error('Quick Look is not available in this build of Tau.');
  }
  const config = await getProjectFileSystemConfig(options.projectId);
  if (config?.backend !== 'node') {
    throw new Error('Quick Look requires a project stored on this Mac.');
  }
  const path = assertRootedPath(options.path);
  const displayName = path.split('/').pop() ?? path;
  const systemPreview = quickLook.directPreviewExtensions.some((extension) =>
    path.toLowerCase().endsWith(`.${extension}`),
  );
  if (systemPreview) {
    const root = config.path ?? nodeHomeRoot();
    const result = await quickLook.previewPath({
      path: `${root}/${config.providerBasePath}/${path}`,
      displayName,
    });
    if (!result.success) {
      throw new Error(result.error);
    }
    return;
  }

  const [{ createRuntimeClient }, resolveOptions, observeRuntimeClient] = await Promise.all([
    import('@taucad/runtime/client'),
    services.resolveKernelOptions(options.projectId, getComputeReuseMode()),
    services.loadRuntimeObserver(),
  ]);
  const client = createRuntimeClient(resolveOptions({ fileSystem: options.runtimeFileSystem }));
  /* Runtime observability (FR-14): the conversion's attempts, reported by the renderer that issues them. */
  const stopObserving = observeRuntimeClient(client);
  const document = client.open({ source: { path }, watch: false });
  try {
    const exported = await document.export('usdz');
    if (!exported.success) {
      throw new Error(exported.issues[0]?.message ?? 'USDZ export failed');
    }
    const file = exported.files[0];
    if (exported.files.length !== 1 || !file.name.endsWith('.usdz') || file.mimeType !== mimeTypes.usdz) {
      throw new Error('Quick Look conversion did not return one USDZ file.');
    }
    const result = await quickLook.previewUsdz({ bytes: file.bytes, displayName: file.name });
    if (!result.success) {
      throw new Error(result.error);
    }
  } finally {
    document.close();
    await client.shutdown();
    stopObserving();
  }
};
