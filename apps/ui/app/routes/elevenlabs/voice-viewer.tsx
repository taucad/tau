import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSelector } from '@xstate/react';
import { fromPromise, waitFor } from 'xstate';
import { useConversation } from '@elevenlabs/react';
import { AudioLinesIcon, Bug, Loader2, PhoneOffIcon, Send } from 'lucide-react';
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
import { ENV } from '#config.js';
import { Input } from '#components/ui/input.js';
import { Orb } from '#components/elevenlabs/ui/orb.js';
import { ShimmeringText } from '#components/elevenlabs/ui/shimmering-text.js';

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

// Voice chat panel with ElevenLabs integration
function ChatPanel(): React.JSX.Element {
  const messages = useChatSelector((state) => state.messages);
  const status = useChatSelector((state) => state.status);
  const { sendMessage } = useChatActions();
  const { kernel } = useKernel();
  const { cadRef } = useBuild();

  const [textInput, setTextInput] = useState('');
  const [agentState, setAgentState] = useState<
    'disconnected' | 'connecting' | 'connected' | 'disconnecting' | undefined
  >('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const mediaStreamRef = useRef<MediaStream | undefined>(undefined);
  const isTextOnlyModeRef = useRef<boolean>(true);

  // Refs so we can use them in the conversation callback
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;
  const kernelRef = useRef(kernel);
  kernelRef.current = kernel;
  const cadRefRef = useRef(cadRef);
  cadRefRef.current = cadRef;

  const conversation = useConversation({
    onConnect() {
      console.log('[ChatPanel] ElevenLabs connected');
    },
    onDisconnect() {
      console.log('[ChatPanel] ElevenLabs disconnected');
    },
    onMessage(message) {
      console.log('[ChatPanel] ElevenLabs message:', message);
    },
    onError(error: unknown) {
      console.error('[ChatPanel] ElevenLabs error:', error);
      setAgentState('disconnected');
    },
  });

  const getMicStream = useCallback(async (): Promise<MediaStream> => {
    if (mediaStreamRef.current) {
      return mediaStreamRef.current;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      setErrorMessage(undefined);
      return stream;
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        setErrorMessage('Please enable microphone permissions.');
      }

      throw error;
    }
  }, []);

  const startConversation = useCallback(
    async (textOnly = true): Promise<void> => {
      try {
        isTextOnlyModeRef.current = textOnly;

        if (!textOnly) {
          await getMicStream();
        }

        const rawAgentId = ENV.ELEVENLABS_AGENT_ID;
        const agentId: string | undefined =
          typeof rawAgentId === 'string' && rawAgentId.length > 0 ? rawAgentId : undefined;

        if (!agentId) {
          throw new Error('Eleven Labs agent ID is not configured');
        }

        await conversation.startSession({
          agentId,
          connectionType: textOnly ? 'websocket' : 'webrtc',
          clientTools: {
            async logMessage({ message }) {
              // Send the message to the CAD chat system
              const userMessage = createMessage({
                content: message as string,
                role: messageRole.user,
                metadata: {
                  kernel: kernelRef.current,
                  model: 'anthropic-claude-opus-4.5',
                  status: messageStatus.pending,
                },
              });
              console.log('[ChatPanel] logMessage sending to CAD:', userMessage);
              sendMessageRef.current(userMessage);

              // Wait for the CAD machine to finish processing (reach 'ready' or 'error' state)
              const cadSnapshot = await waitFor(
                cadRefRef.current,
                (state) => state.value === 'ready' || state.value === 'error',
              );

              console.log('[ChatPanel] CAD state after processing:', cadSnapshot.value);

              // Check for errors
              const hasKernelErrors = cadSnapshot.context.kernelErrors.size > 0;
              const hasCodeErrors = cadSnapshot.context.codeErrors.length > 0;

              if (hasKernelErrors || hasCodeErrors) {
                // Collect error messages
                const kernelErrorMessages: string[] = [];
                for (const [, errors] of cadSnapshot.context.kernelErrors) {
                  for (const error of errors) {
                    kernelErrorMessages.push(error.message);
                  }
                }

                const codeErrorMessages = cadSnapshot.context.codeErrors.map((error) => error.message);
                const allErrors = [...kernelErrorMessages, ...codeErrorMessages];

                console.error('[ChatPanel] CAD errors:', allErrors);
                throw new Error(`CAD processing failed: ${allErrors.join('; ')}`);
              }

              console.log('[ChatPanel] CAD processing completed successfully');
              return 'success';
            },
          },
          overrides: {
            conversation: {
              textOnly,
            },
            agent: {
              firstMessage: textOnly ? '' : undefined,
            },
          },
          onStatusChange(statusChange) {
            setAgentState(statusChange.status);
          },
        });
      } catch (error: unknown) {
        console.error('[ChatPanel] startConversation error:', error);
        setAgentState('disconnected');
      }
    },
    [conversation, getMicStream],
  );

  const handleCall = useCallback(async (): Promise<void> => {
    if (agentState === 'disconnected' || agentState === undefined) {
      setAgentState('connecting');
      try {
        await startConversation(false);
      } catch {
        setAgentState('disconnected');
      }
    } else if (agentState === 'connected') {
      void conversation.endSession();
      setAgentState('disconnected');

      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }

        mediaStreamRef.current = undefined;
      }
    }
  }, [agentState, conversation, startConversation]);

  const handleTextInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    setTextInput(event.target.value);
  }, []);

  const handleSendText = useCallback(async (): Promise<void> => {
    if (!textInput.trim()) {
      return;
    }

    const messageToSend = textInput;
    setTextInput('');

    if (agentState === 'disconnected' || agentState === undefined) {
      setAgentState('connecting');
      try {
        await startConversation(true);
        conversation.sendUserMessage(messageToSend);
      } catch (error: unknown) {
        console.error('[ChatPanel] Failed to start conversation:', error);
      }
    } else if (agentState === 'connected') {
      conversation.sendUserMessage(messageToSend);
    }
  }, [textInput, agentState, conversation, startConversation]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void handleSendText();
      }
    },
    [handleSendText],
  );

  // Cleanup mic stream on unmount
  useEffect(() => {
    return () => {
      if (mediaStreamRef.current) {
        for (const track of mediaStreamRef.current.getTracks()) {
          track.stop();
        }
      }
    };
  }, []);

  const isCallActive = agentState === 'connected';
  const isTransitioning = agentState === 'connecting' || agentState === 'disconnecting';

  const getInputVolume = useCallback((): number => {
    if (typeof conversation.getInputVolume !== 'function') {
      return 0;
    }

    const rawValue = conversation.getInputVolume();
    return Math.min(1, rawValue ** 0.5 * 2.5);
  }, [conversation]);

  const getOutputVolume = useCallback((): number => {
    if (typeof conversation.getOutputVolume !== 'function') {
      return 0;
    }

    const rawValue = conversation.getOutputVolume();
    return Math.min(1, rawValue ** 0.5 * 2.5);
  }, [conversation]);

  // Get the latest text part from a message
  const getLatestTextPart = (message: (typeof messages)[number]): string | undefined => {
    // Find the last text part
    for (let index = message.parts.length - 1; index >= 0; index--) {
      const part = message.parts[index];
      if (part?.type === 'text') {
        return part.text;
      }
    }

    return undefined;
  };

  return (
    <div className="flex w-80 flex-col border-r bg-background">
      {/* Header with orb and status */}
      <div className="flex items-center gap-3 border-b p-3">
        <div className="relative size-8 overflow-hidden rounded-full ring-1 ring-border">
          <Orb
            className="h-full w-full"
            volumeMode="manual"
            getInputVolume={getInputVolume}
            getOutputVolume={getOutputVolume}
          />
        </div>
        <div className="flex flex-1 flex-col gap-0.5">
          <h3 className="text-sm leading-none font-semibold">Voice Chat</h3>
          <div className="flex items-center gap-2">
            {errorMessage ? (
              <p className="text-xs text-destructive">{errorMessage}</p>
            ) : agentState === 'disconnected' || agentState === undefined ? (
              <p className="text-xs text-muted-foreground">Type or speak to build</p>
            ) : agentState === 'connected' ? (
              <p className="text-xs text-success">Connected</p>
            ) : isTransitioning ? (
              <ShimmeringText text={agentState} className="text-xs capitalize" />
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            'flex size-2 rounded-full transition-all duration-300',
            agentState === 'connected' && 'bg-success shadow-[0_0_8px_rgba(34,197,94,0.5)]',
            isTransitioning && 'animate-pulse bg-white/40',
          )}
        />
      </div>

      {/* Messages display - show only latest text part */}
      <div className="flex-1 overflow-auto p-2">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Orb className="mb-4 size-12" />
            <p className="text-sm text-muted-foreground">No messages yet</p>
            <p className="text-xs text-muted-foreground">Start talking or type a message</p>
          </div>
        ) : (
          <div className="space-y-2">
            {messages.map((message) => {
              const latestText = getLatestTextPart(message);
              return (
                <div key={message.id} className="rounded-md border bg-muted/50 p-2">
                  <div className="mb-1 text-xs font-semibold text-muted-foreground">{message.role}</div>
                  {latestText ? (
                    <p className="text-sm whitespace-pre-wrap">{latestText}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Processing...</p>
                  )}
                </div>
              );
            })}
            {status === 'streaming' ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                Generating...
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Input and voice controls */}
      <div className="flex items-center gap-2 border-t p-2">
        <Input
          className="h-9 flex-1 focus-visible:ring-0 focus-visible:ring-offset-0"
          disabled={isTransitioning}
          placeholder="Type a message..."
          value={textInput}
          onChange={handleTextInputChange}
          onKeyDown={handleKeyDown}
        />
        <Button
          className="shrink-0 rounded-full"
          disabled={!textInput.trim() || isTransitioning}
          size="icon"
          variant="ghost"
          onClick={handleSendText}
        >
          <Send className="size-4" />
          <span className="sr-only">Send message</span>
        </Button>
        {isCallActive ? (
          <Button
            className="shrink-0 rounded-full"
            disabled={isTransitioning}
            size="icon"
            variant="secondary"
            onClick={handleCall}
          >
            <PhoneOffIcon className="size-4" />
            <span className="sr-only">End call</span>
          </Button>
        ) : (
          <Button
            className="shrink-0 rounded-full"
            disabled={isTransitioning}
            size="icon"
            variant="ghost"
            onClick={handleCall}
          >
            <AudioLinesIcon className="size-4" />
            <span className="sr-only">Start voice call</span>
          </Button>
        )}
      </div>
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
