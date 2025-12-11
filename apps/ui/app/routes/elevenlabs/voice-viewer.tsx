import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { fromPromise, waitFor } from 'xstate';
import { Bug, Loader2, Send } from 'lucide-react';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import type { Build, CodeError, KernelError } from '@taucad/types';
import { CadViewer } from '#components/geometry/cad/cad-viewer.js';
import { Parameters } from '#components/geometry/parameters/parameters.js';
import { BuildProvider, useBuild } from '#hooks/use-build.js';
import { FileManagerProvider, useFileManager } from '#hooks/use-file-manager.js';
import { cn } from '#utils/ui.utils.js';
import { HammerAnimation } from '#components/hammer-animation.js';
import { decodeTextFile, encodeTextFile } from '#utils/filesystem.utils.js';
import { Button } from '#components/ui/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '#components/ui/dialog.js';
import { ChatProvider, useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useChatTools } from '#hooks/use-chat-tools.js';
import { useChatConstants, createMessage } from '#utils/chat.utils.js';
import { useKernel } from '#hooks/use-kernel.js';

export type RenderResult = {
  status: 'ready' | 'error';
  codeErrors: CodeError[];
  kernelErrors: KernelError[] | undefined;
};

const heroBuildId = 'elevenlabs-demo';
const mainFile = 'main.scad';

type Files = Record<string, { content: Uint8Array }>;
type HeroBuild = Build & { files: Files };

function createHeroBuild(fileContent: Uint8Array): HeroBuild {
  return {
    id: heroBuildId,
    assets: {
      mechanical: {
        main: mainFile,
        parameters: {},
      },
    },
    name: 'ElevenLabs Demo',
    description: 'Voice-controlled CAD demo',
    author: {
      name: 'Demo',
      avatar: '/avatar-sample.png',
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['openscad', 'demo'],
    stars: 0,
    forks: 0,
    thumbnail: '/tau-desktop.jpg',
    files: { [mainFile]: { content: fileContent } },
  };
}

function ViewerStatus({ className, ...properties }: React.HTMLAttributes<HTMLDivElement>): React.ReactNode {
  const { cadRef } = useBuild();
  const state = useSelector(cadRef, (snapshot) => snapshot.value);

  return ['buffering', 'rendering', 'booting', 'initializing'].includes(state) ? (
    <div
      {...properties}
      className={cn(
        'absolute top-4 left-4 z-10 flex items-center gap-2 rounded-md border bg-background/70 px-2 py-1 backdrop-blur-sm',
        className,
      )}
    >
      <span className="font-mono text-sm text-muted-foreground capitalize">{state}...</span>
      <Loader2 className="size-4 animate-spin text-primary" />
    </div>
  ) : null;
}

// Simple chat panel with message display and sample button
function ChatPanel(): React.JSX.Element {
  const messages = useChatSelector((state) => state.messages);
  const status = useChatSelector((state) => state.status);
  const isLoading = useChatSelector((state) => state.isLoading);
  const { sendMessage } = useChatActions();
  const { kernel } = useKernel();

  // Debug logging
  useEffect(() => {
    console.log('[ChatPanel] messages:', messages.length, 'status:', status, 'isLoading:', isLoading);
  }, [messages, status, isLoading]);

  const handleSampleMessage = useCallback(() => {
    const userMessage = createMessage({
      content: 'Create a dollhouse',
      role: messageRole.user,
      metadata: { kernel, model: 'anthropic-claude-opus-4.5', status: messageStatus.pending },
    });
    console.log('[ChatPanel] sending message:', userMessage);
    sendMessage(userMessage);
  }, [sendMessage, kernel]);

  return (
    <div className="flex w-80 flex-col border-r bg-background">
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold">Voice Chat</h3>
        <p className="text-xs text-muted-foreground">Talk to build your model</p>
      </div>

      {/* Messages display */}
      <div className="flex-1 overflow-auto p-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="mb-4 text-sm text-muted-foreground">No messages yet</p>
            <Button disabled={status === 'streaming'} onClick={handleSampleMessage}>
              <Send className="mr-2 size-4" />
              Create Dollhouse
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => (
              <div key={message.id} className="rounded-md border bg-muted/50 p-2">
                <div className="mb-1 text-xs font-semibold text-muted-foreground">{message.role}</div>
                {message.parts.map((part, partIndex) => (
                  // eslint-disable-next-line react/no-array-index-key -- parts don't have unique IDs
                  <pre key={`${message.id}-part-${partIndex}`} className="overflow-auto text-xs whitespace-pre-wrap">
                    {JSON.stringify(part, null, 2)}
                  </pre>
                ))}
              </div>
            ))}
            {status === 'streaming' ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Generating...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Sample button at bottom when there are messages */}
      {messages.length > 0 ? (
        <div className="border-t p-2">
          <Button disabled={status === 'streaming'} className="w-full" size="sm" onClick={handleSampleMessage}>
            <Send className="mr-2 size-4" />
            Create Dollhouse
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export type HeroViewerHandle = {
  writeCode: (code: string) => Promise<RenderResult>;
};

type HeroViewerContentProperties = {
  readonly onRenderComplete?: (result: RenderResult) => void;
};

const HeroViewerContent = forwardRef<HeroViewerHandle, HeroViewerContentProperties>(
  ({ onRenderComplete }, ref): React.JSX.Element => {
    const { cadRef, buildRef, graphicsRef, getMainFilename } = useBuild();
    const { writeFiles, readFile } = useFileManager();

    const hasInitializedRef = useRef(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [currentCode, setCurrentCode] = useState<string>('');

    const geometries = useSelector(cadRef, (snapshot) => snapshot.context.geometries);
    const cadStatus = useSelector(cadRef, (snapshot) => snapshot.value);
    const parameters = useSelector(cadRef, (snapshot) => snapshot.context.parameters);
    const defaultParameters = useSelector(cadRef, (snapshot) => snapshot.context.defaultParameters);
    const jsonSchema = useSelector(cadRef, (snapshot) => snapshot.context.jsonSchema);
    const hasParameters = useSelector(cadRef, (snapshot) => Boolean(snapshot.context.jsonSchema));
    const units = useSelector(graphicsRef, (snapshot) => snapshot.context.units);

    // Fetch current code when dialog opens
    const handleDialogOpen = useCallback(
      async (open: boolean) => {
        if (open) {
          const content = await readFile(mainFile);
          setCurrentCode(decodeTextFile(content));
        }
      },
      [readFile],
    );

    // Track if build is ready using selector (more reliable than waitFor with React Strict Mode)
    const buildIsReady = useSelector(buildRef, (state) => state.matches('ready'));
    const build = useSelector(buildRef, (state) => state.context.build);

    // Initialize: load model when build becomes ready (files are already written by FileInitializer)
    useEffect(() => {
      if (!buildIsReady || !build || hasInitializedRef.current) {
        return;
      }

      hasInitializedRef.current = true;
      console.log('[HeroViewerContent] Build ready, loading CAD model...');

      // Load the CAD model (files already exist from FileInitializer)
      buildRef.send({ type: 'loadModel' });
      setIsInitialized(true);
    }, [buildIsReady, build, buildRef]);

    // Expose writeCode handler via ref
    const writeCode = useCallback(
      async (code: string): Promise<RenderResult> => {
        await writeFiles({ [mainFile]: { content: encodeTextFile(code) } });
        buildRef.send({ type: 'loadModel' });

        // Wait for CAD processing to complete (similar to use-chat-tools.tsx)
        const cadSnapshot = await waitFor(cadRef, (state) => state.value === 'ready' || state.value === 'error');

        // Get the kernel errors for the edited file from the per-file errors map
        const mainFilePath = await getMainFilename();
        const kernelErrors = cadSnapshot.context.kernelErrors.get(mainFilePath);

        const result: RenderResult = {
          status: cadSnapshot.value as 'ready' | 'error',
          codeErrors: cadSnapshot.context.codeErrors,
          kernelErrors,
        };

        // Call the callback if provided
        onRenderComplete?.(result);

        return result;
      },
      [writeFiles, buildRef, cadRef, getMainFilename, onRenderComplete],
    );

    const handleParametersChange = useCallback(
      (newParameters: Record<string, unknown>) => {
        cadRef.send({ type: 'setParameters', parameters: newParameters });
      },
      [cadRef],
    );

    useImperativeHandle(ref, () => ({ writeCode }), [writeCode]);

    const isLoading = !isInitialized || ['initializing', 'booting', 'buffering', 'rendering'].includes(cadStatus);
    const hasGeometries = geometries.length > 0;

    return (
      <div className="flex h-full">
        {/* Chat Panel - Left */}
        <ChatPanel />

        {/* 3D Viewer - Center */}
        <div className="relative flex-1">
          <ViewerStatus />

          {hasGeometries ? (
            <CadViewer
              enableGrid
              enableAxes
              geometries={geometries}
              className="size-full"
              stageOptions={{
                zoomLevel: 1.2,
              }}
            />
          ) : isLoading ? (
            <div className="flex size-full items-center justify-center">
              <HammerAnimation className="size-16" />
            </div>
          ) : null}

          {/* Debug Button */}
          <Dialog onOpenChange={handleDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon" className="absolute right-4 bottom-4 z-10">
                <Bug className="size-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Current Code</DialogTitle>
                <DialogDescription>The OpenSCAD code currently being rendered</DialogDescription>
              </DialogHeader>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 font-mono text-sm">
                <code>{currentCode}</code>
              </pre>
            </DialogContent>
          </Dialog>
        </div>

        {/* Parameters Panel - Right */}
        {hasParameters ? (
          <div className="flex w-80 flex-col border-l bg-background">
            <div className="border-b p-3">
              <h3 className="text-sm font-semibold">Parameters</h3>
              <p className="text-xs text-muted-foreground">Adjust the model settings</p>
            </div>
            <div className="flex-1 overflow-hidden">
              <Parameters
                isInitialExpanded={false}
                parameters={parameters}
                defaultParameters={defaultParameters}
                jsonSchema={jsonSchema}
                units={units}
                emptyDescription="Loading parameters..."
                onParametersChange={handleParametersChange}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);
HeroViewerContent.displayName = 'HeroViewerContent';

type VoiceViewerProperties = {
  readonly onRenderComplete?: (result: RenderResult) => void;
};

// Chat ID for the elevenlabs demo (stable across sessions)
const elevenlabsChatId = 'elevenlabs-demo-chat';

// Inner component that has access to build context and can configure ChatProvider
const VoiceViewerWithChat = forwardRef<
  HeroViewerHandle,
  { readonly onRenderComplete?: (result: RenderResult) => void }
>(({ onRenderComplete }, ref): React.JSX.Element => {
  const { createOnToolCall } = useChatTools();

  return (
    <ChatProvider value={{ ...useChatConstants, createOnToolCall }} chatId={elevenlabsChatId} resourceId={heroBuildId}>
      <HeroViewerContent ref={ref} onRenderComplete={onRenderComplete} />
    </ChatProvider>
  );
});
VoiceViewerWithChat.displayName = 'VoiceViewerWithChat';

// Component that writes files first, then renders BuildProvider
// This ensures files exist before CAD machine tries to boot
const FileInitializer = forwardRef<
  HeroViewerHandle,
  { readonly heroBuild: HeroBuild; readonly onRenderComplete?: (result: RenderResult) => void }
>(({ heroBuild, onRenderComplete }, ref): React.JSX.Element | undefined => {
  const { writeFiles, fileManagerRef } = useFileManager();
  const [filesReady, setFilesReady] = useState(false);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    async function initializeFiles(): Promise<void> {
      if (hasInitializedRef.current) {
        return;
      }

      hasInitializedRef.current = true;

      // Wait for file manager to be ready OR error (error happens when directory doesn't exist yet)
      // Both states can accept writeFiles events
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log('[FileInitializer] Waiting for file manager to initialize...');
      await waitFor(fileManagerRef, (state) => state.matches('ready') || state.matches('error'));
      console.log('[FileInitializer] File manager initialized, writing initial files...');

      // Write files - this works in both 'ready' and 'error' states
      // The writeFiles actor will create the directory if it doesn't exist
      const buildFiles: Record<string, { content: Uint8Array }> = {};
      for (const [path, file] of Object.entries(heroBuild.files)) {
        buildFiles[path] = file;
      }

      await writeFiles(buildFiles);
      console.log('[FileInitializer] Files written, ready to render BuildProvider');
      setFilesReady(true);
    }

    void initializeFiles();
  }, [heroBuild.files, writeFiles, fileManagerRef]);

  if (!filesReady) {
    return (
      <div className="flex h-full items-center justify-center">
        <HammerAnimation className="size-16" />
      </div>
    );
  }

  return (
    <BuildProvider
      buildId={heroBuildId}
      input={{ shouldLoadModelOnStart: false }}
      provide={{
        actors: {
          loadBuildActor: fromPromise(async () => {
            const { files, ...rest } = heroBuild;
            return rest;
          }),
        },
      }}
    >
      <VoiceViewerWithChat ref={ref} onRenderComplete={onRenderComplete} />
    </BuildProvider>
  );
});
FileInitializer.displayName = 'FileInitializer';

export const VoiceViewer = forwardRef<HeroViewerHandle, VoiceViewerProperties>(
  ({ onRenderComplete }, ref): React.JSX.Element => {
    // Create the build with default cube code
    const heroBuild = useMemo(() => createHeroBuild(encodeTextFile('cube(5);')), []);

    return (
      <FileManagerProvider rootDirectory={`/builds/${heroBuildId}`}>
        <FileInitializer ref={ref} heroBuild={heroBuild} onRenderComplete={onRenderComplete} />
      </FileManagerProvider>
    );
  },
);
VoiceViewer.displayName = 'HeroViewer';
