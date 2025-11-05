import { memo, useCallback, useEffect } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
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

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { build, fileExplorerRef: fileExplorerActor, cadRef: cadActor, buildRef } = useBuild();
  const code = useSelector(cadActor, (state) => state.context.code);
  const activeFile = useSelector(fileExplorerActor, (state) =>
    state.context.openFiles.find((file) => file.id === state.context.activeFileId),
  );

  // Sync file preview preference between cookie and build machine
  const [enableFilePreview] = useCookie<boolean>(cookieName.cadFilePreview, true);
  const enableFilePreviewInMachine = useSelector(buildRef, (state) => state.context.enableFilePreview);

  // Sync cookie to build machine on mount and when cookie changes
  useEffect(() => {
    if (enableFilePreview !== enableFilePreviewInMachine) {
      buildRef.send({ type: 'setEnableFilePreview', enabled: enableFilePreview });
    }
  }, [enableFilePreview, enableFilePreviewInMachine, buildRef]);

  // Fallback to build main file if no file explorer file is active
  const fallbackFilename = build?.assets.mechanical?.main ?? 'main.ts';
  const fallbackContent = build?.assets.mechanical?.files[fallbackFilename]?.content ?? code;

  const displayCode = activeFile ? activeFile.content : fallbackContent;

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      // Update CAD actor as source of truth - subscription will propagate to file explorer
      cadActor.send({ type: 'setCode', code: value ?? '' });
    },
    [cadActor],
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

  const language = build?.assets.mechanical?.language
    ? languageFromKernel[build.assets.mechanical.language]
    : undefined;

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      <ChatEditorTabs />
      <ChatEditorBreadcrumbs />
      <div className="flex-1">
        <CodeEditor
          loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
          className="h-full bg-background"
          language={language}
          value={displayCode}
          onChange={handleCodeChange}
          onValidate={handleValidate}
        />
      </div>
    </div>
  );
});
