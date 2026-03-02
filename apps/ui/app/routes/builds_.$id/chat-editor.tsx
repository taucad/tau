import { memo, useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileCode } from 'lucide-react';
import type * as Monaco from 'monaco-editor';
import { languageFromExtension } from '@taucad/types/constants';
import { CodeEditor } from '#components/code/code-editor.client.js';
import { cn } from '#utils/ui.utils.js';
import { Loader } from '#components/ui/loader.js';
import { ChatEditorBreadcrumbs } from '#routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '#hooks/use-build.js';
import { ChatEditorTabs } from '#routes/builds_.$id/chat-editor-tabs.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { getFileExtension, isBinaryFile, decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { ChatEditorBinaryWarning } from '#routes/builds_.$id/chat-editor-binary-warning.js';
import { ChatEditorPlanViewer } from '#routes/builds_.$id/chat-editor-plan-viewer.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { useFeature } from '#flags/use-feature.js';
import { useViewContext } from '#routes/builds_.$id/chat-interface-view-context.js';
import { useMonacoServices } from '#hooks/use-monaco-model-service.js';
import { useKernelDiagnostics } from '#hooks/use-kernel-diagnostics.js';

/**
 * Create a root-level Monaco URI for a file path.
 * Uses root-level URIs (e.g., file:///main.ts) for consistent module resolution.
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

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { buildId, editorRef, compilationUnits, mainEntryFile } = useBuild();
  const cadActor = compilationUnits.get(mainEntryFile);
  const fileManager = useFileManager();
  const { fileManagerRef } = useFileManager();
  const [forceOpenBinary, setForceOpenBinary] = useState(false);
  const { setIsEditorOpen } = useViewContext();
  const { modelService, markerService } = useMonacoServices();
  const planModeEnabled = useFeature('planMode');

  // Kernel diagnostics (replaces manual marker management) - uses viewport's compilation unit
  const { handleValidate } = useKernelDiagnostics({
    monaco: monaco ?? undefined,
    cadActor,
    markerService,
  });

  // Get active file path from editor
  const activeFilePath = useSelector(editorRef, (state) => {
    return state.context.activeFilePath;
  });

  const activeFile = useSelector(fileManagerRef, (state) => {
    const { openFiles } = state.context;

    if (!activeFilePath) {
      return undefined;
    }

    const fileContent = openFiles.get(activeFilePath);
    if (!fileContent) {
      return undefined;
    }

    const name = activeFilePath.split('/').pop() ?? activeFilePath;

    return {
      path: activeFilePath,
      name,
      isBinary: isBinaryFile(name, fileContent),
      content: fileContent,
      language: languageFromExtension[getFileExtension(name) as keyof typeof languageFromExtension],
    };
  });

  // Reset force open when file path changes (switching files)
  useEffect(() => {
    setForceOpenBinary(false);
  }, [activeFile?.path]);

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (!activeFile) {
        return;
      }

      const encoded = encodeTextFile(value ?? '');
      // Encode string -> Uint8Array and write directly to fileManager
      void fileManager.writeFile(activeFile.path, encoded, { source: 'editor' });
    },
    [activeFile, fileManager],
  );

  // Decode Uint8Array -> string for editor
  const editorContent = activeFile ? decodeTextFile(activeFile.content) : '';

  const handleForceOpenBinary = useCallback(() => {
    setForceOpenBinary(true);
  }, []);

  // Register/unregister editor model with the model service
  const activeFilePathForModel = activeFile?.path;
  useEffect(() => {
    if (!modelService || !activeFilePathForModel) {
      return;
    }

    modelService.registerEditorModel(activeFilePathForModel);
    return () => {
      modelService.unregisterEditorModel(activeFilePathForModel);
    };
  }, [modelService, activeFilePathForModel]);

  // Subscribe to fileOpened events to open the editor panel and jump to specific line numbers
  useEffect(() => {
    if (!monaco) {
      return;
    }

    const subscription = editorRef.on('fileOpened', (event) => {
      // Only open the editor panel when the file was opened by user action
      // Machine sources (build load, chat tools) should not auto-open the editor panel
      if (event.source === 'user') {
        setIsEditorOpen(true);
      }

      // Only jump if a line number is specified
      const { lineNumber, column } = event;
      if (!lineNumber) {
        return;
      }

      // Defer Monaco navigation until after the layout has fully settled
      // Double rAF ensures we wait for both React render and browser layout/paint cycles
      // This prevents layout shifts when the editor panel is opening
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const uri = createMonacoUri(monaco, event.path);
          const model = monaco.editor.getModel(uri);

          if (model) {
            const editors = monaco.editor.getEditors();
            const targetEditor = editors.find((editorInstance) => editorInstance.getModel() === model);

            if (targetEditor) {
              const position = new monaco.Position(lineNumber, column ?? 1);
              targetEditor.setPosition(position);
              targetEditor.revealPositionInCenter(position);
              targetEditor.focus();
            }
          }
        });
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [monaco, editorRef, buildId, setIsEditorOpen]);

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <ChatEditorTabs />
      {activeFilePath ? <ChatEditorBreadcrumbs filePath={activeFilePath} /> : undefined}
      {activeFile ? (
        planModeEnabled && activeFile.path.endsWith('.plan.md') ? (
          <ChatEditorPlanViewer content={editorContent} filePath={activeFile.path} />
        ) : activeFile.isBinary && !forceOpenBinary ? (
          <ChatEditorBinaryWarning onForceOpen={handleForceOpenBinary} />
        ) : (
          <CodeEditor
            loading={<Loader className="size-20 stroke-1 text-primary" />}
            className="h-full bg-background"
            defaultLanguage={activeFile.language}
            defaultValue={editorContent}
            path={createMonacoPath(activeFile.path)}
            onChange={handleCodeChange}
            onValidate={handleValidate}
          />
        )
      ) : (
        <EmptyItems>
          <FileCode className="mb-4 size-12 stroke-1 text-muted-foreground" />
          <p className="text-base font-medium">No file selected</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Select a file to start editing</p>
        </EmptyItems>
      )}
    </div>
  );
});
