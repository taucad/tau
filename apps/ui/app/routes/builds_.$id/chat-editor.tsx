import { memo, useCallback, useEffect, useRef } from 'react';
import type { ComponentProps } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileExplorerContext } from '#routes/builds_.$id/graphics-actor.js';
import { CodeEditor } from '#components/code-editor.js';
import { cn } from '#utils/ui.js';
import { cadActor } from '#routes/builds_.$id/cad-actor.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { registerMonaco } from '#routes/builds_.$id/chat-editor-config.js';
import { ChatEditorBreadcrumbs } from '#routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '#hooks/use-build.js';
import type { Build } from '#types/build.types.js';
import type { FileItem } from '#machines/file-explorer.machine.js';
import type { KernelProvider } from '#types/kernel.types.js';

const languageFromKernel = {
  replicad: 'typescript',
  openscad: 'openscad',
  zoo: 'kcl',
} as const satisfies Record<KernelProvider, string>;

const getFileTree = (build: Build): FileItem[] => {
  if (!build.assets.mechanical) {
    return [];
  }

  const mechanicalAsset = build.assets.mechanical;
  const { files } = mechanicalAsset;

  return Object.entries(files).map(([filename, file]) => ({
    id: filename,
    name: filename,
    path: filename,
    content: file.content,
    language: languageFromKernel[mechanicalAsset.language],
    isDirectory: false,
  }));
};

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): React.JSX.Element {
  const monaco = useMonaco();
  const { build } = useBuild();
  const activeBuildId = useRef<string | undefined>(build?.id);
  const code = useSelector(cadActor, (state) => state.context.code);
  const activeFile = FileExplorerContext.useSelector((state) =>
    state.context.openFiles.find((file) => file.id === state.context.activeFileId),
  );
  const fileExplorerActorRef = FileExplorerContext.useActorRef();

  // Set file tree when build changes
  useEffect(() => {
    if (build?.id !== activeBuildId.current) {
      activeBuildId.current = build?.id;

      // Clear tree if no build or no mechanical assets
      if (!build?.assets.mechanical) {
        fileExplorerActorRef.send({ type: 'setFileTree', tree: [], openFiles: [] });
        return;
      }

      const mechanicalAsset = build.assets.mechanical;
      const fileItems = getFileTree(build);
      const openFiles = mechanicalAsset.main ? [mechanicalAsset.main] : [];

      fileExplorerActorRef.send({
        type: 'setFileTree',
        tree: fileItems,
        openFiles,
      });
    }
  }, [fileExplorerActorRef, build]);

  // Subscribe to CAD actor code changes and propagate to file explorer
  useEffect(() => {
    if (!build?.assets.mechanical?.main) {
      return;
    }

    const mainFileName = build.assets.mechanical.main;

    const subscription = cadActor.subscribe((state) => {
      // Update the main file content in file explorer when CAD actor code changes
      fileExplorerActorRef.send({
        type: 'updateFileContent',
        fileId: mainFileName,
        content: state.context.code,
      });
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [build?.assets.mechanical?.main, fileExplorerActorRef]);

  // Fallback to build main file if no file explorer file is active
  const fallbackFilename = build?.assets.mechanical?.main ?? 'main.ts';
  const fallbackContent = build?.assets.mechanical?.files[fallbackFilename]?.content ?? code;

  const displayCode = activeFile ? activeFile.content : fallbackContent;

  const handleCodeChange = useCallback((value: ComponentProps<typeof CodeEditor>['value']) => {
    // Update CAD actor as source of truth - subscription will propagate to file explorer
    cadActor.send({ type: 'setCode', code: value ?? '' });
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
  }, [monaco]);

  const language = build?.assets.mechanical?.language
    ? languageFromKernel[build.assets.mechanical.language]
    : undefined;

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {/* <ChatEditorTabs /> */}
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
