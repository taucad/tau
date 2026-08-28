import { createContext, memo, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import type { ComponentProps, ReactNode } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import {
  Activity,
  Box,
  Download,
  FileX,
  FolderOpen,
  History,
  Info,
  Plus,
  SlidersHorizontal,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type * as Monaco from 'monaco-editor';
import type {
  DockviewApi,
  AddPanelPositionOptions,
  DockviewGroupPanel,
  IDockviewPanel,
  DockviewReadyEvent,
  DockviewDidDropEvent,
  IDockviewHeaderActionsProps,
  IDockviewPanelProps,
  IWatermarkPanelProps,
  SerializedDockview,
} from 'dockview-react';
import { positionToDirection } from 'dockview-react';
import { toast } from 'sonner';
import { generatePrefixedId } from '@taucad/utils/id';
import {
  languageFromExtension,
  tauFileDragMime,
  tauEditorPanelDragMime,
  tauViewerPanelDragMime,
  idPrefix,
} from '@taucad/types/constants';
import type { CodeEditor } from '#components/code/code-editor.client.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Loader } from '#components/ui/loader.js';
import { useProject } from '#hooks/use-project.js';
import { Dockview } from '#components/panes/dockview.js';
import type { DockviewTabIconRenderer } from '#components/panes/dockview-tab.js';
import { DockviewPaneAction } from '#components/panes/dockview-pane-action.js';
import { DockviewSplitAction } from '#components/panes/dockview-split-action.js';
import { DockviewEmptyAction, DockviewEmptyCloseAction } from '#components/panes/dockview-empty-action.js';
import { WorkbenchTabContextMenu } from '#components/panes/editor-tab-context-menu.js';
import { withTabContextMenu } from '#components/panes/with-tab-context-menu.js';
import { DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';
import { getFileExtension, encodeTextFile } from '#utils/filesystem.utils.js';
import { ChatEditorTooLargeWarning } from '#routes/w.$workspace.$project/chat-editor-too-large-warning.js';
import { ChatEditorErrorPlaceholder } from '#routes/w.$workspace.$project/chat-editor-error-placeholder.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { useMonacoServices } from '#hooks/use-monaco-model-service.js';
import { useKernelDiagnostics } from '#hooks/use-kernel-diagnostics.js';
import { useFeature } from '#flags/use-feature.js';
import { fileViewerRouter } from '#routes/w.$workspace.$project/file-viewers/built-in-viewers.js';
import { isWorkspaceMutationErrorLike, workspaceMutationErrorCopy } from '#filesystem/workspace-errors.js';
import { ParametersPanelBody } from '#routes/w.$workspace.$project/chat-parameters.js';
import { FileTreePanelBody } from '#routes/w.$workspace.$project/chat-file-tree.js';
import { ChatEditorBreadcrumbs } from '#routes/w.$workspace.$project/chat-editor-breadcrumbs.js';
import { ModelPanelBody } from '#routes/w.$workspace.$project/chat-explorer.js';
import { RevisionsPanelBody } from '#routes/w.$workspace.$project/chat-revisions.js';
import { ConverterPanelBody } from '#routes/w.$workspace.$project/chat-converter.js';
import { DetailsPanelBody } from '#routes/w.$workspace.$project/chat-details.js';
import { TelemetryPanelContent } from '#routes/w.$workspace.$project/chat-kernel.js';
import { ChatConsole } from '#routes/w.$workspace.$project/chat-console.js';
import { WorkbenchToggleSlot } from '#routes/w.$workspace.$project/project-workspace-actions.js';
import {
  projectWorkspaceKeyCombinations,
  useProjectWorkspace,
} from '#routes/w.$workspace.$project/project-workspace-context.js';
import type {
  WorkbenchPanelId,
  WorkbenchUtilityPanelId,
} from '#routes/w.$workspace.$project/project-workspace-context.js';
import { useIsMobile } from '#hooks/use-mobile.js';
import { useVisibleRevisions } from '#hooks/use-revisions.js';
import type { OpenFile } from '#types/editor.types.js';
import { PaneButton } from '#components/ui/pane-button.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import type {
  FileViewerPaneContent,
  FileViewerPresentation,
  FileViewerRenderRequest,
  ResolvedFileViewer,
} from '#routes/w.$workspace.$project/file-viewers/file-viewer.types.js';

/**
 * Create a root-level Monaco URI for a file path.
 */
function createMonacoUri(monaco: typeof Monaco, relativePath: string): Monaco.Uri {
  return monaco.Uri.file(`/${relativePath}`);
}

const reportEditorSaveFailure = async (completion: Promise<void>, path: string): Promise<void> => {
  try {
    await completion;
  } catch (error) {
    const fallback = `Couldn't save '${path.split('/').pop() ?? path}'`;
    let message = fallback;
    if (isWorkspaceMutationErrorLike(error)) {
      const copy = workspaceMutationErrorCopy[error.code];
      message = typeof copy === 'function' ? copy({ path: error.path, target: error.target }) : fallback;
    }
    toast.error(message);
  }
};

/**
 * Params passed to each editor panel via Dockview.
 *
 * `paneId` is the stable identity of the editor pane and matches both
 * `OpenFile.paneId` in the editor machine and the Dockview panel id. The
 * `filePath` is the *current* path of the file the pane is showing —
 * mutated in place by the rename participant without disturbing
 * `paneId`, which is what lets the `FileEditor` survive a rename.
 */
export type FilePaneState = {
  filesOpen?: boolean;
  filesWidth?: number;
  viewId?: string;
};

type EditorPanelParameters = FilePaneState & {
  filePath: string;
  paneId?: string;
  readOnly?: boolean;
};

export type PendingFilePlacement = {
  readonly position?: DockviewDidDropEvent['position'];
  readonly group: DockviewGroupPanel | undefined;
  readonly index?: number;
  readonly placeholderId?: string;
  readonly paneState?: FilePaneState;
};

type WorkbenchPlaceholderParameters = FilePaneState & { mode: 'launcher' | 'open-file' };

const defaultFilesWidth = 240;
const minimumFilesWidth = 176;
const maximumFilesWidth = 360;

export type NormalizedFilePaneState = {
  readonly filesOpen: boolean;
  readonly filesWidth: number;
  readonly viewId: string | undefined;
};

export function normalizeFilePaneState({
  parameters,
  requestsFiles,
  presentation,
  defaultFilesOpen = true,
}: {
  readonly parameters: FilePaneState;
  readonly requestsFiles: boolean;
  readonly presentation?: FileViewerPresentation;
  readonly defaultFilesOpen?: boolean;
}): NormalizedFilePaneState {
  const requestedWidth = Number.isFinite(parameters.filesWidth) ? parameters.filesWidth : defaultFilesWidth;
  const viewId = presentation?.views.some((view) => view.id === parameters.viewId)
    ? parameters.viewId
    : presentation?.defaultViewId;
  return {
    filesOpen: requestsFiles && (parameters.filesOpen ?? defaultFilesOpen),
    filesWidth: Math.min(maximumFilesWidth, Math.max(minimumFilesWidth, requestedWidth ?? defaultFilesWidth)),
    viewId,
  };
}

const getFileParameters = (panel: { readonly params: unknown }): EditorPanelParameters | undefined => {
  const params = panel.params as Partial<EditorPanelParameters> | undefined;
  return typeof params?.filePath === 'string' ? (params as EditorPanelParameters) : undefined;
};

const getPlaceholderParameters = (
  panel: { readonly params: unknown } | undefined,
): Partial<WorkbenchPlaceholderParameters> | undefined =>
  panel?.params as Partial<WorkbenchPlaceholderParameters> | undefined;

export function isWorkbenchPanelFilesContext(
  panel: { readonly id?: string; readonly params: unknown } | undefined,
): boolean {
  if (!panel) {
    return false;
  }
  if (getPlaceholderParameters(panel)?.mode === 'open-file') {
    return true;
  }
  return getFileParameters(panel)?.filesOpen !== undefined;
}

type OpenPlaceholderFile = (path: string, readOnly: boolean | undefined, placeholder: IDockviewPanel) => void;
const WorkbenchOpenPlaceholderFileContext = createContext<OpenPlaceholderFile | undefined>(undefined);

function getDragDataTransfer(event: DragEvent | PointerEvent): DataTransfer | undefined {
  return 'dataTransfer' in event ? (event.dataTransfer ?? undefined) : undefined;
}

/**
 * Single file editor panel rendered inside each Dockview panel.
 */
function EditorPanel(properties: IDockviewPanelProps<EditorPanelParameters>): React.JSX.Element {
  const { filePath, readOnly, paneId } = properties.params;
  return (
    <FileEditor
      paneId={paneId ?? properties.api.id}
      filePath={filePath}
      readOnly={readOnly}
      parameters={properties.params}
      panelApi={properties.api}
      containerApi={properties.containerApi}
    />
  );
}

function ParametersWorkbenchPanel(): React.JSX.Element {
  return <ParametersPanelBody />;
}

function ModelWorkbenchPanel(): React.JSX.Element {
  return <ModelPanelBody />;
}

function RevisionsWorkbenchPanel(): React.JSX.Element {
  return <RevisionsPanelBody />;
}

function ExportWorkbenchPanel(): React.JSX.Element {
  return <ConverterPanelBody />;
}

function DetailsWorkbenchPanel(): React.JSX.Element {
  return <DetailsPanelBody />;
}

function TelemetryWorkbenchPanel(): React.JSX.Element {
  return <TelemetryPanelContent />;
}

function ConsoleWorkbenchPanel(): React.JSX.Element {
  return <ChatConsole />;
}

type WorkbenchSurface = {
  readonly id: WorkbenchPanelId;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly shortcut?: (typeof projectWorkspaceKeyCombinations)[keyof typeof projectWorkspaceKeyCombinations];
  readonly debugOnly?: boolean;
  readonly panel?: { readonly id: string; readonly component: string; readonly title: string };
};

export const workbenchSurfaces: readonly WorkbenchSurface[] = [
  {
    id: 'parameters',
    label: 'Parameters',
    icon: SlidersHorizontal,
    shortcut: projectWorkspaceKeyCombinations.parameters,
    panel: { id: 'workbench:parameters', component: 'parameters', title: 'Parameters' },
  },
  {
    id: 'model',
    label: 'Model',
    icon: Box,
    shortcut: projectWorkspaceKeyCombinations.model,
    panel: { id: 'workbench:model', component: 'model', title: 'Model' },
  },
  {
    id: 'revisions',
    label: 'Revisions',
    icon: History,
    panel: { id: 'workbench:revisions', component: 'revisions', title: 'Revisions' },
  },
  {
    id: 'export',
    label: 'Export',
    icon: Download,
    shortcut: projectWorkspaceKeyCombinations.export,
    panel: { id: 'workbench:export', component: 'export', title: 'Export' },
  },
  {
    id: 'details',
    label: 'Details',
    icon: Info,
    shortcut: projectWorkspaceKeyCombinations.details,
    panel: { id: 'workbench:details', component: 'details', title: 'Details' },
  },
  {
    id: 'files',
    label: 'Files',
    icon: FolderOpen,
    shortcut: projectWorkspaceKeyCombinations.files,
  },
  {
    id: 'kernel',
    label: 'Telemetry',
    icon: Activity,
    debugOnly: true,
    panel: { id: 'workbench:kernel', component: 'kernel', title: 'Telemetry' },
  },
  {
    id: 'console',
    label: 'Console',
    icon: Terminal,
    debugOnly: true,
    panel: { id: 'workbench:console', component: 'console', title: 'Console' },
  },
];

const getWorkbenchSurface = (id: WorkbenchPanelId): WorkbenchSurface =>
  workbenchSurfaces.find((surface) => surface.id === id)!;

const visibleWorkbenchSurfaces = (isTauDebugEnabled: boolean): readonly WorkbenchSurface[] =>
  workbenchSurfaces.filter((surface) => !surface.debugOnly || isTauDebugEnabled);

export function createWorkbenchNewTab({
  api,
  group,
  id = generatePrefixedId(idPrefix.pane),
}: {
  readonly api: DockviewApi;
  readonly group?: DockviewGroupPanel;
  readonly id?: string;
}): void {
  api.addPanel({
    id,
    component: 'newTab',
    title: 'New tab',
    params: { mode: 'launcher' },
    ...(group ? { position: { direction: 'within', referenceGroup: group } } : {}),
  });
}

export function replaceWorkbenchPlaceholderWithUtility({
  api,
  placeholder,
  panelId,
}: {
  readonly api: DockviewApi;
  readonly placeholder: IDockviewPanel;
  readonly panelId: WorkbenchUtilityPanelId;
}): void {
  const definition = workbenchPanels[panelId];
  const existing = api.panels.find((panel) => panel.id === definition.id);
  if (existing) {
    existing.api.setActive();
    placeholder.api.close();
    return;
  }

  const { group } = placeholder.api;
  const index = group.panels.findIndex((panel) => panel.id === placeholder.id);
  api.addPanel({
    ...definition,
    position: { direction: 'within', referenceGroup: group, ...(index === -1 ? {} : { index }) },
  });
  placeholder.api.close();
}

export function openFilesFromPlaceholder({ placeholder }: { readonly placeholder: IDockviewPanel }): void {
  placeholder.api.updateParameters({ mode: 'open-file', filesOpen: true });
  placeholder.api.setTitle('Open file');
}

export function openWorkbenchFiles({
  api,
  group,
  panelRequestsFiles = isWorkbenchPanelFilesContext,
}: {
  readonly api: DockviewApi;
  readonly group?: DockviewGroupPanel;
  readonly panelRequestsFiles?: (panel: IDockviewPanel | undefined) => boolean;
}): void {
  const target = group?.activePanel ?? api.activePanel;
  const targetMode = getPlaceholderParameters(target)?.mode;
  if (target && targetMode === 'launcher') {
    openFilesFromPlaceholder({ placeholder: target });
    return;
  }

  if (panelRequestsFiles(target)) {
    target?.api.updateParameters({ filesOpen: true });
    target?.api.setActive();
    return;
  }

  const existing = api.panels.find((panel) => getPlaceholderParameters(panel)?.mode === 'open-file');
  if (existing) {
    existing.api.setActive();
    existing.api.updateParameters({ filesOpen: true });
    return;
  }

  const referenceGroup = group ?? api.activeGroup ?? api.groups[0];
  api.addPanel({
    id: generatePrefixedId(idPrefix.pane),
    component: 'newTab',
    title: 'Open file',
    params: { mode: 'open-file', filesOpen: true },
    ...(referenceGroup ? { position: { direction: 'within', referenceGroup } } : {}),
  });
}

function WorkbenchSurfaceShortcut({ surface }: { readonly surface: WorkbenchSurface }): React.JSX.Element | undefined {
  if (!surface.shortcut) {
    return undefined;
  }
  return <KeyShortcut className='ml-auto'>{formatKeyCombination(surface.shortcut)}</KeyShortcut>;
}

function WorkbenchSurfaceSelector({
  onSelect,
  terminal,
}: {
  readonly onSelect: (surface: WorkbenchSurface) => void;
  readonly terminal: { readonly label: string; readonly onSelect: () => void } | undefined;
}): React.JSX.Element {
  const isTauDebugEnabled = useFeature('tauDebug');

  return (
    <div className='size-full scroll-shadows-y overflow-y-auto px-4 [--scroll-fade-end:transparent] [--scroll-fade-size:28px]'>
      <div className='mx-auto flex w-full max-w-lg flex-col gap-2 py-6'>
        {visibleWorkbenchSurfaces(isTauDebugEnabled).map((surface) => {
          const Icon = surface.icon;
          return (
            <DockviewEmptyAction
              key={surface.id}
              onClick={() => {
                onSelect(surface);
              }}
            >
              <Icon aria-hidden className='size-3.5 shrink-0' />
              <span>{surface.label}</span>
              <WorkbenchSurfaceShortcut surface={surface} />
            </DockviewEmptyAction>
          );
        })}
        {terminal ? (
          <DockviewEmptyCloseAction onClick={terminal.onSelect}>{terminal.label}</DockviewEmptyCloseAction>
        ) : null}
      </div>
    </div>
  );
}

export function WorkbenchEmptyGroupWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
  return (
    <WorkbenchSurfaceSelector
      onSelect={(surface) => {
        if (surface.id === 'files') {
          openWorkbenchFiles({ api: containerApi, group: group as DockviewGroupPanel | undefined });
          return;
        }
        openWorkbenchUtility(containerApi, surface.id, group as DockviewGroupPanel | undefined);
      }}
      terminal={
        group && containerApi.groups.length > 1
          ? {
              label: 'Close split',
              onSelect: () => {
                group.api.close();
              },
            }
          : undefined
      }
    />
  );
}

export function WorkbenchPlaceholderPanel(
  properties: IDockviewPanelProps<WorkbenchPlaceholderParameters>,
): React.JSX.Element {
  const openPlaceholderFile = useContext(WorkbenchOpenPlaceholderFileContext);
  const placeholder = properties.containerApi.panels.find((panel) => panel.id === properties.api.id);

  if (!placeholder) {
    return <div className='size-full' />;
  }

  if (properties.params.mode === 'open-file') {
    return (
      <FileWorkbenchPane
        paneId={properties.api.id}
        title='Open file'
        parameters={properties.params}
        panelApi={properties.api}
        shouldRenderFiles
        shouldHandleReveal={() => properties.containerApi.activePanel?.id === properties.api.id}
        onOpenFile={(path, readOnly) => {
          openPlaceholderFile?.(path, readOnly, placeholder);
        }}
      >
        <div className='flex size-full flex-col items-center justify-center gap-2 text-center'>
          <FolderOpen aria-hidden className='size-7 stroke-1 text-muted-foreground' />
          <p className='text-sm font-medium'>Open file</p>
          <p className='text-xs text-muted-foreground'>Select a file from the workspace tree</p>
        </div>
      </FileWorkbenchPane>
    );
  }

  return (
    <WorkbenchSurfaceSelector
      onSelect={(surface) => {
        if (surface.id === 'files') {
          openFilesFromPlaceholder({ placeholder });
          return;
        }
        replaceWorkbenchPlaceholderWithUtility({
          api: properties.containerApi,
          placeholder,
          panelId: surface.id,
        });
      }}
      terminal={{
        label: 'Close tab',
        onSelect: () => {
          properties.api.close();
        },
      }}
    />
  );
}

export function WorkbenchLeftActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  const isTauDebugEnabled = useFeature('tauDebug');

  return (
    <div className='flex h-full items-center gap-1'>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <DockviewPaneAction aria-label='Open workbench tab'>
            <Plus className='size-3.5' />
          </DockviewPaneAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start' side='bottom' sideOffset={4} className='w-64'>
          {visibleWorkbenchSurfaces(isTauDebugEnabled).map((surface) => {
            const Icon = surface.icon;
            return (
              <DropdownMenuItem
                key={surface.id}
                onSelect={() => {
                  if (surface.id === 'files') {
                    openWorkbenchFiles({ api: properties.containerApi, group: properties.group });
                    return;
                  }
                  openWorkbenchUtility(properties.containerApi, surface.id, properties.group);
                }}
              >
                <Icon aria-hidden />
                <span>{surface.label}</span>
                <WorkbenchSurfaceShortcut surface={surface} />
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      <DockviewSplitAction
        {...properties}
        onDidSplit={(group) => {
          createWorkbenchNewTab({ api: properties.containerApi, group });
        }}
      />
    </div>
  );
}

const components = {
  editor: EditorPanel,
  newTab: WorkbenchPlaceholderPanel,
  parameters: ParametersWorkbenchPanel,
  model: ModelWorkbenchPanel,
  revisions: RevisionsWorkbenchPanel,
  export: ExportWorkbenchPanel,
  details: DetailsWorkbenchPanel,
  kernel: TelemetryWorkbenchPanel,
  console: ConsoleWorkbenchPanel,
};

export const workbenchPanels = {
  parameters: getWorkbenchSurface('parameters').panel!,
  model: getWorkbenchSurface('model').panel!,
  revisions: getWorkbenchSurface('revisions').panel!,
  export: getWorkbenchSurface('export').panel!,
  details: getWorkbenchSurface('details').panel!,
  kernel: getWorkbenchSurface('kernel').panel!,
  console: getWorkbenchSurface('console').panel!,
} as const satisfies Record<WorkbenchUtilityPanelId, { id: string; component: string; title: string }>;

const getWorkbenchTabIcon: DockviewTabIconRenderer = (properties) => {
  const mode = getPlaceholderParameters(properties)?.mode;
  const surface = workbenchSurfaces.find((candidate) => candidate.panel?.id === properties.api.id);
  const Icon = mode === 'open-file' ? FolderOpen : mode === 'launcher' ? Plus : surface?.icon;
  return Icon ? <Icon aria-hidden className='size-3 shrink-0' /> : undefined;
};

export const WorkbenchDockviewTab = withTabContextMenu(WorkbenchTabContextMenu, {
  getIcon: getWorkbenchTabIcon,
});

const tabComponents = { editor: WorkbenchDockviewTab };

const legacyWorkbenchFilesPanelId = 'workbench:files';

export function openWorkbenchUtility(
  api: DockviewApi,
  panelId: WorkbenchUtilityPanelId,
  group?: DockviewGroupPanel,
): void {
  const definition = workbenchPanels[panelId];
  const existing = api.panels.find((panel) => panel.id === definition.id);
  if (existing) {
    existing.api.setActive();
    return;
  }

  const referenceGroup = group ?? api.activeGroup ?? api.groups[0];
  api.addPanel({
    ...definition,
    ...(referenceGroup ? { position: { direction: 'within', referenceGroup } } : {}),
  });
}

export function seedFreshWorkbench({ api }: { readonly api: DockviewApi }): void {
  if (api.panels.length > 0) {
    return;
  }
  createWorkbenchNewTab({ api, group: api.activeGroup ?? api.groups[0] });
}

export function restoreWorkbenchLayout({
  api,
  layout,
  isTauDebugEnabled,
}: {
  readonly api: DockviewApi;
  readonly layout: SerializedDockview | undefined;
  readonly isTauDebugEnabled: boolean;
}): void {
  try {
    if (layout) {
      api.fromJSON(layout);
    }
    const legacyFilesPanel = api.panels.find((panel) => panel.id === legacyWorkbenchFilesPanelId);
    if (legacyFilesPanel) {
      api.removePanel(legacyFilesPanel);
    }
    if (!isTauDebugEnabled) {
      for (const panelId of [workbenchPanels.kernel.id, workbenchPanels.console.id]) {
        const debugPanel = api.panels.find((panel) => panel.id === panelId);
        if (debugPanel) {
          api.removePanel(debugPanel);
        }
      }
    }

    const launchers = api.panels.filter((panel) => getPlaceholderParameters(panel)?.mode === 'launcher');
    const substantivePanels = api.panels.filter((panel) => getPlaceholderParameters(panel)?.mode !== 'launcher');
    for (const launcher of substantivePanels.length > 0 ? launchers : launchers.slice(1)) {
      api.removePanel(launcher);
    }
  } catch {
    api.clear();
  }
}

export function handleWorkbenchPanelRemoved({
  panel,
  remainingPanelCount,
  isRestoringLayout,
  closeFile,
  closeWorkbench,
}: {
  readonly panel: { readonly params: unknown };
  readonly remainingPanelCount: number;
  readonly isRestoringLayout: boolean;
  readonly closeFile: (path: string) => void;
  readonly closeWorkbench: () => void;
}): void {
  const parameters = getFileParameters(panel);
  if (parameters) {
    closeFile(parameters.filePath);
  }
  if (!isRestoringLayout && remainingPanelCount === 0) {
    closeWorkbench();
  }
}

export function reconcileWorkbenchFiles({
  api,
  openFiles,
  activePaneId,
  isMobile,
  pendingUserFilePath,
  pendingFilePlacements,
}: {
  readonly api: DockviewApi;
  readonly openFiles: OpenFile[];
  readonly activePaneId: string | undefined;
  readonly isMobile: boolean;
  readonly pendingUserFilePath: string | undefined;
  readonly pendingFilePlacements: Map<string, PendingFilePlacement>;
}): string | undefined {
  const desired = new Map(openFiles.map((file) => [file.paneId, file]));
  const present = new Map(
    api.panels.filter((panel) => getFileParameters(panel) !== undefined).map((panel) => [panel.id, panel]),
  );

  for (const [panelId, panel] of present) {
    if (!desired.has(panelId)) {
      api.removePanel(panel);
    }
  }

  for (const [paneId, file] of desired) {
    const existing = present.get(paneId);
    if (!existing) {
      const fileName = file.path.split('/').pop() ?? file.path;
      const pendingPlacement = pendingFilePlacements.get(file.path);
      const droppedDirection = pendingPlacement?.position ? positionToDirection(pendingPlacement.position) : undefined;
      const position: AddPanelPositionOptions | undefined =
        pendingPlacement?.placeholderId && pendingPlacement.group
          ? {
              direction: 'within',
              referenceGroup: pendingPlacement.group,
              ...(pendingPlacement.index === undefined ? {} : { index: pendingPlacement.index }),
            }
          : pendingPlacement?.group && droppedDirection
            ? { direction: droppedDirection, referenceGroup: pendingPlacement.group }
            : droppedDirection && droppedDirection !== 'within'
              ? { direction: droppedDirection }
              : api.activeGroup
                ? { direction: 'within', referenceGroup: api.activeGroup }
                : undefined;
      api.addPanel({
        id: paneId,
        component: 'editor',
        tabComponent: 'editor',
        title: fileName,
        params: { ...pendingPlacement?.paneState, filePath: file.path, paneId, readOnly: file.readOnly },
        inactive: true,
        ...(position ? { position } : {}),
      });
      if (pendingPlacement?.placeholderId) {
        api.panels.find((panel) => panel.id === pendingPlacement.placeholderId)?.api.close();
      }
      pendingFilePlacements.delete(file.path);
      continue;
    }

    const pendingPlacement = pendingFilePlacements.get(file.path);
    if (pendingPlacement?.placeholderId) {
      api.panels.find((panel) => panel.id === pendingPlacement.placeholderId)?.api.close();
    }
    pendingFilePlacements.delete(file.path);
    const currentParameters = existing.params as EditorPanelParameters;
    if (currentParameters.filePath !== file.path || currentParameters.readOnly !== file.readOnly) {
      existing.api.updateParameters({ filePath: file.path, paneId, readOnly: file.readOnly });
      const fileName = file.path.split('/').pop() ?? file.path;
      existing.api.setTitle(fileName);
    }
  }

  const target = api.panels.find((panel) => {
    const parameters = getFileParameters(panel);
    return pendingUserFilePath ? parameters?.filePath === pendingUserFilePath : isMobile && panel.id === activePaneId;
  });
  if (target) {
    target.api.setActive();
    return undefined;
  }
  return pendingUserFilePath;
}

export function handleWorkbenchDrop({
  event,
  pendingFilePlacements,
  openFile,
}: {
  readonly event: DockviewDidDropEvent;
  readonly pendingFilePlacements: Map<string, PendingFilePlacement>;
  readonly openFile: (path: string) => void;
}): void {
  const dataTransfer = getDragDataTransfer(event.nativeEvent);
  const viewerData = dataTransfer?.getData(tauViewerPanelDragMime);
  if (viewerData) {
    try {
      const { entryPath } = JSON.parse(viewerData) as { entryPath?: string };
      if (entryPath) {
        pendingFilePlacements.set(entryPath, { position: event.position, group: event.group });
        openFile(entryPath);
      }
    } catch {
      // Ignore corrupt cross-dockview data.
    }
    return;
  }

  const fileData = dataTransfer?.getData(tauFileDragMime);
  if (!fileData) {
    return;
  }

  let paths: string[];
  try {
    paths = JSON.parse(fileData) as string[];
  } catch {
    return;
  }

  for (const [index, filePath] of paths.entries()) {
    if (index === 0) {
      pendingFilePlacements.set(filePath, { position: event.position, group: event.group });
    }
    openFile(filePath);
  }
}

function FileWorkbenchPane({
  paneId,
  filePath,
  title,
  parameters,
  panelApi,
  shouldRenderFiles,
  viewerActions,
  presentation,
  shouldHandleReveal,
  onOpenFile,
  children,
}: {
  readonly paneId: string;
  readonly filePath?: string;
  readonly title: string;
  readonly parameters: FilePaneState;
  readonly panelApi: IDockviewPanelProps['api'];
  readonly shouldRenderFiles: boolean;
  readonly viewerActions?: ReactNode;
  readonly presentation?: FileViewerPresentation;
  readonly shouldHandleReveal: () => boolean;
  readonly onOpenFile: (path: string, readOnly?: boolean) => void;
  readonly children: ReactNode;
}): React.JSX.Element {
  const regionId = useId();
  const paneState = normalizeFilePaneState({ parameters, requestsFiles: shouldRenderFiles, presentation });
  const [filesWidth, setFilesWidth] = useState(paneState.filesWidth);
  const [fileActionsContainer, setFileActionsContainer] = useState<HTMLDivElement>();
  const alternateView = presentation?.views.find((view) => view.id !== paneState.viewId);
  const filesAction = paneState.filesOpen ? `Hide files for ${title}` : `Show files for ${title}`;

  useEffect(() => {
    setFilesWidth(paneState.filesWidth);
  }, [paneState.filesWidth]);

  const actions = (
    <div className='ml-2 flex shrink-0 items-center gap-1' role='group' aria-label={`File actions for ${title}`}>
      {viewerActions}
      {alternateView ? (
        <PaneButton
          size='label'
          onClick={() => {
            panelApi.updateParameters({ viewId: alternateView.id });
          }}
        >
          View {alternateView.label.toLocaleLowerCase()}
        </PaneButton>
      ) : null}
      {paneState.filesOpen ? (
        <div
          ref={(element) => {
            setFileActionsContainer(element ?? undefined);
          }}
          className='flex items-center'
        />
      ) : null}
      {shouldRenderFiles ? (
        <PaneButton
          tooltip={filesAction}
          aria-label={filesAction}
          aria-pressed={paneState.filesOpen}
          aria-controls={regionId}
          onClick={() => {
            panelApi.updateParameters({ filesOpen: !paneState.filesOpen });
          }}
        >
          <FolderOpen aria-hidden className='size-3.5' />
        </PaneButton>
      ) : null}
    </div>
  );

  return (
    <div className='flex size-full min-h-0 flex-col bg-background' data-file-pane-id={paneId}>
      {filePath ? (
        <ChatEditorBreadcrumbs filePath={filePath}>{actions}</ChatEditorBreadcrumbs>
      ) : (
        <div className='flex min-h-9 flex-row items-center justify-between border-b border-border bg-background px-1 py-1 text-muted-foreground'>
          <span className='truncate px-1 text-sm font-medium'>{title}</span>
          {actions}
        </div>
      )}
      <div className='flex min-h-0 flex-1'>
        <div className='min-h-0 min-w-0 flex-1'>{children}</div>
        {paneState.filesOpen ? (
          <div
            id={regionId}
            role='region'
            aria-label={`Files for ${title}`}
            className='h-full shrink-0'
            style={{ width: filesWidth }}
          >
            <FilePaneFilesSidecar
              actionsContainer={fileActionsContainer}
              width={filesWidth}
              onWidthChange={setFilesWidth}
              onWidthCommit={(width) => {
                panelApi.updateParameters({ filesWidth: width });
              }}
              onOpenChange={(open) => {
                panelApi.updateParameters({ filesOpen: open });
              }}
              onOpenFile={onOpenFile}
              shouldHandleReveal={shouldHandleReveal}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * FileEditor - renders a Monaco editor for a single file.
 *
 * Each Dockview panel gets its own instance. The component keys
 * everything off the stable `paneId` (Dockview panel id) rather than the
 * file path so a rename does not unmount the editor — it just shifts
 * the live `filePath` lookup to the new path in `openFiles`.
 */
export const FileEditor = memo(function ({
  paneId,
  filePath: filePathFromParams,
  readOnly: readOnlyFromParams,
  parameters,
  panelApi,
  containerApi,
}: {
  readonly paneId: string;
  readonly filePath: string;
  readonly readOnly?: boolean;
  readonly parameters?: EditorPanelParameters;
  readonly panelApi: IDockviewPanelProps['api'];
  readonly containerApi?: DockviewApi;
}): ReactNode {
  const monaco = useMonaco();
  const { editorRef, geometryUnits, mainEntryPath } = useProject();
  const cadActor = geometryUnits.get(mainEntryPath);
  const fileManager = useFileManager();
  const { contentService } = fileManager;
  const { modelService, markerService } = useMonacoServices();
  const planModeEnabled = useFeature('planMode');
  const handledSaveCompletion = useRef<Promise<void> | undefined>(undefined);
  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  // Resolve the live path via the stable paneId. The path param the
  // panel was created with is a starting hint only — once the panel is
  // mounted, the rename participant updates `openFiles[i].path` in
  // place and this selector picks the fresh path.
  const liveEntry = openFiles.find((file) => file.paneId === paneId);
  const filePath = liveEntry?.path ?? filePathFromParams;
  const readOnly = readOnlyFromParams ?? liveEntry?.readOnly ?? false;
  const paneParameters = parameters ?? { filePath: filePathFromParams, readOnly: readOnlyFromParams };

  // Kernel diagnostics
  const { handleValidate } = useKernelDiagnostics({
    monaco: monaco ?? undefined,
    cadActor,
    markerService,
  });

  // Read file content from content service (auto-loads on cache miss).
  // The discriminated outcome is the single source of truth for the render
  // gate — there is no local "force open" state because the override is
  // expressed by re-resolving with `forceText` / `sizeLimit` options.
  const result = useFileContent(filePath);

  const handleFileSelectorSelect = useCallback(
    (path: string) => {
      editorRef.send({ type: 'openFile', path, source: 'user' });
      panelApi.updateParameters({ filePath: path });
      const fileName = path.split('/').pop() ?? path;
      panelApi.setTitle(fileName);
    },
    [editorRef, panelApi],
  );

  const handleForceOpenBinary = useCallback(() => {
    if (!contentService) {
      return;
    }
    void contentService.resolve(filePath, {
      forceText: true,
      sizeLimit: Number.MAX_SAFE_INTEGER,
    });
  }, [contentService, filePath]);

  const handleOpenAnywayLarge = useCallback(() => {
    if (!contentService) {
      return;
    }
    void contentService.resolve(filePath, { sizeLimit: Number.MAX_SAFE_INTEGER });
  }, [contentService, filePath]);

  const handleReadAll = useCallback(async (): Promise<Uint8Array<ArrayBuffer>> => {
    if (result.kind === 'text') {
      return new Uint8Array(result.content);
    }
    if (result.kind === 'binary' && contentService) {
      return contentService.readRawBytes(filePath, { sizeLimit: result.size });
    }
    throw new Error(`File '${filePath}' is not available to a viewer`);
  }, [contentService, filePath, result]);

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (readOnly) {
        return;
      }
      // Resolve the live path again at write time via `paneId`. This
      // closes the rename-race window: if the user types into the
      // editor between a rename completing and the panel parameters
      // being patched, the write must still target the *new* path.
      // When the tab no longer exists in `openFiles` (closed mid-keystroke)
      // the write is suppressed — re-creating the file silently would
      // resurrect a deleted/closed file (F20).
      const snapshot = editorRef.getSnapshot();
      const liveEntry = snapshot.context.openFiles.find((file) => file.paneId === paneId);
      if (!liveEntry) {
        return;
      }
      if (modelService?.isApplyingFilesystemContent(liveEntry.path)) {
        return;
      }
      const encoded = encodeTextFile(value ?? '');
      const completion = modelService
        ? modelService.saveEditor(liveEntry.path, encoded)
        : contentService?.saveEditor(liveEntry.path, encoded);
      if (completion === undefined || handledSaveCompletion.current === completion) {
        return;
      }
      handledSaveCompletion.current = completion;
      void reportEditorSaveFailure(completion, liveEntry.path);
    },
    [readOnly, contentService, paneId, editorRef, modelService],
  );

  // Acquire/release ref-counted editor model hold
  useEffect(() => {
    if (!modelService || !filePath) {
      return;
    }

    void modelService.acquireModel(filePath);
    return () => {
      modelService.releaseModel(filePath);
    };
  }, [modelService, filePath]);

  let body: ReactNode;
  let resolvedViewer: ResolvedFileViewer | undefined;
  let viewerRequest: Omit<FileViewerRenderRequest, 'renderPane'> | undefined;
  switch (result.kind) {
    case 'loading': {
      body = (
        <div className='flex h-full items-center justify-center'>
          <Loader className='size-8 stroke-1 text-muted-foreground' />
        </div>
      );
      break;
    }
    case 'too-large': {
      body = <ChatEditorTooLargeWarning size={result.size} limit={result.limit} onOpenAnyway={handleOpenAnywayLarge} />;
      break;
    }
    case 'error': {
      body = <ChatEditorErrorPlaceholder cause={result.cause} />;
      break;
    }
    case 'orphaned': {
      body = (
        <div className='flex h-full flex-col items-center justify-center gap-4 text-muted-foreground'>
          <FileX className='size-12 stroke-1' />
          <div className='flex flex-col items-center gap-1'>
            <p className='text-sm font-medium'>File not found</p>
            <p className='max-w-60 truncate text-xs'>{filePath}</p>
          </div>
          <FileSelector
            selectedFile={undefined}
            placeholder='Select file to edit...'
            className='h-8 w-50'
            title='Open File'
            description='Choose a file to open in the editor'
            searchPlaceholder='Search files...'
            emptyMessage='No files found.'
            onSelect={handleFileSelectorSelect}
          />
        </div>
      );
      break;
    }
    case 'binary':
    case 'text': {
      const name = filePath.split('/').pop() ?? filePath;
      const language = languageFromExtension[getFileExtension(name) as keyof typeof languageFromExtension];
      resolvedViewer = fileViewerRouter.resolve({
        paneId,
        path: filePath,
        name,
        content:
          result.kind === 'text'
            ? { kind: 'text', bytes: result.content }
            : {
                kind: 'binary',
                size: result.size,
                head: result.head,
                revision: result.revision,
              },
        options: { planModeEnabled, readOnly },
      });
      const paneState = normalizeFilePaneState({
        parameters: paneParameters,
        requestsFiles: resolvedViewer.requestsFiles,
        presentation: resolvedViewer.presentation,
      });
      viewerRequest = {
        paneId,
        path: filePath,
        name,
        readOnly,
        viewId: paneState.viewId,
        resource: { outcome: result, readAll: handleReadAll },
        textEditor:
          result.kind === 'text' ? { language, onChange: handleCodeChange, onValidate: handleValidate } : undefined,
        binaryFallback: result.kind === 'binary' ? { onForceOpen: handleForceOpenBinary } : undefined,
      };
      break;
    }
  }

  const requestsFiles = resolvedViewer?.requestsFiles ?? false;
  const presentation = resolvedViewer?.presentation;
  const normalizedState = normalizeFilePaneState({ parameters: paneParameters, requestsFiles, presentation });
  useEffect(() => {
    const patch: FilePaneState = {};
    if (resolvedViewer && paneParameters.filesOpen === undefined && requestsFiles) {
      patch.filesOpen = normalizedState.filesOpen;
    } else if (resolvedViewer && paneParameters.filesOpen !== undefined && !requestsFiles) {
      patch.filesOpen = undefined;
    }
    if (resolvedViewer && presentation && paneParameters.viewId !== normalizedState.viewId) {
      patch.viewId = normalizedState.viewId;
    } else if (resolvedViewer && !presentation && paneParameters.viewId !== undefined) {
      patch.viewId = undefined;
    }
    if (Object.keys(patch).length > 0) {
      panelApi.updateParameters(patch);
    }
  }, [
    normalizedState.filesOpen,
    normalizedState.viewId,
    paneParameters.filesOpen,
    paneParameters.viewId,
    panelApi,
    presentation,
    requestsFiles,
    resolvedViewer,
  ]);

  const name = filePath.split('/').pop() ?? filePath;
  const renderPane = ({ actions: viewerActions, body: paneBody }: FileViewerPaneContent): ReactNode => (
    <FileWorkbenchPane
      paneId={paneId}
      filePath={filePath}
      title={name}
      parameters={paneParameters}
      panelApi={panelApi}
      shouldRenderFiles={requestsFiles}
      viewerActions={viewerActions}
      presentation={presentation}
      shouldHandleReveal={() => containerApi?.activePanel?.id === paneId || containerApi === undefined}
      onOpenFile={(path, fileReadOnly) => {
        editorRef.send({ type: 'openFile', path, source: 'user', readOnly: fileReadOnly });
      }}
    >
      {paneBody}
    </FileWorkbenchPane>
  );

  if (resolvedViewer && viewerRequest) {
    return resolvedViewer.render({ ...viewerRequest, renderPane });
  }

  return renderPane({ body });
});

const clampFilesWidth = (width: number): number => Math.min(maximumFilesWidth, Math.max(minimumFilesWidth, width));

function FilePaneFilesSidecar({
  actionsContainer,
  width,
  onWidthChange,
  onWidthCommit,
  onOpenChange,
  onOpenFile,
  shouldHandleReveal,
}: {
  readonly actionsContainer: Element | DocumentFragment | undefined;
  readonly width: number;
  readonly onWidthChange: (width: number) => void;
  readonly onWidthCommit: (width: number) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly onOpenFile: (path: string, readOnly?: boolean) => void;
  readonly shouldHandleReveal: () => boolean;
}): React.JSX.Element {
  const drag = useRef<{ readonly x: number; readonly width: number; currentWidth: number } | undefined>(undefined);

  const commitWidth = (nextWidth: number): void => {
    const clamped = clampFilesWidth(nextWidth);
    onWidthChange(clamped);
    onWidthCommit(clamped);
  };

  return (
    <div className='relative size-full border-l border-border'>
      <div
        role='separator'
        aria-label='Resize Files pane'
        aria-orientation='vertical'
        aria-valuemin={minimumFilesWidth}
        aria-valuemax={maximumFilesWidth}
        aria-valuenow={Math.round(width)}
        tabIndex={0}
        className='absolute top-0 -left-1 z-10 h-full w-2 cursor-col-resize outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, width, currentWidth: width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) {
            return;
          }
          const nextWidth = clampFilesWidth(drag.current.width + drag.current.x - event.clientX);
          drag.current.currentWidth = nextWidth;
          onWidthChange(nextWidth);
        }}
        onPointerUp={(event) => {
          if (!drag.current) {
            return;
          }
          const { currentWidth } = drag.current;
          drag.current = undefined;
          event.currentTarget.releasePointerCapture(event.pointerId);
          onWidthCommit(currentWidth);
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            commitWidth(width + 8);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            commitWidth(width - 8);
          }
        }}
      />
      <FileTreePanelBody
        actionsContainer={actionsContainer}
        isOpen
        borderless
        className='size-full'
        onOpenChange={onOpenChange}
        onOpenFile={onOpenFile}
        shouldHandleReveal={shouldHandleReveal}
        onRequestOpen={() => {
          onOpenChange(true);
        }}
      />
    </div>
  );
}

/**
 * Right-side header actions for Workbench Dockview groups.
 *
 * Reserves the workspace-owned Workbench toggle's exact slot in the group
 * occupying the desktop Workbench's top-right corner.
 */

export function WorkbenchRightHeaderActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  const isTopRight = useIsTopRightGroup(properties.group, properties.containerApi);
  const isMobile = useIsMobile();

  return (
    <div className='flex h-full items-center'>{isTopRight && !isMobile ? <WorkbenchToggleSlot /> : undefined}</div>
  );
}

/**
 * WorkbenchDockview
 *
 * DockviewReact wrapper for the mixed Code-CAD workbench. Provides:
 * - Tab support with file names (replaces ChatEditorTabs)
 * - Split-view via drag-to-split
 * - Layout save/restore via EditorState persistence
 * - Two-way sync with the editor machine (open/close/active files)
 * - External file drops from the file tree
 */
export const WorkbenchDockview = memo(function (): React.JSX.Element {
  const { editorRef } = useProject();
  const { connectWorkbench, setWorkbenchOpen } = useProjectWorkspace();
  const isMobile = useIsMobile();
  const isTauDebugEnabled = useFeature('tauDebug');
  const { canReturnToLatest, headRevision, isDirty } = useVisibleRevisions();
  const monaco = useMonaco();
  const [api, setApi] = useState<DockviewApi>();
  const isRestoringLayout = useRef(false);
  const pendingUserFilePathRef = useRef<string | undefined>(undefined);
  const pendingFilePlacementRef = useRef(new Map<string, PendingFilePlacement>());

  // Read persisted layout from editor machine
  const workbenchLayout = useSelector(editorRef, (state) => state.context.workbenchLayout);
  // Reconciler inputs: the open-tab set and active tab from the machine.
  // The editor machine is the single source of truth — Dockview is a
  // pure reconciler that diffs its current panels against this state.
  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  const activePaneId = useSelector(editorRef, (state) => state.context.activePaneId);
  const workbenchOpen = useSelector(editorRef, (state) => state.context.panelState.desktopLayout.workbenchOpen);

  // Save layout to editor machine on layout changes
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidLayoutChange(() => {
      if (isRestoringLayout.current) {
        return;
      }

      editorRef.send({ type: 'setWorkbenchLayout', layout: api.toJSON() });
    });

    return () => {
      disposable.dispose();
    };
  }, [api, editorRef]);

  // ─────────────────────────────────────────────────────────────────
  // Reconciler: editor machine state → Dockview panels
  //
  // The reconciler is idempotent: each pass diffs `openFiles` against
  // `api.panels` and issues add/remove/updateParameters/setTitle/
  // setActive calls only where they differ. Because it converges on
  // each render of the source state, no re-entry guard is needed
  // (replacing the old `isSyncingFromMachine` ref pattern).
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!api || isRestoringLayout.current) {
      return;
    }

    pendingUserFilePathRef.current = reconcileWorkbenchFiles({
      api,
      openFiles,
      activePaneId,
      isMobile,
      pendingUserFilePath: pendingUserFilePathRef.current,
      pendingFilePlacements: pendingFilePlacementRef.current,
    });
  }, [api, openFiles, activePaneId, isMobile]);

  // Side-effects bound to fileOpened (line-nav + open-editor-on-user-action).
  // These were tangled into the old sync effect; they stay event-driven
  // because they encode user intent ("the user just opened a file"),
  // not state convergence.
  useEffect(() => {
    if (!api) {
      return;
    }
    const openFileSub = editorRef.on('fileOpened', (event) => {
      if (event.source === 'user') {
        const existingPanel = api.panels.find((panel) => getFileParameters(panel)?.filePath === event.path);
        if (existingPanel) {
          existingPanel.api.setActive();
          pendingUserFilePathRef.current = undefined;
        } else {
          pendingUserFilePathRef.current = event.path;
        }
      }
      if (monaco && event.lineNumber) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const uri = createMonacoUri(monaco, event.path);
            const model = monaco.editor.getModel(uri);
            if (model) {
              const editors = monaco.editor.getEditors();
              // oxlint-disable-next-line max-nested-callbacks -- monaco editor lookup
              const targetEditor = editors.find((ed) => ed.getModel() === model);
              if (targetEditor) {
                const position = new monaco.Position(event.lineNumber!, event.column ?? 1);
                targetEditor.setPosition(position);
                targetEditor.revealPositionInCenter(position);
                targetEditor.focus();
              }
            }
          });
        });
      }
    });
    return () => {
      openFileSub.unsubscribe();
    };
  }, [api, editorRef, monaco]);

  useEffect(() => {
    const failureSubscription = editorRef.on('fileOpenFailed', (event) => {
      const pendingPlacement = pendingFilePlacementRef.current.get(event.path);
      if (pendingPlacement?.placeholderId) {
        pendingFilePlacementRef.current.delete(event.path);
      }
    });
    return () => {
      failureSubscription.unsubscribe();
    };
  }, [editorRef]);

  // ─────────────────────────────────────────────────────────────────
  // Reverse channel: user-initiated Dockview events → machine intents
  //
  // Because the reconciler is idempotent, no guard ref is needed: when
  // the machine receives `closeFile` it removes the entry, the
  // reconciler re-runs, sees the panel is already gone in
  // `api.panels`, and skips the redundant remove. Same applies to
  // `setActiveFile`.
  // ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!api) {
      return;
    }

    const activeDisposable = api.onDidActivePanelChange((event) => {
      if (!event.panel) {
        return;
      }
      const parameters = getFileParameters(event.panel);
      if (parameters) {
        editorRef.send({ type: 'setActiveFile', path: parameters.filePath });
      }
    });

    const removeDisposable = api.onDidRemovePanel((event) => {
      for (const [path, placement] of pendingFilePlacementRef.current) {
        if (placement.placeholderId === event.id) {
          pendingFilePlacementRef.current.delete(path);
        }
      }
      handleWorkbenchPanelRemoved({
        panel: event,
        remainingPanelCount: api.panels.length,
        isRestoringLayout: isRestoringLayout.current,
        closeFile: (path) => {
          editorRef.send({ type: 'closeFile', path });
        },
        closeWorkbench: () => {
          setWorkbenchOpen(false);
        },
      });
    });

    return () => {
      activeDisposable.dispose();
      removeDisposable.dispose();
    };
  }, [api, editorRef, setWorkbenchOpen]);

  // Tag outgoing tab drags with the editor MIME so the viewer can identify them
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onWillDragPanel((event) => {
      const filePath = getFileParameters(event.panel)?.filePath;
      const dataTransfer = getDragDataTransfer(event.nativeEvent);
      if (filePath) {
        dataTransfer?.setData(tauEditorPanelDragMime, JSON.stringify({ filePath }));
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  // Accept external file drags and cross-dockview panel drags
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onUnhandledDragOver((event) => {
      const types = getDragDataTransfer(event.nativeEvent)?.types;

      if (types?.includes(tauFileDragMime)) {
        event.accept();
        return;
      }

      const panelData = typeof event.getData === 'function' ? event.getData() : undefined;
      if (panelData ?? types?.includes(tauViewerPanelDragMime)) {
        event.accept();
      }
    });

    return () => {
      disposable.dispose();
    };
  }, [api]);

  const seedWorkbenchFromState = useCallback((dockApi: DockviewApi) => {
    seedFreshWorkbench({ api: dockApi });
  }, []);

  // Handle ready event: restore layout, validate concrete utilities, and seed
  // one guided launcher when no usable layout remains.
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);

      isRestoringLayout.current = true;
      try {
        restoreWorkbenchLayout({ api: dockApi, layout: workbenchLayout, isTauDebugEnabled });
      } finally {
        isRestoringLayout.current = false;
      }
      seedWorkbenchFromState(dockApi);
    },
    [isTauDebugEnabled, seedWorkbenchFromState, workbenchLayout],
  );

  useEffect(() => {
    if (!api || !workbenchOpen || api.panels.length > 0) {
      return;
    }
    seedWorkbenchFromState(api);
  }, [api, seedWorkbenchFromState, workbenchOpen]);

  useEffect(() => {
    if (!api) {
      return;
    }
    if (!isTauDebugEnabled) {
      for (const panelId of [workbenchPanels.kernel.id, workbenchPanels.console.id]) {
        const debugPanel = api.panels.find((panel) => panel.id === panelId);
        if (debugPanel) {
          api.removePanel(debugPanel);
        }
      }
    }
  }, [api, isTauDebugEnabled]);

  useEffect(() => {
    if (!api) {
      return;
    }

    const updateTitle = (): void => {
      const revisionsPanel = api.panels.find((panel) => panel.id === workbenchPanels.revisions.id);
      if (!revisionsPanel) {
        return;
      }
      const marker = headRevision ? `R${headRevision.n}${isDirty ? '*' : ''}` : 'Baseline';
      revisionsPanel.api.setTitle(canReturnToLatest ? `Revisions · ${marker}` : 'Revisions');
    };

    updateTitle();
    const disposable = api.onDidAddPanel(updateTitle);
    return () => {
      disposable.dispose();
    };
  }, [api, canReturnToLatest, headRevision, isDirty]);

  useEffect(() => {
    if (!api) {
      return;
    }
    return connectWorkbench((panelId) => {
      if ((panelId === 'kernel' || panelId === 'console') && !isTauDebugEnabled) {
        return;
      }
      if (panelId === 'files') {
        openWorkbenchFiles({ api });
        return;
      }
      openWorkbenchUtility(api, panelId);
    });
  }, [api, connectWorkbench, isTauDebugEnabled]);

  // Handle external file drops and cross-dockview viewer panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      handleWorkbenchDrop({
        event,
        pendingFilePlacements: pendingFilePlacementRef.current,
        openFile: (path) => {
          editorRef.send({ type: 'openFile', path, source: 'user' });
        },
      });
    },
    [editorRef],
  );

  // Open-file action: delegate to editor machine which syncs with Dockview
  const handleOpenFile = useCallback(
    (path: string) => {
      editorRef.send({ type: 'openFile', path, source: 'user' });
    },
    [editorRef],
  );

  const handlePlaceholderOpenFile = useCallback<OpenPlaceholderFile>(
    (path, readOnly, placeholder) => {
      const { group } = placeholder.api;
      const parameters = getPlaceholderParameters(placeholder);
      pendingFilePlacementRef.current.set(path, {
        group,
        index: group.panels.findIndex((panel) => panel.id === placeholder.id),
        placeholderId: placeholder.id,
        paneState: { filesOpen: parameters?.filesOpen, filesWidth: parameters?.filesWidth },
      });
      editorRef.send({ type: 'openFile', path, source: 'user', readOnly });
    },
    [editorRef],
  );

  return (
    <WorkbenchOpenPlaceholderFileContext.Provider value={handlePlaceholderOpenFile}>
      <DockviewFileActionProvider value={handleOpenFile}>
        <Dockview
          components={components}
          tabComponents={tabComponents}
          watermarkComponent={WorkbenchEmptyGroupWatermark}
          noPanelsOverlay='emptyGroup'
          defaultTabComponent={WorkbenchDockviewTab}
          getTabIcon={getWorkbenchTabIcon}
          leftHeaderActionsComponent={WorkbenchLeftActions}
          rightHeaderActionsComponent={WorkbenchRightHeaderActions}
          onReady={onReady}
          onDidDrop={onDidDrop}
        />
      </DockviewFileActionProvider>
    </WorkbenchOpenPlaceholderFileContext.Provider>
  );
});
