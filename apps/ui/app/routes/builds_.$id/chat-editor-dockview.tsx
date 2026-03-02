import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import type { FileEntry } from '@taucad/types';
import {
  languageFromExtension,
  tauFileDragMime,
  tauEditorPanelDragMime,
  tauViewerPanelDragMime,
} from '@taucad/types/constants';
import { CodeEditor } from '#components/code/code-editor.client.js';
import { FileSelector } from '#components/files/file-selector.js';
import { Loader } from '#components/ui/loader.js';
import { ChatEditorBreadcrumbs } from '#routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '#hooks/use-build.js';
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
import { keyCombinationEditor } from '#routes/builds_.$id/chat-editor-layout.js';
import { getFileExtension, isBinaryFile, decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { ChatEditorBinaryWarning } from '#routes/builds_.$id/chat-editor-binary-warning.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-view-context.js';
import { useMonacoServices } from '#hooks/use-monaco-model-service.js';
import { useKernelDiagnostics } from '#hooks/use-kernel-diagnostics.js';
import { Button } from '#components/ui/button.js';


/**
 * Create a root-level Monaco URI for a file path.
 */
function createMonacoUri(monaco: typeof Monaco, relativePath: string): Monaco.Uri {
  return monaco.Uri.file(`/${relativePath}`);
}

/**
 * Create a root-level path string for the Monaco Editor path prop.
 */
function createMonacoPath(relativePath: string): string {
  return `/${relativePath}`;
}

/**
 * Params passed to each editor panel via Dockview.
 */
type EditorPanelParameters = {
  filePath: string;
};

/**
 * Single file editor panel rendered inside each Dockview panel.
 */
function EditorPanel(properties: IDockviewPanelProps<EditorPanelParameters>): React.JSX.Element {
  const { filePath } = properties.params;
  return <FileEditor filePath={filePath} panelApi={properties.api} />;
}

const components = {
  editor: EditorPanel,
};

/**
 * FileEditor - renders a Monaco editor for a single file.
 * Each Dockview panel gets its own instance.
 */
const FileEditor = memo(function ({
  filePath,
  panelApi,
}: {
  readonly filePath: string;
  readonly panelApi: IDockviewPanelProps['api'];
}): React.JSX.Element {
  const monaco = useMonaco();
  const { editorRef, compilationUnits, mainEntryFile } = useBuild();
  const cadActor = compilationUnits.get(mainEntryFile);
  const fileManager = useFileManager();
  const { fileManagerRef } = useFileManager();
  const [forceOpenBinary, setForceOpenBinary] = useState(false);
  const { modelService, markerService } = useMonacoServices();

  // Kernel diagnostics
  const { handleValidate } = useKernelDiagnostics({
    monaco: monaco ?? undefined,
    cadActor,
    markerService,
  });

  // Read file content from file manager
  const activeFile = useSelector(fileManagerRef, (state) => {
    const { openFiles } = state.context;
    const fileContent = openFiles.get(filePath);
    if (!fileContent) {
      return undefined;
    }

    const name = filePath.split('/').pop() ?? filePath;
    return {
      path: filePath,
      name,
      isBinary: isBinaryFile(name, fileContent),
      content: fileContent,
      language: languageFromExtension[getFileExtension(name) as keyof typeof languageFromExtension],
    };
  });

  // Check if the file exists in the file tree
  const fileTree = useSelector(fileManagerRef, (state) => state.context.fileTree);

  const isMissing = useMemo(() => {
    if (fileTree.size === 0) {
      return false;
    }

    return !fileTree.has(filePath);
  }, [filePath, fileTree]);

  const fileSelectorFiles = useMemo(
    () =>
      [...fileTree.values()]
        .filter((entry: FileEntry) => entry.type === 'file')
        .map((entry: FileEntry) => ({ path: entry.path, size: entry.size })),
    [fileTree],
  );

  const handleFileSelectorSelect = useCallback(
    (path: string) => {
      // Open the selected file through the editor machine
      editorRef.send({ type: 'openFile', path, source: 'user' });

      // Update the Dockview panel to show the new file
      panelApi.updateParameters({ filePath: path });
      const fileName = path.split('/').pop() ?? path;
      panelApi.setTitle(fileName);
    },
    [editorRef, panelApi],
  );

  // Reset force open when file path changes
  useEffect(() => {
    setForceOpenBinary(false);
  }, [filePath]);

  // Ensure file content is loaded (handles restore from fromJSON where no
  // fileOpened event is emitted, as well as any other creation path)
  useEffect(() => {
    if (!isMissing) {
      void fileManager.readFile(filePath);
    }
  }, [fileManager, filePath, isMissing]);

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (!activeFile) {
        return;
      }

      const encoded = encodeTextFile(value ?? '');
      void fileManager.writeFile(activeFile.path, encoded, { source: 'editor' });
    },
    [activeFile, fileManager],
  );

  const editorContent = activeFile ? decodeTextFile(activeFile.content) : '';

  const handleForceOpenBinary = useCallback(() => {
    setForceOpenBinary(true);
  }, []);

  // Register/unregister editor model with the model service
  useEffect(() => {
    if (!modelService || !filePath) {
      return;
    }

    modelService.registerEditorModel(filePath);
    return () => {
      modelService.unregisterEditorModel(filePath);
    };
  }, [modelService, filePath]);

  if (isMissing) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <FileX className="size-12 stroke-1" />
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-medium">File not found</p>
          <p className="max-w-60 truncate text-xs">{filePath}</p>
        </div>
        <FileSelector
          files={fileSelectorFiles}
          selectedFile={undefined}
          placeholder="Select file to edit..."
          className="h-8 w-[200px]"
          title="Open File"
          description="Choose a file to open in the editor"
          searchPlaceholder="Search files..."
          emptyMessage="No files found."
          onSelect={handleFileSelectorSelect}
        />
      </div>
    );
  }

  if (!activeFile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader className="size-8 stroke-1 text-muted-foreground" />
      </div>
    );
  }

  if (activeFile.isBinary && !forceOpenBinary) {
    return <ChatEditorBinaryWarning onForceOpen={handleForceOpenBinary} />;
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <ChatEditorBreadcrumbs filePath={filePath} />
      <CodeEditor
        loading={<Loader className="size-20 stroke-1 text-primary" />}
        className="h-full bg-background"
        defaultLanguage={activeFile.language}
        defaultValue={editorContent}
        path={createMonacoPath(activeFile.path)}
        onChange={handleCodeChange}
        onValidate={handleValidate}
      />
    </div>
  );
});

/**
 * Empty state shown when all editor panels have been closed.
 */
function EditorWatermark({ containerApi, group }: IWatermarkPanelProps): React.JSX.Element {
  const { editorRef } = useBuild();
  const { fileManagerRef } = useFileManager();
  const fileTree = useSelector(fileManagerRef, (state) => state.context.fileTree);

  const files = useMemo(
    () =>
      [...fileTree.values()]
        .filter((entry: FileEntry) => entry.type === 'file')
        .map((entry: FileEntry) => ({ path: entry.path, size: entry.size })),
    [fileTree],
  );

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
      title="No files open"
      description="Pick a file from the file tree, or select one below"
      onClose={handleClose}
    >
      <FileSelector
        files={files}
        selectedFile={undefined}
        title="Open File"
        description="Choose a file to open in the editor"
        searchPlaceholder="Search files..."
        emptyMessage="No files found."
        onSelect={handleSelect}
      >
        <Button size="sm" variant="outline" className="justify-between">
          <span className="truncate text-muted-foreground">
            <span className="@xs/watermark:hidden">Select file...</span>
            <span className="hidden @xs/watermark:inline">Select file to edit...</span>
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
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
          aria-label="Close editor"
          tooltip={
            <div className="flex items-center gap-2">
              Close editor
              <KeyShortcut variant="tooltip">{formatKeyCombination(keyCombinationEditor)}</KeyShortcut>
            </div>
          }
          onClick={close}
        >
          <XIcon className="size-3.5" />
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
  const { editorRef, mainEntryFile } = useBuild();
  const { setIsEditorOpen } = useViewContext();
  const monaco = useMonaco();
  const [api, setApi] = useState<DockviewApi>();
  const isRestoringLayout = useRef(false);
  const isSyncingFromMachine = useRef(false);

  // Read persisted layout from editor machine
  const editorLayout = useSelector(editorRef, (state) => state.context.editorLayout);

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

  // Two-way sync: editor machine -> Dockview
  useEffect(() => {
    if (!api) {
      return;
    }

    // Listen for editor machine events to sync panels
    const openFileSub = editorRef.on('fileOpened', (event) => {
      if (isSyncingFromMachine.current) {
        return;
      }

      isSyncingFromMachine.current = true;
      try {
        const existingPanel = api.panels.find((p) => p.id === event.path);
        if (existingPanel) {
          existingPanel.api.setActive();
        } else {
          const fileName = event.path.split('/').pop() ?? event.path;
          api.addPanel({
            id: event.path,
            component: 'editor',
            title: fileName,
            params: { filePath: event.path },
          });
        }

        // Only open the editor panel when the file was opened by user action
        if (event.source === 'user') {
          setIsEditorOpen(true);
        }

        // Handle line number navigation
        if (monaco && event.lineNumber) {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              const uri = createMonacoUri(monaco, event.path);
              const model = monaco.editor.getModel(uri);
              if (model) {
                const editors = monaco.editor.getEditors();
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
      } finally {
        isSyncingFromMachine.current = false;
      }
    });

    return () => {
      openFileSub.unsubscribe();
    };
  }, [api, editorRef, monaco, setIsEditorOpen]);

  // Two-way sync: Dockview -> editor machine
  useEffect(() => {
    if (!api) {
      return;
    }

    const activeDisposable = api.onDidActivePanelChange((event) => {
      if (isSyncingFromMachine.current || !event) {
        return;
      }

      const filePath = event.id;
      editorRef.send({ type: 'setActiveFile', path: filePath });
    });

    const removeDisposable = api.onDidRemovePanel((event) => {
      if (isSyncingFromMachine.current) {
        return;
      }

      const filePath = event.id;
      editorRef.send({ type: 'closeFile', path: filePath });
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

  // Handle ready event: restore layout or seed default
  const onReady = useCallback(
    (event: DockviewReadyEvent) => {
      const dockApi = event.api;
      setApi(dockApi);

      isRestoringLayout.current = true;

      try {
        if (editorLayout) {
          dockApi.fromJSON(editorLayout);
        } else {
          // Seed from editor machine's current open files
          const snapshot = editorRef.getSnapshot();
          const { openFiles, activeFilePath } = snapshot.context;

          if (openFiles.length > 0) {
            for (const file of openFiles) {
              const fileName = file.path.split('/').pop() ?? file.path;
              dockApi.addPanel({
                id: file.path,
                component: 'editor',
                title: fileName,
                params: { filePath: file.path },
                inactive: file.path !== activeFilePath,
              });
            }
          } else if (mainEntryFile) {
            // Seed with main entry file
            const fileName = mainEntryFile.split('/').pop() ?? mainEntryFile;
            dockApi.addPanel({
              id: mainEntryFile,
              component: 'editor',
              title: fileName,
              params: { filePath: mainEntryFile },
            });
          }
        }
      } catch {
        // Corrupt layout -- seed from current state
        dockApi.clear();
        const snapshot = editorRef.getSnapshot();
        const { openFiles, activeFilePath } = snapshot.context;

        for (const file of openFiles) {
          const fileName = file.path.split('/').pop() ?? file.path;
          dockApi.addPanel({
            id: file.path,
            component: 'editor',
            title: fileName,
            params: { filePath: file.path },
            inactive: file.path !== activeFilePath,
          });
        }
      } finally {
        isRestoringLayout.current = false;
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
          const { entryFile } = JSON.parse(viewerData) as { entryFile?: string };
          if (entryFile) {
            editorRef.send({ type: 'openFile', path: entryFile, source: 'user' });
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
        noPanelsOverlay="emptyGroup"
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
