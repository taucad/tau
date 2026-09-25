import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { UIMatch } from 'react-router';
import type { RevisionRow } from '@taucad/revisions';
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
        messages: { success?: (value: unknown) => unknown; error?: string | ((error: unknown) => unknown) },
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

vi.mock('#routes/w.$workspace.$project/revision-save-shortcut.js', () => ({
  useSaveRevisionRequest: () => saveRequest,
}));

vi.mock('#hooks/use-thumbnail-generator.js', () => ({
  useThumbnailGenerator: () => ({ regenerate: vi.fn() }),
}));

vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', () => ({
  useProjectWorkspace: () => ({ openPanel }),
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => isTauDebugEnabled,
}));

/* One stable array: `useSyncExternalStore` re-renders forever on a new reference per read. */
const settlements: readonly never[] = [];
vi.mock('#chat-clients/_internal/browser-agent-host-transport.js', () => ({
  getHostFinalizedTurns: () => settlements,
  subscribeHostFinalizedTurns: () => () => undefined,
}));

vi.mock('#components/layout/command-palette.js', () => ({
  useCommandPaletteItems: (_matchId: string, factory: () => CommandPaletteItem[]) => {
    registeredItems = factory();
  },
}));

const { ProjectCommandPaletteItems } = await import('./project-command-items.js');

/* The palette reads the History the strip reads (`useRevisions`), which is a query. */
const wrapper = ({ children }: { readonly children: ReactNode }): React.JSX.Element => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const revisionRow = (over: Partial<RevisionRow> & Pick<RevisionRow, 'revisionId'>): RevisionRow => ({
  revisionNumber: undefined,
  changeId: `change-${over.revisionId}`,
  actor: 'user-1',
  source: 'user',
  createdAt: 1_788_220_800_000,
  summary: 'Saved changes',
  conflicted: false,
  turnId: undefined,
  tags: [],
  ...over,
});

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

  /* D2, M1: Undo restore is offered where the strip offers it — on the line whose head a restore minted,
     while nothing has landed after it — so the palette never sends an undo the machine would refuse. */
  it('offers Undo restore only where the restore machine holds an undo target and nothing landed after it', async () => {
    revisionStatusHarness.rows = [
      revisionRow({ revisionId: 'rev-3', revisionNumber: 3, trigger: 'restore', restoredFrom: 'rev-1' }),
      revisionRow({ revisionId: 'rev-2', revisionNumber: 2 }),
      revisionRow({ revisionId: 'rev-1', revisionNumber: 1 }),
    ];
    /* A reload, or a restore another device made: the head is a restore row, but the machine holds no undo target. */
    revisionStatusHarness.status = { ...revisionStatusHarness.status, headRevisionId: 'rev-3' };
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
    await waitFor(() => {
      expect(registeredItems.find((item) => item.id === 'undo-restore')).toBeDefined();
    });
    expect(registeredItems.find((item) => item.id === 'undo-restore')?.visible).toBe(false);

    /* This device's restore minted the head: the machine's own undo target. */
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      restore: { ...revisionStatusHarness.status.restore, undoable: true },
    };
    rerender(<ProjectCommandPaletteItems match={match} />);
    await waitFor(() => {
      expect(registeredItems.find((item) => item.id === 'undo-restore')?.visible).toBe(true);
    });
    const undo = registeredItems.find((item) => item.id === 'undo-restore');
    expect(undo?.group).toBe('Revisions');
    undo?.action?.();
    expect(revisionStatusHarness.commands.undo).toHaveBeenCalledOnce();

    revisionStatusHarness.status = { ...revisionStatusHarness.status, dirty: true };
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'undo-restore')?.visible).toBe(false);

    /* A save landed on top: the projection says the restore row is no longer undoable. */
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      dirty: false,
      restore: { ...revisionStatusHarness.status.restore, undoable: false },
    };
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'undo-restore')?.visible).toBe(false);

    revisionStatusHarness.role = 'read';
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      restore: { ...revisionStatusHarness.status.restore, undoable: true },
    };
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'undo-restore')?.visible).toBe(false);
  });

  it('should defer command registration until project context exists', () => {
    hasProjectContext = false;
    const view = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
    expect(registeredItems).toEqual([]);

    hasProjectContext = true;
    view.rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'share-project')).toBeDefined();
  });

  it('keeps Export navigation available while geometry is pending', () => {
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

    const exportItem = registeredItems.find((item) => item.id === 'export');
    expect(exportItem?.disabled).toBeUndefined();
    exportItem?.action?.();
    expect(openPanel).toHaveBeenCalledWith('export');
  });

  it('registers Share with the shared Workbench owner', () => {
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });
    registeredItems.find((item) => item.id === 'share-project')?.action?.();
    expect(openPanel).toHaveBeenCalledWith('share');
  });

  it('routes every Workbench command through the shared workspace owner', () => {
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

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
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

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
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(false);

    revisionStatusHarness.role = 'read';
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(true);

    revisionStatusHarness.role = 'revoked';
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'sync-now')?.disabled).toBe(true);
  });

  /* RA3/HQ7: one Revisions group, and backup verbs wait until the line is known. */
  it('keeps every revision verb in one group, deferring Change backup and Disconnect until the line is known', () => {
    revisionStatusHarness.status = {
      ...revisionStatusHarness.status,
      line: { kind: 'unknown' },
      remote: { ...revisionStatusHarness.status.remote, kind: 'tau', phase: 'connected' },
    };
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
    const revisionIds = ['change-backup', 'disconnect-remote', 'sync-now', 'save-revision', 'revision-history'];
    for (const id of revisionIds) {
      expect(registeredItems.find((item) => item.id === id)?.group).toBe('Revisions');
    }
    expect(registeredItems.find((item) => item.id === 'change-backup')?.visible).toBe(false);
    expect(registeredItems.find((item) => item.id === 'disconnect-remote')?.visible).toBe(false);

    revisionStatusHarness.status = { ...revisionStatusHarness.status, line: { kind: 'branch', name: 'main' } };
    rerender(<ProjectCommandPaletteItems match={match} />);
    expect(registeredItems.find((item) => item.id === 'change-backup')?.visible).toBe(true);
  });

  it('keeps Kernel hidden unless tauDebug is enabled', () => {
    const { rerender } = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
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
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

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
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

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
    render(<ProjectCommandPaletteItems match={match} />, { wrapper });

    registeredItems.find((item) => item.id === 'download-zip')?.action?.();

    await vi.waitFor(() => {
      expect(toastFailures).toEqual(['Failed to create ZIP archive: EACCES: workspace folder is unreadable']);
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('reacts to camera registration and unregistration for a stable graphics actor', () => {
    geometryFormat = 'gltf';
    const view = render(<ProjectCommandPaletteItems match={match} />, { wrapper });
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
