import { render } from '@testing-library/react';
import type { UIMatch } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExportFile } from '@taucad/types';
import type { CommandPaletteItem } from '#components/layout/command-palette.js';
import { revisionStatusHarness } from '#hooks/use-revision-status.test-harness.js';

let registeredItems: CommandPaletteItem[] = [];
let isTauDebugEnabled = false;
let geometryFormat: 'gltf' | 'svg' | undefined;
let cameraState: Record<string, unknown> | undefined;
let cameraRegistryVersion = 0;
let hasProjectContext = true;
const openPanel = vi.fn();
const captureCadImages = vi.fn<(options: unknown) => Promise<ExportFile[]>>();
const downloadBlob = vi.fn<(blob: Blob, filename: string) => void>();
const getZippedDirectory = vi.fn<(path: string, options?: { versionedOnly?: boolean }) => Promise<Blob>>();
const runtimeFileSystem = {};
const imageService = { export: vi.fn() };
const saveRequest = vi.fn(async () => undefined);
/** Whatever the failure branch of a `toast.promise` rendered. */
const toastFailures: unknown[] = [];

const cadActor = {
  getSnapshot: () => ({ context: { geometry: geometryFormat ? { format: geometryFormat } : undefined } }),
  on: () => ({ unsubscribe: vi.fn() }),
};
const graphicsActor = {
  getSnapshot: () => ({ context: { cameraState } }),
};

vi.mock('@xstate/react', () => ({
  useSelector: (actor: { getSnapshot: () => unknown } | undefined, selector: (state: unknown) => unknown) =>
    selector(actor?.getSnapshot()),
  useActorRef: () => ({ send: vi.fn() }),
}));

vi.mock('#hooks/use-project.js', () => ({
  useProject: (options?: { readonly enableNoContext?: boolean }) => {
    if (!hasProjectContext) {
      if (options?.enableNoContext) {
        return undefined;
      }
      throw new Error('useProject must be used within a ProjectProvider');
    }
    return {
      geometryUnits: new Map([['main.ts', cadActor]]),
      mainEntryPath: 'main.ts',
      projectRef: {
        getSnapshot: () => ({
          context: {
            project: { id: 'test-project', name: 'test-project' },
          },
        }),
      },
    };
  },
  useMainGraphics: () => graphicsActor,
}));

vi.mock('#services/headless-capture.js', () => ({ captureCadImages }));

vi.mock('#hooks/use-graphics.js', () => ({
  useGraphicsCameraRigQuery: () => {
    const _version = cameraRegistryVersion;
    return () => Boolean(cameraState) && _version >= 0;
  },
}));
vi.mock('#services/graphics-camera-registry.js', () => ({
  hasGraphicsCameraRig: () => Boolean(cameraState),
  getGraphicsCameraState: () => cameraState,
}));

vi.mock('@taucad/utils/file', () => ({ downloadBlob }));

vi.mock('#components/ui/sonner.js', () => ({
  toast: {
    promise: vi.fn(
      async (
        work: Promise<unknown> | (() => Promise<unknown>),
        messages: { success?: (value: unknown) => unknown; error?: unknown },
      ) => {
        try {
          const value = await (typeof work === 'function' ? work() : work);
          messages.success?.(value);
        } catch (error) {
          toastFailures.push(typeof messages.error === 'function' ? messages.error(error) : messages.error);
        }
      },
    ),
    success: vi.fn(),
  },
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    getZippedDirectory,
    writeFile: vi.fn(),
    runtimeFileSystem,
  }),
}));

vi.mock('#providers/headless-image-provider.js', () => ({
  useHeadlessImageService: () => imageService,
}));

vi.mock('#hooks/use-file-tree.js', () => ({
  useFileTreeMap: () => new Map([['main.ts', {}]]),
}));

/* Every revision surface's suite scripts the one client through this harness,
 * so two surfaces cannot assert different shapes of the same projection. */
vi.mock('#hooks/use-revision-status.js', async () => {
  const harness = await import('#hooks/use-revision-status.test-harness.js');
  return harness.revisionStatusMock();
});

vi.mock('#hooks/use-revisions.js', () => ({
  useRevisions: () => ({ canReturnToLatest: false, revisions: [], headRevisionId: undefined, isDirty: false }),
}));
vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({
  useSaveRevisionRequest: () => saveRequest,
}));

vi.mock('#hooks/use-thumbnail-generator.js', () => ({
  useThumbnailGenerator: () => ({ regenerate: vi.fn() }),
}));

vi.mock('#hooks/use-restore-to-point.js', () => ({
  useRestoreToPoint: () => ({ returnToLatest: vi.fn() }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => isTauDebugEnabled,
}));

vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_matchId: string, factory: () => CommandPaletteItem[]) => {
    registeredItems = factory();
  },
}));

const { ProjectCommandPaletteItems } = await import('./project-command-items.js');

const match: UIMatch = {
  data: undefined,
  handle: undefined,
  id: 'project-route',
  loaderData: undefined,
  params: {},
  pathname: '/projects/project-1',
};

describe('ProjectCommandPaletteItems', () => {
  beforeEach(() => {
    registeredItems = [];
    isTauDebugEnabled = false;
    geometryFormat = undefined;
    cameraState = undefined;
    cameraRegistryVersion = 0;
    hasProjectContext = true;
    openPanel.mockClear();
    captureCadImages.mockReset();
    downloadBlob.mockReset();
    saveRequest.mockReset();
    getZippedDirectory.mockReset();
    toastFailures.length = 0;
    revisionStatusHarness.reset();
  });

  it('should defer command registration until project context exists', () => {
    hasProjectContext = false;
    const view = render(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems).toEqual([]);

    hasProjectContext = true;
    view.rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'share-project')).toBeDefined();
  });

  it('keeps Export navigation available while geometry is pending', () => {
    render(<ProjectCommandPaletteItems match={match} />);

    const exportItem = registeredItems.find((item) => item.id === 'export');
    expect(exportItem?.disabled).toBeUndefined();
    exportItem?.action?.();
    expect(openPanel).toHaveBeenCalledWith('export');
  });

  it('registers Share with the shared Workbench owner', () => {
    render(<ProjectCommandPaletteItems match={match} />);
    registeredItems.find((item) => item.id === 'share-project')?.action?.();
    expect(openPanel).toHaveBeenCalledWith('share');
  });

  it('routes every Workbench command through the shared workspace owner', () => {
    render(<ProjectCommandPaletteItems match={match} />);

    const expectedPanels = new Map([
      ['open-parameters', 'parameters'],
      ['open-files', 'files'],
      ['open-model', 'model'],
      ['open-details', 'details'],
      ['revision-history', 'revisions'],
    ]);
    for (const [commandId, panelId] of expectedPanels) {
      registeredItems.find((item) => item.id === commandId)?.action?.();
      expect(openPanel).toHaveBeenLastCalledWith(panelId);
    }
    expect(openPanel).toHaveBeenCalledTimes(expectedPanels.size);
  });

  it('routes backup choices through Revisions and uses the shared save request', () => {
    render(<ProjectCommandPaletteItems match={match} />);

    registeredItems.find((item) => item.id === 'connect-tau-cloud')?.action?.();
    expect(openPanel).toHaveBeenLastCalledWith('revisions');
    registeredItems.find((item) => item.id === 'save-revision')?.action?.();
    expect(saveRequest).toHaveBeenCalledOnce();
    expect(registeredItems.find((item) => item.id === 'sync-now')?.visible).toBe(false);
  });

  /*
   * F1: the palette offers exactly what the Sync region offers.
   *
   * `fetchOnly` alone left *Sync now* enabled for a read collaborator, whose
   * push `PUT /v1/projects/:id` refuses — a command that cannot work is worse
   * than one that is not there, because it fails after the person has committed
   * to it.
   */
  it('disables Sync now for a read collaborator and for a revoked one', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected', fetchOnly: false },
    };

    revisionStatusHarness.role = 'write';
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(false);

    revisionStatusHarness.role = 'read';
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(true);

    revisionStatusHarness.role = 'revoked';
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(true);
  });

  it('keeps Kernel hidden unless tauDebug is enabled', () => {
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'open-kernel')?.visible).toBe(false);

    isTauDebugEnabled = true;
    rerender(<ProjectCommandPaletteItems match={match} />);
    const kernel = registeredItems.find((item) => item.id === 'open-kernel');
    expect(kernel?.visible).toBe(true);
    kernel?.action?.();
    expect(openPanel).toHaveBeenCalledWith('kernel');
  });

  it.each([
    ['gltf', { position: [1, 2, 3] }],
    ['svg', undefined],
  ] as const)('downloads settled %s PNG bytes through the shared headless capture path', async (format, state) => {
    geometryFormat = format;
    cameraState = state;
    captureCadImages.mockResolvedValue([
      { name: 'render.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) },
    ]);
    render(<ProjectCommandPaletteItems match={match} />);

    const download = registeredItems.find((item) => item.id === 'download-png');
    expect(download?.disabled).toBe(false);
    download?.action?.();
    await vi.waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledOnce();
    });

    expect(captureCadImages).toHaveBeenCalledWith({
      cadRef: cadActor,
      graphicsRef: graphicsActor,
      cameraState: state,
      imageService,
      recipe: { purpose: 'utility', mode: 'current' },
    });
    const [blob, filename] = downloadBlob.mock.calls[0]!;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('image/png');
    expect(filename).toBe('test-project.png');
  });

  it('should archive the file manager root, not an absolute project path', async () => {
    getZippedDirectory.mockResolvedValue(new Blob(['zip']));
    render(<ProjectCommandPaletteItems match={match} />);

    registeredItems.find((item) => item.id === 'download-zip')?.action?.();

    await vi.waitFor(() => {
      expect(downloadBlob).toHaveBeenCalledOnce();
    });
    /* `''` is this provider's root. An absolute spelling is a foreign key to
     * the workspace-relative facade and never reaches the authority. */
    expect(getZippedDirectory).toHaveBeenCalledWith('', { versionedOnly: true });
    expect(downloadBlob.mock.calls[0]?.[1]).toBe('test-project.zip');
  });

  it('should name the cause when the archive cannot be built', async () => {
    getZippedDirectory.mockRejectedValue(new Error('EACCES: workspace folder is unreadable'));
    render(<ProjectCommandPaletteItems match={match} />);

    registeredItems.find((item) => item.id === 'download-zip')?.action?.();

    await vi.waitFor(() => {
      expect(toastFailures).toEqual(['Failed to create ZIP archive: EACCES: workspace folder is unreadable']);
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('reacts to camera registration and unregistration for a stable graphics actor', () => {
    geometryFormat = 'gltf';
    const view = render(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'download-png')?.disabled).toBe(true);

    cameraState = { position: [1, 2, 3] };
    cameraRegistryVersion += 1;
    view.rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'download-png')?.disabled).toBe(false);

    cameraState = undefined;
    cameraRegistryVersion += 1;
    view.rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'download-png')?.disabled).toBe(true);
  });
});
