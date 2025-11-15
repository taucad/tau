import { memo, useCallback, useEffect, useState, useMemo, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileCode } from 'lucide-react';
import { CodeEditor } from '#components/code/code-editor.js';
import { cn } from '#utils/ui.utils.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { registerMonaco } from '#lib/monaco.js';
import { ChatEditorBreadcrumbs } from '#routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '#hooks/use-build.js';
import { ChatEditorTabs } from '#routes/builds_.$id/chat-editor-tabs.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { EmptyItems } from '#components/ui/empty-items.js';
import { getFileExtension, isBinaryFile, decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { iconFromExtension } from '#components/icons/file-extension-icon.js';
import { ChatEditorBinaryWarning } from '#routes/builds_.$id/chat-editor-binary-warning.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { fileExplorerRef: fileExplorerActor, cadRef: cadActor, buildRef } = useBuild();
  const [forceOpenBinary, setForceOpenBinary] = useState(false);
  // Get active file path from file explorer
  const activeFilePath = useSelector(fileExplorerActor, (state) => {
    return state.context.activeFilePath;
  });

  // Get active file content from build machine (source of truth)
  const activeFile = useSelector(buildRef, (state) => {
    if (!activeFilePath) {
      return undefined;
    }

    const files = state.context.build?.assets.mechanical?.files;
    const fileContent = files?.[activeFilePath];
    if (!fileContent) {
      return undefined;
    }

    return {
      path: activeFilePath,
      name: activeFilePath.split('/').pop() ?? activeFilePath,
      content: fileContent.content,
      language: iconFromExtension[getFileExtension(activeFilePath)]?.id,
    };
  });

  // Detect if the active file is binary
  const isBinary = useMemo(
    () => (activeFile ? isBinaryFile(activeFile.name, activeFile.content) : false),
    [activeFile],
  );

  // Reset force open when file path changes (switching files)
  useEffect(() => {
    setForceOpenBinary(false);
  }, [activeFile?.path]);

  // Sync file preview preference between cookie and build machine
  const [enableFilePreview] = useCookie<boolean>(cookieName.cadFilePreview, true);
  const enableFilePreviewInMachine = useSelector(buildRef, (state) => state.context.enableFilePreview);

  // Sync cookie to build machine on mount and when cookie changes
  useEffect(() => {
    if (enableFilePreview !== enableFilePreviewInMachine) {
      buildRef.send({ type: 'setEnableFilePreview', enabled: enableFilePreview });
    }
  }, [enableFilePreview, enableFilePreviewInMachine, buildRef]);

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (!activeFile) {
        return;
      }

      // Encode string → Uint8Array before sending to machine
      buildRef.send({
        type: 'updateFile',
        path: activeFile.path,
        content: encodeTextFile(value ?? ''),
        source: 'user',
      });
    },
    [activeFile, buildRef],
  );

  // Decode Uint8Array → string for editor
  const editorContent = activeFile ? decodeTextFile(activeFile.content) : '';

  const handleForceOpenBinary = useCallback(() => {
    setForceOpenBinary(true);
  }, []);

  useEffect(() => {
    if (monaco) {
      void registerMonaco(monaco);
    }
  }, [monaco]);

  // Listen to external file changes from build machine and update Monaco models
  useEffect(() => {
    if (!monaco) {
      return undefined;
    }

    // Subscribe to fileUpdated events emitted from build machine
    const subscription = buildRef.on('fileUpdated', ({ path, content, source }) => {
      // Only handle external updates (AI edits, not user typing)
      if (source !== 'external') {
        return;
      }

      // Create URI for the file path
      const uri = monaco.Uri.parse(path);
      const model = monaco.editor.getModel(uri);

      // Only update if a Monaco model exists for this file (it's open in a tab)
      if (!model) {
        return;
      }

      // Decode the content
      const newContent = decodeTextFile(content);
      const currentModelContent = model.getValue();

      // Only update if Monaco's content is different from the external update
      if (currentModelContent !== newContent) {
        // Update the model content while preserving undo/redo
        model.pushEditOperations(
          [],
          [
            {
              range: model.getFullModelRange(),
              text: newContent,
            },
          ],
          () => null,
        );
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [monaco, buildRef]);

  const handleValidate = useCallback(() => {
    const errors = monaco?.editor.getModelMarkers({});
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- monaco has import issues. This is safe.
    const filteredErrors = errors?.filter((error) => error.severity === 8);
    if (filteredErrors?.length) {
      // Send errors to the CAD actor
      cadActor.send({
        type: 'setCodeErrors',
        errors: filteredErrors.map((error) => ({
          startLineNumber: error.startLineNumber,
          startColumn: error.startColumn,
          message: error.message,
          severity: error.severity,
          endLineNumber: error.endLineNumber,
          endColumn: error.endColumn,
        })),
      });
    } else {
      // Clear errors when there are none
      cadActor.send({ type: 'setCodeErrors', errors: [] });
    }
  }, [monaco, cadActor]);

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <ChatEditorTabs />
      <ChatEditorBreadcrumbs />
      {activeFile ? (
        isBinary && !forceOpenBinary ? (
          <ChatEditorBinaryWarning onForceOpen={handleForceOpenBinary} />
        ) : (
          <CodeEditor
            loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
            className="h-full bg-background"
            defaultLanguage={activeFile.language}
            defaultValue={editorContent}
            path={activeFile.path}
            onChange={handleCodeChange}
            onValidate={handleValidate}
          />
        )
      ) : (
        <EmptyItems>
          <FileCode className="mb-4 size-12 stroke-1 text-muted-foreground" />
          <p className="text-base font-medium">No file selected</p>
          <p className="mt-1 text-xs text-muted-foreground/70">Select a file from the tree to start editing</p>
        </EmptyItems>
      )}
    </div>
  );
});
