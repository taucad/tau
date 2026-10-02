import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { ChevronDown, FileCode, FileX, XIcon } from 'lucide-react';
import type * as Monaco from 'monaco-editor';
import type {
  DockviewApi,
  DockviewReadyEvent,
  DockviewDidDropEvent,
  IDockviewHeaderActionsProps,
  IDockviewPanelProps,
  IWatermarkPanelProps,
} from 'dockview-react';
import {
  languageFromExtension,
  tauFileDragMime,
  tauEditorPanelDragMime,
  tauViewerPanelDragMime,
} from '@taucad/types/constants';
import type { CodeEditor } from '#components/code/code-editor.client.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Loader } from '#components/ui/loader.js';
import { useProject } from '#hooks/use-project.js';
import { Dockview } from '#components/panes/dockview.js';
import { DockviewWatermark } from '#components/panes/dockview-watermark.js';
import { EditorDockviewTab } from '#components/panes/editor-tab-context-menu.js';
import { DockviewOpenFileAction, DockviewFileActionProvider } from '#components/panes/dockview-open-file-action.js';
import { DockviewSplitAction } from '#components/panes/dockview-split-action.js';
import { DockviewPaneAction } from '#components/panes/dockview-pane-action.js';
import { useIsTopRightGroup } from '#components/panes/use-is-top-right-group.js';
import { useFloatingPanel } from '#components/ui/floating-panel.js';
import { KeyShortcut } from '#components/ui/key-shortcut.js';
import { formatKeyCombination } from '#utils/keys.utils.js';
import { keyCombinationEditor } from '#routes/projects_.$id/chat-editor-layout.js';
import { getFileExtension, decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { ChatEditorBinaryWarning } from '#routes/projects_.$id/chat-editor-binary-warning.js';
import { ChatEditorTooLargeWarning } from '#routes/projects_.$id/chat-editor-too-large-warning.js';
import { ChatEditorErrorPlaceholder } from '#routes/projects_.$id/chat-editor-error-placeholder.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFileContent } from '#hooks/use-file-content.js';
import { useViewContext } from '#routes/projects_.$id/chat-interface-view-context.js';
import { useMonacoServices } from '#hooks/use-monaco-model-service.js';
import { useKernelDiagnostics } from '#hooks/use-kernel-diagnostics.js';
import { useFeature } from '#flags/use-feature.js';
import { resolveViewer } from '#routes/projects_.$id/chat-editor-viewer-registry.js';
import { Button } from '#components/ui/button.js';

/**
 * Create a root-level Monaco URI for a file path.
 */
function createMonacoUri(monaco: typeof Monaco, relativePath: string): Monaco.Uri {
  return monaco.Uri.file(`/${relativePath}`);
}

/**
 * Params passed to each editor panel via Dockview.
 *
 * `paneId` is the stable identity of the editor pane and matches both
 * `OpenFile.paneId` in the editor machine and the Dockview panel id. The
 * `filePath` is the *current* path of the file the pane is showing —
 * mutated in place by the rename participant without disturbing
 * `paneId`, which is what lets the `FileEditor` survive a rename.
 */
type EditorPanelParameters = {
  filePath: string;
  paneId?: string;
  readOnly?: boolean;
};

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
      panelApi={properties.api}
    />
  );
}

const components = {
  editor: EditorPanel,
};

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
  panelApi,
}: {
  readonly paneId: string;
  readonly filePath: string;
  readonly readOnly?: boolean;
  readonly panelApi: IDockviewPanelProps['api'];
}): React.JSX.Element {
  const monaco = useMonaco();
  const { editorRef, geometryUnits, mainEntryFile } = useProject();
  const cadActor = geometryUnits.get(mainEntryFile);
  const fileManager = useFileManager();
  const { contentService } = fileManager;
  const { modelService, markerService } = useMonacoServices();
  const planModeEnabled = useFeature('planMode');
  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  // Resolve the live path via the stable paneId. The path param the
  // panel was created with is a starting hint only — once the panel is
  // mounted, the rename participant updates `openFiles[i].path` in
  // place and this selector picks the fresh path.
  const liveEntry = openFiles.find((file) => file.paneId === paneId);
  const filePath = liveEntry?.path ?? filePathFromParams;
  const readOnly = readOnlyFromParams ?? liveEntry?.readOnly ?? false;

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
      const encoded = encodeTextFile(value ?? '');
      void fileManager.writeFile(liveEntry.path, encoded, {
        source: 'editor',
      });
    },
    [readOnly, fileManager, paneId, editorRef],
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

  switch (result.kind) {
    case 'loading': {
      return (
        <div className='flex h-full items-center justify-center'>
          <Loader className='size-8 stroke-1 text-muted-foreground' />
        </div>
      );
    }
    case 'binary': {
      return <ChatEditorBinaryWarning onForceOpen={handleForceOpenBinary} />;
    }
    case 'too-large': {
      return <ChatEditorTooLargeWarning size={result.size} limit={result.limit} onOpenAnyway={handleOpenAnywayLarge} />;
    }
    case 'error': {
      return <ChatEditorErrorPlaceholder cause={result.cause} />;
    }
    case 'orphaned': {
      return (
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
    }
    case 'text': {
      const name = filePath.split('/').pop() ?? filePath;
      const language = languageFromExtension[getFileExtension(name) as keyof typeof languageFromExtension];
      const editorContent = decodeTextFile(result.content);
      const ViewerComponent = resolveViewer({ path: filePath, name }, { planModeEnabled });
      // `key={paneId}` enforces that React never remounts the viewer on a
      // rename — `paneId` is the stable identity of the tab, while
      // `filePath` is a mutable property updated in place by the
      // rename participant.
      return (
        <div className='flex h-full flex-col bg-background' key={paneId}>
          <ViewerComponent
            paneId={paneId}
            filePath={filePath}
            content={editorContent}
            language={language}
            onChange={handleCodeChange}
            onValidate={handleValidate}
            readOnly={readOnly}
          />
        </div>
      );
    }
  }
});

/**
 * Empty state shown when all editor panels have been closed.
 */
function EditorWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
  const { editorRef } = useProject();

  const handleSelect = useCallback(
    (path: string) => {
      editorRef.send({ type: 'openFile', path, source: 'user' });
    },
    [editorRef],
  );

  const handleClose = useCallback(() => {
    if (group) {
      containerApi.removeGroup(group);
    }
  }, [containerApi, group]);

  return (
    <DockviewWatermark
      icon={FileCode}
      title='No file selected'
      description='Pick a file from the file tree, or select one below'
      onClose={handleClose}
    >
      <FileSelector
        selectedFile={undefined}
        title='Open File'
        description='Choose a file to open in the editor'
        searchPlaceholder='Search files...'
        emptyMessage='No files found.'
        onSelect={handleSelect}
      >
        <Button size='sm' variant='outline' className='justify-between'>
          <span className='truncate text-muted-foreground'>
            <span className='@xs/watermark:hidden'>Select file...</span>
            <span className='hidden @xs/watermark:inline'>Select file to edit...</span>
          </span>
          <ChevronDown className='size-4 shrink-0 text-muted-foreground' />
        </Button>
      </FileSelector>
    </DockviewWatermark>
  );
}

/**
 * Right-side header actions for editor Dockview groups.
 *
 * Renders the split button for every group. For the group that occupies the
 * top-right corner of the floating panel, an inline close button is also
 * rendered so the user can dismiss the editor panel directly from the tab bar.
 *
 * Both buttons share the `.dv-pane-action` class and therefore participate in
 * the same group-hover opacity transition.
 */
function EditorRightHeaderActions(properties: IDockviewHeaderActionsProps): React.JSX.Element {
  const isTopRight = useIsTopRightGroup(properties.group, properties.containerApi);
  const { close } = useFloatingPanel();

  return (
    <>
      <DockviewSplitAction {...properties} />
      {isTopRight ? (
        <DockviewPaneAction
          aria-label='Close editor'
          tooltip={
            <div className='flex items-center gap-2'>
              Close editor
              <KeyShortcut variant='tooltip'>{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
            </div>
          }
          onClick={close}
        >
          <XIcon className='size-3.5' />
        </DockviewPaneAction>
      ) : undefined}
    </>
  );
}

/**
 * EditorDockview
 *
 * DockviewReact wrapper for the code editor area. Provides:
 * - Tab support with file names (replaces ChatEditorTabs)
 * - Split-view via drag-to-split
 * - Layout save/restore via EditorState persistence
 * - Two-way sync with the editor machine (open/close/active files)
 * - External file drops from the file tree
 */
export const EditorDockview = memo(function (): React.JSX.Element {
  const { editorRef, mainEntryFile } = useProject();
  const { setIsEditorOpen } = useViewContext();
  const monaco = useMonaco();
  const [api, setApi] = useState<DockviewApi>();
  const isRestoringLayout = useRef(false);

  // Read persisted layout from editor machine
  const editorLayout = useSelector(editorRef, (state) => state.context.editorLayout);
  // Reconciler inputs: the open-tab set and active tab from the machine.
  // The editor machine is the single source of truth — Dockview is a
  // pure reconciler that diffs its current panels against this state.
  const openFiles = useSelector(editorRef, (state) => state.context.openFiles);
  const activePaneId = useSelector(editorRef, (state) => state.context.activePaneId);

  // Save layout to editor machine on layout changes
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onDidLayoutChange(() => {
      if (isRestoringLayout.current) {
        return;
      }

      editorRef.send({ type: 'setEditorLayout', layout: api.toJSON() });
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

    const desired = new Map(openFiles.map((file) => [file.paneId, file]));
    const present = new Map(api.panels.map((panel) => [panel.id, panel]));

    // Remove panels no longer in openFiles
    for (const [panelId, panel] of present) {
      if (!desired.has(panelId)) {
        api.removePanel(panel);
      }
    }

    // Add or update panels
    for (const [paneId, file] of desired) {
      const existing = present.get(paneId);
      if (!existing) {
        const fileName = file.path.split('/').pop() ?? file.path;
        api.addPanel({
          id: paneId,
          component: 'editor',
          title: fileName,
          params: { filePath: file.path, paneId, readOnly: file.readOnly },
          inactive: paneId !== activePaneId,
        });
        continue;
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- params field is structurally typed in dockview-react as Record<string, unknown>
      const currentParameters = existing.params as EditorPanelParameters;
      if (currentParameters.filePath !== file.path || currentParameters.readOnly !== file.readOnly) {
        existing.api.updateParameters({ filePath: file.path, paneId, readOnly: file.readOnly });
        const fileName = file.path.split('/').pop() ?? file.path;
        existing.api.setTitle(fileName);
      }
    }

    // Sync active panel
    if (activePaneId !== undefined && api.activePanel?.id !== activePaneId) {
      const target = api.panels.find((panel) => panel.id === activePaneId);
      if (target) {
        target.api.setActive();
      }
    }
  }, [api, openFiles, activePaneId]);

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
        setIsEditorOpen(true);
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
  }, [api, editorRef, monaco, setIsEditorOpen]);

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
      if (!event) {
        return;
      }
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- panel params are typed as Record<string, unknown>
      const filePath = (event.params as EditorPanelParameters | undefined)?.filePath;
      if (filePath !== undefined) {
        editorRef.send({ type: 'setActiveFile', path: filePath });
      }
    });

    const removeDisposable = api.onDidRemovePanel((event) => {
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- panel params are typed as Record<string, unknown>
      const filePath = (event.params as EditorPanelParameters | undefined)?.filePath;
      if (filePath !== undefined) {
        editorRef.send({ type: 'closeFile', path: filePath });
      }
    });

    return () => {
      activeDisposable.dispose();
      removeDisposable.dispose();
    };
  }, [api, editorRef]);

  // Tag outgoing tab drags with the editor MIME so the viewer can identify them
  useEffect(() => {
    if (!api) {
      return;
    }

    const disposable = api.onWillDragPanel((event) => {
      const filePath = (event.panel.params as EditorPanelParameters | undefined)?.filePath;
      if (filePath) {
        event.nativeEvent.dataTransfer?.setData(tauEditorPanelDragMime, JSON.stringify({ filePath }));
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

    const disposable = api.onUnhandledDragOverEvent((event) => {
      const types = event.nativeEvent.dataTransfer?.types;

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

  // Handle ready event: restore layout, then let the reconciler take over.
  //
  // For a persisted layout, `fromJSON` rebuilds the full Dockview tree
  // synchronously. Any legacy persisted layout blob is rejected by
  // dockview-react and the catch below clears the layout, letting the
  // reconciler converge from the machine's `openFiles` on the next
  // effect pass.
  //
  // For a fresh load with no openFiles, we dispatch an `openFile`
  // intent for `mainEntryFile` — the reconciler then creates the
  // panel on the next effect pass, ensuring openFiles and Dockview
  // panels never diverge.
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);

      isRestoringLayout.current = true;
      try {
        if (editorLayout) {
          dockApi.fromJSON(editorLayout);
        }
        // Without a persisted layout we leave Dockview empty; the
        // reconciler effect (above) will add panels for the machine's
        // current `openFiles`. The mainEntryFile fallback is handled
        // by `chat-editor-file-tree.tsx`'s `tryOpenMainFile` flow at
        // editor mount, which dispatches `openFile` through the
        // machine — so we no longer mirror that here.
      } catch {
        // Corrupt persisted layout — clear and let reconciler converge
        // from the machine state on the next effect pass.
        dockApi.clear();
      } finally {
        isRestoringLayout.current = false;
      }

      // If we have no openFiles AND no persisted layout, seed via the
      // machine so it stays the single source of truth.
      const snapshot = editorRef.getSnapshot();
      if (snapshot.context.openFiles.length === 0 && !editorLayout && mainEntryFile) {
        editorRef.send({ type: 'openFile', path: mainEntryFile, source: 'machine' });
      }
    },
    [editorLayout, editorRef, mainEntryFile],
  );

  // Handle external file drops and cross-dockview viewer panel drops
  const onDidDrop = useCallback(
    (event: DockviewDidDropEvent) => {
      // Handle viewer panel drag → open its entry file in the editor
      const viewerData = event.nativeEvent.dataTransfer?.getData(tauViewerPanelDragMime);
      if (viewerData) {
        try {
          const { entryFile } = JSON.parse(viewerData) as {
            entryFile?: string;
          };
          if (entryFile) {
            editorRef.send({
              type: 'openFile',
              path: entryFile,
              source: 'user',
            });
          }
        } catch {
          // Ignore corrupt data
        }

        return;
      }

      // Handle file tree drags
      const data = event.nativeEvent.dataTransfer?.getData(tauFileDragMime);
      if (!data) {
        return;
      }

      let paths: string[];
      try {
        paths = JSON.parse(data) as string[];
      } catch {
        return;
      }

      for (const filePath of paths) {
        editorRef.send({ type: 'openFile', path: filePath, source: 'user' });
      }
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

  return (
    <DockviewFileActionProvider value={handleOpenFile}>
      <Dockview
        components={components}
        noPanelsOverlay='emptyGroup'
        defaultTabComponent={EditorDockviewTab}
        watermarkComponent={EditorWatermark}
        leftHeaderActionsComponent={DockviewOpenFileAction}
        rightHeaderActionsComponent={EditorRightHeaderActions}
        onReady={onReady}
        onDidDrop={onDidDrop}
      />
    </DockviewFileActionProvider>
  );
});
