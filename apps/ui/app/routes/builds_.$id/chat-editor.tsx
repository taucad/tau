import { memo, useCallback, useEffect } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileCode } from 'lucide-react';
import { languageFromKernel } from '@taucad/types/constants';
import { CodeEditor } from '#components/code/code-editor.js';
import { cn } from '#utils/ui.utils.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { registerMonaco } from '#routes/builds_.$id/chat-editor-config.js';
import { ChatEditorBreadcrumbs } from '#routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '#hooks/use-build.js';
import { ChatEditorTabs } from '#routes/builds_.$id/chat-editor-tabs.js';
import { useCookie } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { EmptyItems } from '#components/ui/empty-items.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { fileExplorerRef: fileExplorerActor, cadRef: cadActor, buildRef } = useBuild();
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

    const language = state.context.build?.assets.mechanical?.language;
    return {
      path: activeFilePath,
      name: activeFilePath.split('/').pop() ?? activeFilePath,
      content: fileContent.content,
      language: language ? languageFromKernel[language] : undefined,
    };
  });

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

      // Update build machine as single source of truth
      buildRef.send({
        type: 'updateFile',
        path: activeFile.path,
        content: value ?? '',
      });
    },
    [activeFile, buildRef],
  );

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
      <div className="flex-1">
        {activeFile ? (
          <CodeEditor
            loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
            className="h-full bg-background"
            language={activeFile.language}
            value={activeFile.content}
            onChange={handleCodeChange}
            onValidate={handleValidate}
          />
        ) : (
          <EmptyItems>
            <FileCode className="mb-4 size-12 stroke-1 text-muted-foreground" />
            <p className="text-base font-medium">No file selected</p>
            <p className="mt-1 text-xs text-muted-foreground/70">Select a file from the tree to start editing</p>
          </EmptyItems>
        )}
      </div>
    </div>
  );
});
