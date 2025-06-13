import { memo, useCallback, useEffect } from 'react';
import type { ComponentProps, JSX } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';
import { ChatEditorTabs } from '~/routes/builds_.$id/chat-editor-tabs.js';
// eslint-disable-next-line import-x/no-unassigned-import -- setting up the Monaco editor web workers
import '~/routes/builds_.$id/chat-config.js';
import { CodeEditor } from '~/components/code-editor.js';
import { cn } from '~/utils/ui.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { HammerAnimation } from '~/components/hammer-animation.js';
import { registerMonaco } from '~/routes/builds_.$id/chat-editor-config.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): JSX.Element {
  const monaco = useMonaco();
  const code = useSelector(cadActor, (state) => state.context.code);
  const openFiles = FileExplorerContext.useSelector((state) => state.context.openFiles);
  const activeFileId = FileExplorerContext.useSelector((state) => state.context.activeFileId);
  const fileExplorerActorRef = FileExplorerContext.useActorRef();

  // Get the active file content if file explorer is available
  const activeFile = openFiles.find((file) => file.id === activeFileId);
  const displayCode = activeFile ? activeFile.content : code;

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (value) {
        if (activeFile) {
          // Update the file content in the file explorer
          fileExplorerActorRef.send({ type: 'updateFileContent', fileId: activeFile.id, content: value });
        } else {
          // Fallback to the original CAD actor behavior
          cadActor.send({ type: 'setCode', code: value });
        }
      }
    },
    [activeFile, fileExplorerActorRef],
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
  }, [monaco]);

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <ChatEditorTabs />
      <div className="flex-1">
        <CodeEditor
          loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
          className="h-full bg-background"
          defaultLanguage={activeFile?.language ?? 'typescript'}
          value={displayCode}
          onChange={handleCodeChange}
          onValidate={handleValidate}
        />
      </div>
    </div>
  );
});
