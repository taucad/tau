import { memo, useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileCode } from 'lucide-react';
import { languageFromExtension } from '@taucad/types/constants';
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
import { ChatEditorBinaryWarning } from '#routes/builds_.$id/chat-editor-binary-warning.js';
import { useFileManager } from '#hooks/use-file-manager.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { fileExplorerRef: fileExplorerActor, cadRef: cadActor, buildRef } = useBuild();
  const fileManager = useFileManager();
  const { fileManagerRef } = useFileManager();
  const [forceOpenBinary, setForceOpenBinary] = useState(false);
  // Get active file path from file explorer
  const activeFilePath = useSelector(fileExplorerActor, (state) => {
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

      // Encode string → Uint8Array and write directly to fileManager
      void fileManager.writeFile(activeFile.path, encodeTextFile(value ?? ''));
    },
    [activeFile, fileManager],
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
        activeFile.isBinary && !forceOpenBinary ? (
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
          <p className="mt-1 text-xs text-muted-foreground/70">Select a file to start editing</p>
        </EmptyItems>
      )}
    </div>
  );
});
