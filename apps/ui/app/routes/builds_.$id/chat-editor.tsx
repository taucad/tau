import { memo, useCallback, useEffect } from 'react';
import type { ComponentProps, JSX } from 'react';
import { useMonaco } from '@monaco-editor/react';
import { useSelector } from '@xstate/react';
import { FileExplorerContext } from '~/routes/builds_.$id/graphics-actor.js';
// eslint-disable-next-line import-x/no-unassigned-import -- setting up the Monaco editor web workers
import '~/routes/builds_.$id/chat-config.js';
import { CodeEditor } from '~/components/code-editor.js';
import { cn } from '~/utils/ui.js';
import { cadActor } from '~/routes/builds_.$id/cad-actor.js';
import { HammerAnimation } from '~/components/hammer-animation.js';
import { registerMonaco } from '~/routes/builds_.$id/chat-editor-config.js';
import { ChatEditorBreadcrumbs } from '~/routes/builds_.$id/chat-editor-breadcrumbs.js';
import { useBuild } from '~/hooks/use-build.js';

export const ChatEditor = memo(function ({ className }: { readonly className?: string }): JSX.Element {
  const monaco = useMonaco();
  const { build } = useBuild();
  const code = useSelector(cadActor, (state) => state.context.code);
  const openFiles = FileExplorerContext.useSelector((state) => state.context.openFiles);
  const activeFileId = FileExplorerContext.useSelector((state) => state.context.activeFileId);
  const fileExplorerActorRef = FileExplorerContext.useActorRef();

  // Initialize file explorer with build files
  useEffect(() => {
    if (!build?.assets.mechanical) return;

    const mechanicalAsset = build.assets.mechanical;
    const mainFileName = mechanicalAsset.main;
    const { files } = mechanicalAsset;

    // Convert build files to file explorer format
    const fileItems = Object.entries(files).map(([filename, file]) => ({
      id: filename,
      name: filename,
      path: filename,
      content: file.content,
      language: mechanicalAsset.language === 'replicad' ? 'typescript' : mechanicalAsset.language,
      isDirectory: false,
    }));

    // Initialize the file tree with build files
    fileExplorerActorRef.send({ type: 'setFileTree', tree: fileItems });

    // Clear existing open files and open the main file from the new build
    for (const file of openFiles) {
      fileExplorerActorRef.send({ type: 'closeFile', fileId: file.id });
    }

    if (mainFileName && files[mainFileName]) {
      const mainFile = {
        id: mainFileName,
        name: mainFileName,
        path: mainFileName,
        content: files[mainFileName].content,
        language: mechanicalAsset.language === 'replicad' ? 'typescript' : mechanicalAsset.language,
        isDirectory: false,
      };

      fileExplorerActorRef.send({ type: 'openFile', file: mainFile });
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps -- we only want to run this effect when the build changes
  }, [build?.id, fileExplorerActorRef]);

  // Get the active file content if file explorer is available
  const activeFile = openFiles.find((file) => file.id === activeFileId);

  // Fallback to build main file if no file explorer file is active
  const fallbackFilename = build?.assets.mechanical?.main ?? 'main.ts';
  const fallbackContent = build?.assets.mechanical?.files[fallbackFilename]?.content ?? code;

  const displayCode = activeFile ? activeFile.content : fallbackContent;
  const displayLanguage = activeFile?.language ?? 'typescript';

  const handleCodeChange = useCallback(
    (value: ComponentProps<typeof CodeEditor>['value']) => {
      if (value) {
        // Always update the file explorer (for persistence)
        const fileId = activeFile?.id ?? fallbackFilename;
        fileExplorerActorRef.send({ type: 'updateFileContent', fileId, content: value });

        // Always update the CAD actor (for immediate feedback)
        cadActor.send({ type: 'setCode', code: value });
      }
    },
    [activeFile, fallbackFilename, fileExplorerActorRef],
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
      {/* <ChatEditorTabs /> */}
      <ChatEditorBreadcrumbs />
      <div className="flex-1">
        <CodeEditor
          loading={<HammerAnimation className="size-20 animate-spin stroke-1 text-primary ease-in-out" />}
          className="h-full bg-background"
          defaultLanguage={displayLanguage}
          value={displayCode}
          onChange={handleCodeChange}
          onValidate={handleValidate}
        />
      </div>
    </div>
  );
});
