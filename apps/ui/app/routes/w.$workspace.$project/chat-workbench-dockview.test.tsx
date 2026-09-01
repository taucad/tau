/* oxlint-disable @typescript-eslint/consistent-type-assertions -- Dockview structural test doubles cover only exercised fields */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import type {
  DockviewApi,
  DockviewDidDropEvent,
  DockviewGroupPanel,
  DockviewPanelApi,
  IDockviewHeaderActionsProps,
  IDockviewPanel,
  IDockviewPanelHeaderProps,
  IDockviewPanelProps,
  IWatermarkPanelProps,
  SerializedDockview,
} from 'dockview-react';
import type { FileContentResult } from '@taucad/fs-client/file-content-service';
import { tauFileDragMime, tauViewerPanelDragMime } from '@taucad/types/constants';
import type { PendingFilePlacement } from '#routes/w.$workspace.$project/chat-workbench-dockview.js';
import type * as ProjectWorkspaceContext from '#routes/w.$workspace.$project/project-workspace-context.js';
import { TooltipProvider } from '@taucad/ui/components/tooltip';

const { mobileState, mockOpenPanel, mockProjectSend, mockToastError } = vi.hoisted(() => ({
  mobileState: { value: false },
  mockOpenPanel: vi.fn(),
  mockProjectSend: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { error: mockToastError } }));
vi.mock('#components/panes/use-is-top-right-group.js', () => ({
  useIsTopRightGroup: () => true,
}));
vi.mock('@taucad/ui/hooks/use-mobile', () => ({ useIsMobile: () => mobileState.value }));
vi.mock('#components/panes/dockview-split-action.js', () => ({
  DockviewSplitAction: ({
    containerApi,
    group,
    onDidSplit,
  }: IDockviewHeaderActionsProps & { onDidSplit?: (group: DockviewGroupPanel) => void }) => (
    <button
      type='button'
      onClick={() => {
        onDidSplit?.(containerApi.addGroup({ referenceGroup: group, direction: 'right' }));
      }}
    >
      Split view
    </button>
  ),
}));
vi.mock('#routes/w.$workspace.$project/project-workspace-context.js', async (importOriginal) => ({
  ...(await importOriginal<typeof ProjectWorkspaceContext>()),
  useProjectWorkspace: () => ({ openPanel: mockOpenPanel }),
}));

vi.mock('#routes/w.$workspace.$project/chat-file-tree.js', () => ({
  FileTreePanelBody: ({ actionsContainer }: { readonly actionsContainer?: Element | DocumentFragment | null }) => (
    <>
      {actionsContainer
        ? createPortal(
            <>
              <button type='button' aria-label='Create new file' />
              <button type='button' aria-label='Create new folder' />
              <button type='button' aria-label='Collapse all folders' />
            </>,
            actionsContainer,
          )
        : null}
      <div data-testid='file-tree' />
    </>
  ),
}));
vi.mock('#components/ui/pane-button.js', () => ({
  PaneButton: ({
    tooltip: _tooltip,
    tooltipSide: _tooltipSide,
    size: _size,
    ...properties
  }: React.ComponentProps<'button'> & {
    tooltip?: React.ReactNode;
    tooltipSide?: 'left' | 'right' | 'top' | 'bottom';
    size?: 'icon' | 'label';
  }) => <button type='button' {...properties} />,
}));

const mockResolve = vi.fn();
const mockReadRawBytes = vi.fn();
const mockWriteFile = vi.fn();
const mockContentSaveEditor = vi.fn(async () => undefined);
const mockAcquireModel = vi.fn(async () => undefined);
const mockReleaseModel = vi.fn();
const mockIsApplyingFilesystemContent = vi.fn(() => false);
const mockSaveEditor = vi.fn<(path: string, data: Uint8Array<ArrayBuffer>) => Promise<void>>(async () => undefined);
const mockModelService = {
  acquireModel: mockAcquireModel,
  releaseModel: mockReleaseModel,
  isApplyingFilesystemContent: mockIsApplyingFilesystemContent,
  saveEditor: mockSaveEditor,
};

const mockUseFileContent = vi.fn<(path: string | undefined) => FileContentResult>();

vi.mock('#hooks/use-file-content.js', () => ({
  useFileContent: (path: string | undefined) => mockUseFileContent(path),
}));

vi.mock('#hooks/use-file-manager.js', () => ({
  useFileManager: () => ({
    contentService: { resolve: mockResolve, readRawBytes: mockReadRawBytes, saveEditor: mockContentSaveEditor },
    writeFile: mockWriteFile,
  }),
}));

const editorMachineSnapshot = {
  context: {
    openFiles: [] as Array<{ paneId: string; path: string; readOnly?: boolean }>,
    panelState: { desktopLayout: { workbenchOpen: true } },
  },
  status: 'active',
  output: undefined,
  error: undefined,
};

const mockEditorRef = {
  send: vi.fn(),
  getSnapshot: () => editorMachineSnapshot,
  subscribe: () => ({ unsubscribe: vi.fn() }),
};

vi.mock('#hooks/use-project.js', () => ({
  useProject: () => ({
    editorRef: mockEditorRef,
    geometryUnits: new Map(),
    mainEntryPath: 'main.ts',
    projectRef: { send: mockProjectSend },
  }),
}));

const mockUseMonacoServices = vi.fn(() => ({ modelService: mockModelService as typeof mockModelService | undefined }));

vi.mock('#hooks/use-monaco-model-service.js', () => ({
  useMonacoServices: () => ({ ...mockUseMonacoServices(), markerService: undefined }),
}));

vi.mock('#hooks/use-kernel-diagnostics.js', () => ({
  useKernelDiagnostics: () => ({ handleValidate: vi.fn() }),
}));

vi.mock('#flags/use-feature.js', () => ({
  useFeature: () => false,
}));

vi.mock('@monaco-editor/react', () => ({
  useMonaco: () => undefined,
}));

const defaultViewer = ({
  filePath,
  content,
}: {
  filePath: string;
  content: string;
  onChange?: (value: string) => void;
}) => (
  <div data-testid='viewer'>
    <div data-testid='viewer-path'>{filePath}</div>
    <div data-testid='viewer-content'>{content}</div>
  </div>
);
const mockResolveViewer = vi.fn().mockReturnValue(defaultViewer);

vi.mock('#routes/w.$workspace.$project/file-viewers/built-in-viewers.js', () => ({
  fileViewerRouter: {
    resolve: (probe: { readonly path: string; readonly content: { readonly kind: 'text' | 'binary' } }) => {
      if (probe.content.kind === 'binary') {
        return {
          id: 'binary-warning',
          requestsFiles: false,
          render: (request: {
            readonly binaryFallback?: { readonly onForceOpen: () => void };
            readonly renderPane: (content: { readonly body: React.ReactNode }) => React.ReactNode;
          }) =>
            request.renderPane({
              body: (
                <div>
                  <p>The file is binary or uses an unsupported text encoding.</p>
                  <button type='button' onClick={request.binaryFallback?.onForceOpen}>
                    Open Anyway
                  </button>
                </div>
              ),
            }),
        };
      }
      const Viewer = mockResolveViewer(probe) as typeof defaultViewer;
      return {
        id: 'viewer',
        requestsFiles: true,
        presentation: probe.path.toLowerCase().endsWith('.md')
          ? {
              defaultViewId: 'preview',
              views: [
                { id: 'preview', label: 'Preview' },
                { id: 'source', label: 'Source' },
              ],
            }
          : undefined,
        render: (request: {
          readonly path: string;
          readonly resource: { readonly outcome: FileContentResult };
          readonly textEditor?: { readonly onChange: (value: string | undefined) => void };
          readonly renderPane: (content: {
            readonly actions?: React.ReactNode;
            readonly body: React.ReactNode;
          }) => React.ReactNode;
        }) => {
          const { outcome } = request.resource;
          const content = outcome.kind === 'text' ? new TextDecoder().decode(outcome.content) : '';
          return request.renderPane({
            actions:
              probe.path === 'README.md' ? (
                <button type='button' aria-label='Viewer action'>
                  Viewer
                </button>
              ) : undefined,
            body: (
              <Viewer
                filePath={request.path}
                content={content}
                onChange={request.textEditor?.onChange as (value: string) => void}
              />
            ),
          });
        },
      };
    },
  },
}));

vi.mock('#components/files/file-selector.js', () => ({
  FileSelector: () => <div data-testid='file-selector' />,
}));

const {
  FileEditor,
  handleWorkbenchDrop,
  handleWorkbenchPanelRemoved,
  isWorkbenchPanelFilesContext,
  openWorkbenchUtility,
  isWorkbenchSurfaceAllowed,
  openWorkbenchFiles,
  openFilesFromPlaceholder,
  createWorkbenchNewTab,
  replaceWorkbenchPlaceholderWithUtility,
  reconcileWorkbenchFiles,
  normalizeFilePaneState,
  restoreWorkbenchLayout,
  seedFreshWorkbench,
  WorkbenchEmptyGroupWatermark,
  WorkbenchDockviewTab,
  WorkbenchLeftActions,
  WorkbenchPlaceholderPanel,
  WorkbenchRightHeaderActions,
  workbenchSurfaces,
  workbenchPanels,
} = await import('#routes/w.$workspace.$project/chat-workbench-dockview.js');

const createTabProperties = ({
  id,
  title,
  params = {},
}: {
  readonly id: string;
  readonly title: string;
  readonly params?: Record<string, unknown>;
}): IDockviewPanelHeaderProps => {
  const group = { panels: [] } as unknown as DockviewGroupPanel;
  const api = {
    id,
    title,
    group,
    close: vi.fn(),
    setActive: vi.fn(),
    updateParameters: vi.fn(),
    onDidTitleChange: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as DockviewPanelApi;
  group.panels.push({ id, api } as unknown as IDockviewPanel);

  return {
    api,
    containerApi: { addGroup: vi.fn() } as unknown as DockviewApi,
    params,
    tabLocation: 'header',
  };
};

describe('WorkbenchDockviewTab', () => {
  it('uses one custom menu for utility and file tabs while keeping file-only actions contextual', async () => {
    const utility = createTabProperties({ id: 'workbench:parameters', title: 'Parameters' });
    const { unmount } = render(
      <TooltipProvider>
        <WorkbenchDockviewTab {...utility} />
      </TooltipProvider>,
    );

    fireEvent.contextMenu(screen.getByText('Parameters'));

    expect(await screen.findByRole('menuitem', { name: 'Close' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Copy Path' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Split Right' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Open in Viewer' })).not.toBeInTheDocument();

    unmount();

    const file = createTabProperties({ id: 'file-1', title: 'main.ts', params: { filePath: 'src/main.ts' } });
    render(
      <TooltipProvider>
        <WorkbenchDockviewTab {...file} />
      </TooltipProvider>,
    );

    fireEvent.contextMenu(screen.getByText('main.ts'));

    expect(await screen.findByRole('menuitem', { name: 'Open in Viewer' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Reveal in File Tree' }));
    expect(file.api.updateParameters).toHaveBeenCalledWith({ filesOpen: true });
    expect(file.api.setActive).toHaveBeenCalledOnce();
  });
});

const mockPanelApi = {
  updateParameters: vi.fn(),
  setTitle: vi.fn(),
} as unknown as IDockviewPanelProps['api'];

describe('WorkbenchRightHeaderActions', () => {
  beforeEach(() => {
    mobileState.value = false;
  });

  it('keeps an exact slot for the persistent toggle', () => {
    const properties = { group: {}, containerApi: {} } as unknown as IDockviewHeaderActionsProps;
    render(<WorkbenchRightHeaderActions {...properties} />);

    const slot = screen.getByTestId('workbench-toggle-slot');
    expect(slot).toHaveClass('size-7');
    expect(screen.queryByRole('button', { name: /Split/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Toggle Workbench lane' })).not.toBeInTheDocument();
  });

  it('does not reserve the desktop toggle slot in the mobile workbench', () => {
    mobileState.value = true;
    const properties = { group: {}, containerApi: {} } as unknown as IDockviewHeaderActionsProps;
    render(<WorkbenchRightHeaderActions {...properties} />);

    expect(screen.queryByRole('button', { name: /Split/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('workbench-toggle-slot')).not.toBeInTheDocument();
  });

  it('keeps the reserved top-right rail above the body-scoped Files sidecar', () => {
    const properties = { group: {}, containerApi: {} } as unknown as IDockviewHeaderActionsProps;
    render(<WorkbenchRightHeaderActions {...properties} />);

    expect(screen.getByTestId('workbench-toggle-slot')).toBeInTheDocument();
  });
});

describe('FileEditor routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    editorMachineSnapshot.context.openFiles = [];
    mockIsApplyingFilesystemContent.mockReturnValue(false);
    mockSaveEditor.mockResolvedValue(undefined);
    mockContentSaveEditor.mockResolvedValue(undefined);
    mockUseMonacoServices.mockReturnValue({ modelService: mockModelService });
    mockResolveViewer.mockReturnValue(defaultViewer);
  });

  it('should render the loader when outcome is loading', () => {
    mockUseFileContent.mockReturnValue({ kind: 'loading' });

    const { container } = render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    expect(container.querySelector('[data-slot="loader"], svg')).toBeTruthy();
    expect(screen.getAllByRole('group', { name: 'File actions for mystery.dat' })).toHaveLength(1);
  });

  it('should render the binary warning when outcome is binary, regardless of filename', () => {
    mockUseFileContent.mockReturnValue({
      kind: 'binary',
      size: 5 * 1024 * 1024,
      head: new Uint8Array([0x00, 0x01, 0x02]),
      revision: 1,
    });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    expect(screen.getByText(/binary or uses an unsupported text encoding/i)).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'File actions for mystery.dat' })).toHaveLength(1);
  });

  it('should re-resolve with forceText and large sizeLimit when Open Anyway is clicked on a binary file', async () => {
    const user = userEvent.setup();
    mockUseFileContent.mockReturnValue({
      kind: 'binary',
      size: 5 * 1024 * 1024,
      head: new Uint8Array([0x00, 0x01, 0x02]),
      revision: 1,
    });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    await user.click(screen.getByRole('button', { name: /open anyway/i }));

    expect(mockResolve).toHaveBeenCalledWith('mystery.dat', {
      forceText: true,
      sizeLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it('should render the too-large warning with size and limit when outcome is too-large', () => {
    mockUseFileContent.mockReturnValue({
      kind: 'too-large',
      size: 5 * 1024 * 1024,
      limit: 2 * 1024 * 1024,
    });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/2\.0 MB/)).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'File actions for mystery.dat' })).toHaveLength(1);
  });

  it('should re-resolve with large sizeLimit when Open Anyway is clicked on a too-large file', async () => {
    const user = userEvent.setup();
    mockUseFileContent.mockReturnValue({
      kind: 'too-large',
      size: 5 * 1024 * 1024,
      limit: 2 * 1024 * 1024,
    });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    await user.click(screen.getByRole('button', { name: /open anyway/i }));

    expect(mockResolve).toHaveBeenCalledWith('mystery.dat', {
      sizeLimit: Number.MAX_SAFE_INTEGER,
    });
  });

  it('should render the error placeholder with the cause when outcome is error', () => {
    mockUseFileContent.mockReturnValue({ kind: 'error', cause: new Error('disk on fire') });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    expect(screen.getByText(/failed to load file/i)).toBeInTheDocument();
    expect(screen.getByText(/disk on fire/)).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'File actions for mystery.dat' })).toHaveLength(1);
  });

  it('should render the file-not-found placeholder with the file selector when outcome is orphaned', () => {
    mockUseFileContent.mockReturnValue({ kind: 'orphaned' });

    render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

    expect(screen.getByText(/file not found/i)).toBeInTheDocument();
    expect(screen.getAllByTestId('file-selector')).toHaveLength(2);
    expect(screen.getAllByRole('group', { name: 'File actions for mystery.dat' })).toHaveLength(1);
  });

  it('should render the resolved viewer with decoded text content when outcome is text', () => {
    const content = new TextEncoder().encode('hello world');
    mockUseFileContent.mockReturnValue({ kind: 'text', content });

    render(<FileEditor paneId='test-pane' filePath='main.ts' panelApi={mockPanelApi} />);

    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    expect(screen.getByTestId('viewer-content').textContent).toBe('hello world');
    expect(screen.getByTestId('viewer-path').textContent).toBe('main.ts');
  });

  it('should own an accessible Files control, region, and width in the file pane', async () => {
    mockUseFileContent.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('hello') });

    render(
      <FileEditor
        paneId='test-pane'
        filePath='main.ts'
        parameters={{ filePath: 'main.ts', filesOpen: true, filesWidth: 312 }}
        panelApi={mockPanelApi}
      />,
    );

    const toggle = screen.getByRole('button', { name: 'Hide files for main.ts' });
    const region = screen.getByRole('region', { name: 'Files for main.ts' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('aria-controls', region.id);
    expect(region).toHaveStyle({ width: '312px' });
    expect(screen.getByTestId('file-tree')).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize Files pane' }), { key: 'ArrowLeft' });
    expect(mockPanelApi.updateParameters).toHaveBeenCalledWith({ filesWidth: 320 });

    await userEvent.click(toggle);
    expect(mockPanelApi.updateParameters).toHaveBeenCalledWith({ filesOpen: false });
  });

  it('should show file-tree actions before the Files toggle only while the pane is open', () => {
    mockUseFileContent.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('hello') });
    const { rerender } = render(
      <FileEditor
        paneId='test-pane'
        filePath='main.ts'
        parameters={{ filePath: 'main.ts', filesOpen: true }}
        panelApi={mockPanelApi}
      />,
    );

    const actions = screen.getByRole('group', { name: 'File actions for main.ts' });
    expect(
      within(actions)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Create new file', 'Create new folder', 'Collapse all folders', 'Hide files for main.ts']);

    rerender(
      <FileEditor
        paneId='test-pane'
        filePath='main.ts'
        parameters={{ filePath: 'main.ts', filesOpen: false }}
        panelApi={mockPanelApi}
      />,
    );

    expect(within(actions).queryByRole('button', { name: 'Create new file' })).not.toBeInTheDocument();
  });

  it('should omit Files controls for an ineligible viewer despite stale pane state', () => {
    mockUseFileContent.mockReturnValue({
      kind: 'binary',
      size: 3,
      head: new Uint8Array([0, 1, 2]),
      revision: 1,
    });

    render(
      <FileEditor
        paneId='image-pane'
        filePath='image.bin'
        parameters={{ filePath: 'image.bin', filesOpen: true }}
        panelApi={mockPanelApi}
      />,
    );

    expect(screen.queryByRole('button', { name: /files for image\.bin/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Files for image.bin' })).not.toBeInTheDocument();
  });

  it('should expose the inverse Markdown view action through pane parameters', async () => {
    mockUseFileContent.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('# Hello') });

    render(
      <FileEditor
        paneId='markdown-pane'
        filePath='README.md'
        parameters={{ filePath: 'README.md', filesOpen: false, viewId: 'preview' }}
        panelApi={mockPanelApi}
      />,
    );

    const actions = screen.getByRole('group', { name: 'File actions for README.md' });
    const orderedActions = within(actions).getAllByRole('button');
    expect(orderedActions.map((action) => action.getAttribute('aria-label') ?? action.textContent)).toEqual([
      'Viewer action',
      'View source',
      'Show files for README.md',
    ]);
    expect(
      within(screen.getByTestId('viewer')).queryByRole('button', { name: 'Viewer action' }),
    ).not.toBeInTheDocument();

    await userEvent.click(within(actions).getByRole('button', { name: 'View source' }));
    expect(mockPanelApi.updateParameters).toHaveBeenCalledWith({ viewId: 'source' });
    expect(screen.getByRole('button', { name: 'Show files for README.md' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('should keep simultaneous file-pane owners independent', async () => {
    mockUseFileContent.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('hello') });
    const firstApi = { updateParameters: vi.fn(), setTitle: vi.fn() } as unknown as IDockviewPanelProps['api'];
    const secondApi = { updateParameters: vi.fn(), setTitle: vi.fn() } as unknown as IDockviewPanelProps['api'];

    render(
      <>
        <FileEditor
          paneId='first-pane'
          filePath='first.ts'
          parameters={{ filePath: 'first.ts', filesOpen: true, filesWidth: 200 }}
          panelApi={firstApi}
        />
        <FileEditor
          paneId='second-pane'
          filePath='second.ts'
          parameters={{ filePath: 'second.ts', filesOpen: true, filesWidth: 344 }}
          panelApi={secondApi}
        />
      </>,
    );

    expect(screen.getByRole('region', { name: 'Files for first.ts' })).toHaveStyle({ width: '200px' });
    expect(screen.getByRole('region', { name: 'Files for second.ts' })).toHaveStyle({ width: '344px' });

    await userEvent.click(screen.getByRole('button', { name: 'Hide files for first.ts' }));
    expect(firstApi.updateParameters).toHaveBeenCalledWith({ filesOpen: false });
    expect(secondApi.updateParameters).not.toHaveBeenCalled();
  });

  it('should replace viewer actions atomically with the selected viewer', () => {
    mockUseFileContent.mockReturnValue({ kind: 'text', content: new TextEncoder().encode('# Hello') });
    const { rerender } = render(
      <FileEditor
        paneId='test-pane'
        filePath='README.md'
        parameters={{ filePath: 'README.md', filesOpen: false, viewId: 'preview' }}
        panelApi={mockPanelApi}
      />,
    );
    expect(screen.getByRole('button', { name: 'Viewer action' })).toBeInTheDocument();

    rerender(
      <FileEditor
        paneId='test-pane'
        filePath='main.ts'
        parameters={{ filePath: 'main.ts', filesOpen: false }}
        panelApi={mockPanelApi}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Viewer action' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'File actions for main.ts' })).toBeInTheDocument();
  });

  describe('content-driven routing for neutral filenames', () => {
    it('should route a neutral-named file with NUL byte to the binary warning', () => {
      const head = new Uint8Array(512);
      head[0] = 0x00;
      mockUseFileContent.mockReturnValue({ kind: 'binary', size: 5 * 1024 * 1024, head, revision: 1 });

      render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

      expect(screen.getByText(/binary or uses an unsupported text encoding/i)).toBeInTheDocument();
    });

    it('should route a neutral-named ASCII file over the open limit to the too-large warning', () => {
      mockUseFileContent.mockReturnValue({
        kind: 'too-large',
        size: 5 * 1024 * 1024,
        limit: 2 * 1024 * 1024,
      });

      render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

      expect(screen.getByText(/exceeds the .* editor limit/)).toBeInTheDocument();
    });

    it('should route small text content to the viewer regardless of filename', () => {
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('plain text'),
      });

      render(<FileEditor paneId='test-pane' filePath='mystery.dat' panelApi={mockPanelApi} />);

      expect(screen.getByTestId('viewer')).toBeInTheDocument();
      expect(screen.getByTestId('viewer-content').textContent).toBe('plain text');
    });
  });

  // R16 (F20): after a rename, a code change must target the new path
  // resolved through `paneId`, not the path the panel was created with.
  describe('handleCodeChange paneId resolution (R16)', () => {
    it('should suppress a write while filesystem content is being applied to the live path', async () => {
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-1', path: 'src/main.ts' }];
      mockIsApplyingFilesystemContent.mockReturnValue(true);
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('restored content'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('restored content');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-1' filePath='src/main.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));

      expect(mockIsApplyingFilesystemContent).toHaveBeenCalledWith('src/main.ts');
      expect(mockSaveEditor).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should write to the live path resolved via paneId, not the stale params filePath', async () => {
      // Mount with the original path; immediately rewrite openFiles to
      // simulate a rename that updated the openFiles entry in place
      // (preserving the same paneId).
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-1', path: 'src/renamed.ts' }];
      const captured: string[] = [];
      mockSaveEditor.mockImplementation(async (p: string) => {
        captured.push(p);
      });
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('hello'),
      });

      // Render a ChatEditorViewer that exposes onChange — we use the
      // existing mocked viewer registry which calls onChange(content).
      // The mocked viewer above does not actually wire `onChange`, so
      // we exercise the resolver via a direct call: capture the
      // handler from FileEditor by mocking the viewer to invoke it.

      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('new content');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-1' filePath='src/original.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));
      expect(captured).toEqual(['src/renamed.ts']);
      expect(mockIsApplyingFilesystemContent).toHaveBeenCalledWith('src/renamed.ts');
      expect(mockSaveEditor).toHaveBeenCalledWith('src/renamed.ts', new TextEncoder().encode('new content'));
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should retain bounded saves while Monaco services are initializing', async () => {
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-1', path: 'src/main.ts' }];
      mockUseMonacoServices.mockReturnValue({ modelService: undefined });
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('hello'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('new content');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-1' filePath='src/main.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));

      expect(mockContentSaveEditor).toHaveBeenCalledWith('src/main.ts', new TextEncoder().encode('new content'));
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should surface a rejected editor save without retrying it', async () => {
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-1', path: 'src/main.ts' }];
      mockSaveEditor.mockRejectedValueOnce(new Error('disk full'));
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('hello'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('new content');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-1' filePath='src/main.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));

      await vi.waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("Couldn't save 'main.ts'");
      });
      expect(mockSaveEditor).toHaveBeenCalledOnce();
    });

    it('should surface fallback copy for an unmapped structured save error', async () => {
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-1', path: 'src/main.ts' }];
      mockSaveEditor.mockRejectedValueOnce({
        // eslint-disable-next-line @typescript-eslint/naming-convention -- production error marker is intentionally delimited
        __workspaceMutationError__: true,
        code: 'FUTURE_CODE',
        path: 'src/main.ts',
      });
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('hello'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('new content');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-1' filePath='src/main.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));

      await vi.waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith("Couldn't save 'main.ts'");
      });
      expect(mockSaveEditor).toHaveBeenCalledOnce();
    });

    it('should suppress writes when the tab is no longer in openFiles', async () => {
      editorMachineSnapshot.context.openFiles = [];
      mockWriteFile.mockClear();
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('hello'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('orphan write');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-orphan' filePath='src/ghost.ts' panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));
      expect(mockSaveEditor).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it('should suppress writes from a read-only editor', async () => {
      editorMachineSnapshot.context.openFiles = [{ paneId: 'pane-readonly', path: 'src/read-only.ts' }];
      mockUseFileContent.mockReturnValue({
        kind: 'text',
        content: new TextEncoder().encode('read only'),
      });
      mockResolveViewer.mockReturnValueOnce(({ onChange }: { readonly onChange: (value: string) => void }) => (
        <button
          type='button'
          data-testid='trigger-change'
          onClick={() => {
            onChange('changed');
          }}
        >
          change
        </button>
      ));

      render(<FileEditor paneId='pane-readonly' filePath='src/read-only.ts' readOnly panelApi={mockPanelApi} />);
      await userEvent.click(screen.getByTestId('trigger-change'));

      expect(mockIsApplyingFilesystemContent).not.toHaveBeenCalled();
      expect(mockSaveEditor).not.toHaveBeenCalled();
      expect(mockWriteFile).not.toHaveBeenCalled();
    });
  });
});

type TestPanel = {
  readonly id: string;
  params: Record<string, unknown>;
  readonly api: {
    readonly setActive: ReturnType<typeof vi.fn>;
    readonly updateParameters: ReturnType<typeof vi.fn>;
    readonly setTitle: ReturnType<typeof vi.fn>;
  };
};

type TestAddPanelOptions = {
  readonly component?: string;
  readonly id: string;
  readonly params?: Record<string, unknown>;
  readonly position?: { readonly direction: string; readonly referenceGroup: DockviewGroupPanel };
  readonly title?: string;
};

const createTestDockview = (initialPanels: TestPanel[] = []) => {
  const panels = [...initialPanels];
  const group = { id: 'group-1' } as DockviewGroupPanel;
  const clear = vi.fn(() => {
    panels.splice(0);
  });
  const restoreJson = vi.fn();
  const addPanel = vi.fn((options: TestAddPanelOptions) => {
    const panel: TestPanel = {
      id: options.id,
      params: options.params ?? {},
      api: { setActive: vi.fn(), updateParameters: vi.fn(), setTitle: vi.fn() },
    };
    panels.push(panel);
    return panel;
  });
  const removePanel = vi.fn((panel: TestPanel) => {
    panels.splice(panels.indexOf(panel), 1);
  });
  return {
    api: {
      panels,
      groups: [group],
      activeGroup: group,
      addPanel,
      clear,
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Dockview API spelling
      fromJSON: restoreJson,
      removePanel,
    } as unknown as DockviewApi,
    addPanel,
    clear,
    restoreJson,
    group,
    panels,
    removePanel,
  };
};

const panel = (id: string, params: Record<string, unknown> = {}): TestPanel => ({
  id,
  params,
  api: { setActive: vi.fn(), updateParameters: vi.fn(), setTitle: vi.fn() },
});

const openFile = (paneId: string, path: string) => ({
  paneId,
  path,
  name: path.split('/').pop() ?? path,
  lastAccessedAt: 1,
});

describe('normalizeFilePaneState', () => {
  const markdownPresentation = {
    defaultViewId: 'preview',
    views: [
      { id: 'preview', label: 'Preview' },
      { id: 'source', label: 'Source' },
    ],
  } as const;

  it('should apply eligible-pane and viewer defaults to legacy parameters', () => {
    expect(normalizeFilePaneState({ parameters: {}, requestsFiles: true, presentation: markdownPresentation })).toEqual(
      { filesOpen: true, filesWidth: 176, viewId: 'preview' },
    );
  });

  it('should clamp width, retain valid views, and suppress Files for ineligible viewers', () => {
    expect(
      normalizeFilePaneState({
        parameters: { filesOpen: true, filesWidth: 999, viewId: 'source' },
        requestsFiles: false,
        presentation: markdownPresentation,
      }),
    ).toEqual({ filesOpen: false, filesWidth: 360, viewId: 'source' });
    expect(
      normalizeFilePaneState({
        parameters: { filesWidth: 100, viewId: 'removed' },
        requestsFiles: true,
        presentation: markdownPresentation,
      }),
    ).toEqual({ filesOpen: true, filesWidth: 176, viewId: 'preview' });
  });
});

describe('Workbench file reconciliation', () => {
  it('creates a real New tab panel in the invoking group', () => {
    const dockview = createTestDockview();

    createWorkbenchNewTab({ api: dockview.api, group: dockview.group, id: 'workbench-tab-test' });

    expect(dockview.addPanel).toHaveBeenCalledExactlyOnceWith({
      id: 'workbench-tab-test',
      component: 'newTab',
      title: 'New tab',
      params: { mode: 'launcher' },
      position: { direction: 'within', referenceGroup: dockview.group },
    });
  });

  it('replaces a launcher with a utility at the same group index', () => {
    const launcher = panel('workbench-tab-test', { mode: 'launcher' });
    const dockview = createTestDockview([panel('before'), launcher, panel('after')]);
    const group = { ...dockview.group, panels: dockview.panels } as unknown as DockviewGroupPanel;
    Object.assign(launcher.api, { group, close: vi.fn() });

    replaceWorkbenchPlaceholderWithUtility({
      api: dockview.api,
      placeholder: launcher as unknown as IDockviewPanel,
      panelId: 'parameters',
    });

    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: workbenchPanels.parameters.id,
        position: { direction: 'within', referenceGroup: group, index: 1 },
      }),
    );
    expect((launcher.api as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalledOnce();
  });

  it('turns the launcher into Open file and opens the Files sidecar', () => {
    const launcher = panel('workbench-tab-test', { mode: 'launcher' });

    openFilesFromPlaceholder({ placeholder: launcher as unknown as IDockviewPanel });

    expect(launcher.api.updateParameters).toHaveBeenCalledExactlyOnceWith({ mode: 'open-file', filesOpen: true });
    expect(launcher.api.setTitle).toHaveBeenCalledExactlyOnceWith('Open file');
  });

  it('replaces Open file at the same group index after the selected file opens', () => {
    const launcher = panel('workbench-tab-test', { mode: 'open-file' });
    const dockview = createTestDockview([panel('before'), launcher, panel('after')]);
    const close = vi.fn();
    const group = { ...dockview.group, panels: dockview.panels } as unknown as DockviewGroupPanel;
    Object.assign(launcher.api, { group, close });
    const placements = new Map<string, PendingFilePlacement>([
      [
        'src/part.ts',
        { group, index: 1, placeholderId: launcher.id, paneState: { filesOpen: false, filesWidth: 312 } },
      ],
    ]);

    reconcileWorkbenchFiles({
      api: dockview.api,
      openFiles: [openFile('pane-part', 'src/part.ts')],
      activePaneId: 'pane-part',
      isMobile: false,
      pendingUserFilePath: 'src/part.ts',
      pendingFilePlacements: placements,
    });

    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pane-part',
        position: { direction: 'within', referenceGroup: group, index: 1 },
      }),
    );
    expect(dockview.addPanel.mock.calls[0]?.[0].params).toMatchObject({ filesOpen: false, filesWidth: 312 });
    expect(close).toHaveBeenCalledOnce();
    expect(placements.size).toBe(0);
  });

  it('seeds exactly one guided New tab launcher', () => {
    const dockview = createTestDockview();

    seedFreshWorkbench({ api: dockview.api });

    expect(dockview.addPanel).toHaveBeenCalledOnce();
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ component: 'newTab', title: 'New tab', params: { mode: 'launcher' } }),
    );
  });

  it('seeds the shared profile directly into Parameters', () => {
    const dockview = createTestDockview();

    seedFreshWorkbench({ api: dockview.api, profile: 'shared' });

    expect(dockview.addPanel).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'workbench:parameters', component: 'parameters', title: 'Parameters' }),
    );
  });

  it('offers the guided selector only in the seeded launcher', async () => {
    const user = userEvent.setup();
    const launcher = panel('workbench-tab-test', { mode: 'launcher' });
    const dockview = createTestDockview([launcher]);
    const close = vi.fn();
    const group = { ...dockview.group, panels: dockview.panels } as unknown as DockviewGroupPanel;
    Object.assign(launcher.api, { close, group, id: launcher.id });

    render(
      <WorkbenchPlaceholderPanel
        api={launcher.api as unknown as IDockviewPanelProps['api']}
        containerApi={dockview.api}
        params={{ mode: 'launcher' }}
      />,
    );

    const parametersButton = screen.getByRole('button', { name: /Parameters/ });
    expect(parametersButton).toHaveClass('h-7', 'text-[13px]');
    expect(parametersButton.parentElement).toHaveClass('mx-auto', 'py-6');
    expect(parametersButton.parentElement?.parentElement).toHaveClass('scroll-shadows-y', 'overflow-y-auto');
    expect(screen.getByRole('button', { name: 'Close tab' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Telemetry' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Parameters/ }));
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: workbenchPanels.parameters.id,
        position: { direction: 'within', referenceGroup: group, index: 0 },
      }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('should render Open file inside the same pane-owned Files shell', () => {
    const placeholder = panel('open-file-pane', { mode: 'open-file', filesOpen: true, filesWidth: 280 });
    const dockview = createTestDockview([placeholder]);
    const group = { ...dockview.group, panels: dockview.panels } as unknown as DockviewGroupPanel;
    Object.assign(placeholder.api, { group, id: placeholder.id });

    render(
      <WorkbenchPlaceholderPanel
        api={placeholder.api as unknown as IDockviewPanelProps['api']}
        containerApi={dockview.api}
        params={{ mode: 'open-file', filesOpen: true, filesWidth: 280 }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Hide files for Open file' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('region', { name: 'Files for Open file' })).toHaveStyle({ width: '280px' });
    expect(screen.getByTestId('file-tree')).toBeInTheDocument();
  });

  it('opens the plus-button picker without adding a placeholder tab', async () => {
    const user = userEvent.setup();
    const dockview = createTestDockview([panel(workbenchPanels.model.id)]);
    const properties = { group: dockview.group, containerApi: dockview.api } as IDockviewHeaderActionsProps;

    render(<WorkbenchLeftActions {...properties} />);
    await user.click(screen.getByRole('button', { name: 'Open workbench tab' }));

    expect(screen.getByRole('menuitem', { name: /Parameters/ })).toHaveClass('py-1', 'text-[13px]');
    expect(screen.queryByRole('menuitem', { name: /Close tab/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Telemetry/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /Parameters/ }));
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: workbenchPanels.parameters.id,
        position: { direction: 'within', referenceGroup: dockview.group },
      }),
    );
    expect(dockview.addPanel).not.toHaveBeenCalledWith(expect.objectContaining({ component: 'newTab' }));
  });

  it('opens a closable New tab launcher in a newly split group', async () => {
    const user = userEvent.setup();
    const dockview = createTestDockview([panel(workbenchPanels.model.id)]);
    const splitGroup = { id: 'split-group' } as DockviewGroupPanel;
    const addGroup = vi.fn(() => splitGroup);
    Object.assign(dockview.api, { addGroup });
    const properties = { group: dockview.group, containerApi: dockview.api } as IDockviewHeaderActionsProps;

    render(<WorkbenchLeftActions {...properties} />);
    await user.click(screen.getByRole('button', { name: 'Split view' }));

    expect(addGroup).toHaveBeenCalledExactlyOnceWith({ referenceGroup: dockview.group, direction: 'right' });
    const createdPanel = dockview.addPanel.mock.calls[0]?.[0];
    expect(createdPanel?.id).toBeTruthy();
    expect(createdPanel).toEqual({
      id: createdPanel?.id,
      component: 'newTab',
      title: 'New tab',
      params: { mode: 'launcher' },
      position: { direction: 'within', referenceGroup: splitGroup },
    });
  });

  it('limits Files command targeting to Open file and resolved eligible viewers', () => {
    expect(isWorkbenchPanelFilesContext(panel('editor', { filePath: 'main.ts' }))).toBe(false);
    expect(isWorkbenchPanelFilesContext(panel('editor', { filePath: 'main.ts', filesOpen: false }))).toBe(true);
    expect(isWorkbenchPanelFilesContext(panel('open-file', { mode: 'open-file' }))).toBe(true);
    expect(isWorkbenchPanelFilesContext(panel(workbenchPanels.parameters.id))).toBe(false);
  });

  it('renders the New tab selector in a native empty split group', async () => {
    const user = userEvent.setup();
    const dockview = createTestDockview([panel(workbenchPanels.model.id)]);
    const close = vi.fn();
    const group = {
      ...dockview.group,
      panels: [],
      activePanel: undefined,
      api: { close },
    } as unknown as NonNullable<IWatermarkPanelProps['group']>;
    const secondGroup = { id: 'group-2' } as DockviewGroupPanel;
    Object.assign(dockview.api, { groups: [group, secondGroup] });

    render(<WorkbenchEmptyGroupWatermark containerApi={dockview.api} group={group} />);

    expect(screen.getByRole('button', { name: /Parameters/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close split' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Parameters/ }));
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: workbenchPanels.parameters.id,
        position: { direction: 'within', referenceGroup: group },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Close split' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('creates one Open file target when Files is requested from an ineligible tab', () => {
    const utility = panel(workbenchPanels.parameters.id);
    const dockview = createTestDockview([utility]);
    Object.assign(dockview.api, { activePanel: utility });
    openWorkbenchFiles({ api: dockview.api, group: dockview.group });

    expect(dockview.addPanel).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        component: 'newTab',
        title: 'Open file',
        params: { mode: 'open-file', filesOpen: true },
      }),
    );
  });

  it('should open only the active eligible pane without creating a placeholder', () => {
    const file = panel('file-pane', { filePath: 'main.ts', filesOpen: false });
    const dockview = createTestDockview([file]);
    Object.assign(dockview.api, { activePanel: file });

    openWorkbenchFiles({ api: dockview.api });

    expect(file.api.updateParameters).toHaveBeenCalledExactlyOnceWith({ filesOpen: true });
    expect(file.api.setActive).toHaveBeenCalledOnce();
    expect(dockview.addPanel).not.toHaveBeenCalled();
  });

  it('keeps the surface catalog ordered and debug tools gated', () => {
    expect(workbenchSurfaces.map(({ id }) => id)).toEqual([
      'parameters',
      'model',
      'revisions',
      'agents',
      'jobs',
      'export',
      'share',
      'details',
      'files',
      'kernel',
      'console',
    ]);
    expect(workbenchSurfaces.find(({ id }) => id === 'share')?.shortcut).toBeUndefined();
  });

  it('keeps Share editor-only while retaining shared viewer utilities', () => {
    expect(isWorkbenchSurfaceAllowed('share', 'editor')).toBe(true);
    expect(isWorkbenchSurfaceAllowed('share', 'shared')).toBe(false);
    expect(isWorkbenchSurfaceAllowed('agents', 'editor')).toBe(true);
    expect(isWorkbenchSurfaceAllowed('agents', 'shared')).toBe(false);
    expect(isWorkbenchSurfaceAllowed('jobs', 'editor')).toBe(true);
    expect(isWorkbenchSurfaceAllowed('jobs', 'shared')).toBe(false);
    expect(isWorkbenchSurfaceAllowed('export', 'shared')).toBe(true);
  });

  it('clears corrupt layouts and removes restored debug panels when the flag is off', () => {
    const kernel = panel(workbenchPanels.kernel.id);
    const consolePanel = panel(workbenchPanels.console.id);
    const dockview = createTestDockview([kernel, consolePanel]);
    const layout = {} as SerializedDockview;

    restoreWorkbenchLayout({ api: dockview.api, layout, isTauDebugEnabled: false });
    expect(dockview.restoreJson).toHaveBeenCalledExactlyOnceWith(layout);
    expect(dockview.removePanel).toHaveBeenCalledWith(kernel);
    expect(dockview.removePanel).toHaveBeenCalledWith(consolePanel);

    dockview.restoreJson.mockImplementationOnce(() => {
      throw new Error('corrupt');
    });
    restoreWorkbenchLayout({ api: dockview.api, layout, isTauDebugEnabled: true });
    expect(dockview.clear).toHaveBeenCalledOnce();
  });

  it('drops a legacy Files utility from restored layouts', () => {
    const legacyFiles = panel('workbench:files');
    const dockview = createTestDockview([legacyFiles]);

    restoreWorkbenchLayout({ api: dockview.api, layout: {} as SerializedDockview, isTauDebugEnabled: true });

    expect(dockview.removePanel).toHaveBeenCalledExactlyOnceWith(legacyFiles);
  });

  it('keeps Share in a restored editor layout', () => {
    const share = panel(workbenchPanels.share.id);
    const dockview = createTestDockview([share]);

    restoreWorkbenchLayout({ api: dockview.api, layout: {} as SerializedDockview, isTauDebugEnabled: true });

    expect(dockview.restoreJson).toHaveBeenCalledOnce();
    expect(dockview.removePanel).not.toHaveBeenCalledWith(share);
  });

  it('removes stale launchers when a restored layout already has substantive tabs', () => {
    const launcher = panel('workbench-tab-test', { mode: 'launcher' });
    const utility = panel(workbenchPanels.parameters.id);
    const dockview = createTestDockview([launcher, utility]);

    restoreWorkbenchLayout({ api: dockview.api, layout: {} as SerializedDockview, isTauDebugEnabled: true });

    expect(dockview.removePanel).toHaveBeenCalledExactlyOnceWith(launcher);
  });

  it('keeps only the first launcher in an otherwise empty restored layout', () => {
    const first = panel('workbench-tab-first', { mode: 'launcher' });
    const second = panel('workbench-tab-second', { mode: 'launcher' });
    const dockview = createTestDockview([first, second]);

    restoreWorkbenchLayout({ api: dockview.api, layout: {} as SerializedDockview, isTauDebugEnabled: true });

    expect(dockview.removePanel).toHaveBeenCalledExactlyOnceWith(second);
    expect(dockview.panels).toEqual([first]);
  });

  it('reconciles only file panels and leaves utilities under Dockview control', () => {
    const utility = panel(workbenchPanels.parameters.id);
    const staleFile = panel('pane-stale', { filePath: 'stale.ts', paneId: 'pane-stale' });
    const dockview = createTestDockview([utility, staleFile]);

    reconcileWorkbenchFiles({
      api: dockview.api,
      openFiles: [openFile('pane-main', 'main.ts')],
      activePaneId: 'pane-main',
      isMobile: false,
      pendingUserFilePath: undefined,
      pendingFilePlacements: new Map(),
    });

    expect(dockview.removePanel).toHaveBeenCalledExactlyOnceWith(staleFile);
    expect(dockview.panels).toContain(utility);
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pane-main', component: 'editor', inactive: true }),
    );
    expect(utility.api.setActive).not.toHaveBeenCalled();
  });

  it('updates a renamed file in place without disturbing a utility tab', () => {
    const utility = panel(workbenchPanels.parameters.id);
    const file = panel('pane-main', { filePath: 'before.ts', paneId: 'pane-main' });
    const dockview = createTestDockview([utility, file]);

    reconcileWorkbenchFiles({
      api: dockview.api,
      openFiles: [openFile('pane-main', 'src/after.ts')],
      activePaneId: 'pane-main',
      isMobile: false,
      pendingUserFilePath: undefined,
      pendingFilePlacements: new Map(),
    });

    expect(file.api.updateParameters).toHaveBeenCalledWith({
      filePath: 'src/after.ts',
      paneId: 'pane-main',
      readOnly: undefined,
    });
    expect(file.api.setTitle).toHaveBeenCalledWith('after.ts');
    expect(dockview.removePanel).not.toHaveBeenCalledWith(utility);
  });

  it('activates a user-opened file while machine-origin reconciliation stays inactive', () => {
    const file = panel('pane-main', { filePath: 'main.ts', paneId: 'pane-main' });
    const dockview = createTestDockview([panel(workbenchPanels.parameters.id), file]);

    expect(
      reconcileWorkbenchFiles({
        api: dockview.api,
        openFiles: [openFile('pane-main', 'main.ts')],
        activePaneId: 'pane-main',
        isMobile: false,
        pendingUserFilePath: undefined,
        pendingFilePlacements: new Map(),
      }),
    ).toBeUndefined();
    expect(file.api.setActive).not.toHaveBeenCalled();

    reconcileWorkbenchFiles({
      api: dockview.api,
      openFiles: [openFile('pane-main', 'main.ts')],
      activePaneId: 'pane-main',
      isMobile: false,
      pendingUserFilePath: 'main.ts',
      pendingFilePlacements: new Map(),
    });
    expect(file.api.setActive).toHaveBeenCalledOnce();
  });

  it('preserves an external drop split target when the machine creates the file pane', () => {
    const dockview = createTestDockview([panel(workbenchPanels.parameters.id)]);
    const placements = new Map<string, PendingFilePlacement>([
      ['src/part.ts', { position: 'right', group: dockview.group }],
    ]);

    reconcileWorkbenchFiles({
      api: dockview.api,
      openFiles: [openFile('pane-part', 'src/part.ts')],
      activePaneId: 'pane-part',
      isMobile: false,
      pendingUserFilePath: 'src/part.ts',
      pendingFilePlacements: placements,
    });

    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'pane-part',
        position: { direction: 'right', referenceGroup: dockview.group },
      }),
    );
    expect(placements.size).toBe(0);
  });

  it('opens each concrete utility by fixed ID and reuses an existing panel', () => {
    const dockview = createTestDockview();
    openWorkbenchUtility(dockview.api, 'parameters');
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workbench:parameters', component: 'parameters', title: 'Parameters' }),
    );

    const existing = dockview.panels[0]!;
    dockview.addPanel.mockClear();
    openWorkbenchUtility(dockview.api, 'parameters');
    expect(existing.api.setActive).toHaveBeenCalledOnce();
    expect(dockview.addPanel).not.toHaveBeenCalled();
  });

  it('opens Share as a fixed-ID singleton', () => {
    const dockview = createTestDockview();
    openWorkbenchUtility(dockview.api, 'share');
    expect(dockview.addPanel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'workbench:share', component: 'share', title: 'Share' }),
    );

    const existing = dockview.panels[0]!;
    dockview.addPanel.mockClear();
    openWorkbenchUtility(dockview.api, 'share');
    expect(existing.api.setActive).toHaveBeenCalledOnce();
    expect(dockview.addPanel).not.toHaveBeenCalled();
  });

  it('closes the Workbench when its last tab is removed and closes only file-backed machine state', () => {
    const closeFile = vi.fn();
    const closeWorkbench = vi.fn();

    handleWorkbenchPanelRemoved({
      panel: panel('pane-main', { filePath: 'main.ts', paneId: 'pane-main' }),
      remainingPanelCount: 1,
      isRestoringLayout: false,
      closeFile,
      closeWorkbench,
    });
    expect(closeFile).toHaveBeenCalledExactlyOnceWith('main.ts');
    expect(closeWorkbench).not.toHaveBeenCalled();

    handleWorkbenchPanelRemoved({
      panel: panel(workbenchPanels.parameters.id),
      remainingPanelCount: 0,
      isRestoringLayout: false,
      closeFile,
      closeWorkbench,
    });
    expect(closeFile).toHaveBeenCalledOnce();
    expect(closeWorkbench).toHaveBeenCalledOnce();
  });

  it('does not close the Workbench while a persisted layout is being restored', () => {
    const closeWorkbench = vi.fn();
    handleWorkbenchPanelRemoved({
      panel: panel(workbenchPanels.parameters.id),
      remainingPanelCount: 0,
      isRestoringLayout: true,
      closeFile: vi.fn(),
      closeWorkbench,
    });
    expect(closeWorkbench).not.toHaveBeenCalled();
  });

  it('opens a Viewer tab drop as a user file at the retained split target', () => {
    const placements = new Map<string, { position: 'right'; group: DockviewGroupPanel | undefined }>();
    const openFile = vi.fn();
    const group = { id: 'drop-group' } as DockviewGroupPanel;
    const dataTransfer = {
      getData: (type: string) =>
        type === tauViewerPanelDragMime ? JSON.stringify({ entryPath: 'src/from-viewer.ts' }) : '',
    } as unknown as DataTransfer;

    handleWorkbenchDrop({
      event: { nativeEvent: { dataTransfer } as DragEvent, position: 'right', group } as DockviewDidDropEvent,
      pendingFilePlacements: placements,
      openFile,
    });

    expect(openFile).toHaveBeenCalledExactlyOnceWith('src/from-viewer.ts');
    expect(placements.get('src/from-viewer.ts')).toEqual({ position: 'right', group });
  });

  it('opens every file-tree drop but assigns the split target only to the first file', () => {
    const placements = new Map<string, PendingFilePlacement>();
    const openFile = vi.fn();
    const dataTransfer = {
      getData: (type: string) => (type === tauFileDragMime ? JSON.stringify(['src/first.ts', 'src/second.ts']) : ''),
    } as unknown as DataTransfer;

    handleWorkbenchDrop({
      event: { nativeEvent: { dataTransfer } as DragEvent, position: 'left' } as DockviewDidDropEvent,
      pendingFilePlacements: placements,
      openFile,
    });

    expect(openFile.mock.calls).toEqual([['src/first.ts'], ['src/second.ts']]);
    expect([...placements.keys()]).toEqual(['src/first.ts']);
  });

  it('ignores corrupt external drop payloads', () => {
    const openFile = vi.fn();
    handleWorkbenchDrop({
      event: {
        nativeEvent: {
          dataTransfer: { getData: () => '{not-json' } as unknown as DataTransfer,
        } as DragEvent,
        position: 'center',
      } as DockviewDidDropEvent,
      pendingFilePlacements: new Map(),
      openFile,
    });
    expect(openFile).not.toHaveBeenCalled();
  });
});
