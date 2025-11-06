import type { ReactNode } from 'react';
import { createContext, useContext, useMemo, useCallback, useEffect } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { ActorRefFrom } from 'xstate';
import type { Message } from '@ai-sdk/react';
import type { Build, Chat } from '@taucad/types';
import { buildMachine } from '#machines/build.machine.js';
import type { gitMachine } from '#machines/git.machine.js';
import type { fileExplorerMachine } from '#machines/file-explorer.machine.js';
import { inspect } from '#machines/inspector.js';
import type { filesystemMachine } from '#machines/filesystem.machine.js';
import type { cadMachine } from '#machines/cad.machine.js';
import type { graphicsMachine } from '#machines/graphics.machine.js';
import type { screenshotCapabilityMachine } from '#machines/screenshot-capability.machine.js';
import type { cameraCapabilityMachine } from '#machines/camera-capability.machine.js';
import type { logMachine } from '#machines/logs.machine.js';

type BuildContextType = {
  buildId: string;
  isLoading: boolean;
  build: Build | undefined;
  error: Error | undefined;
  code: string;
  parameters: Record<string, unknown>;
  activeChat: Chat | undefined;
  activeChatId: string | undefined;
  buildRef: ActorRefFrom<typeof buildMachine>;
  gitRef: ActorRefFrom<typeof gitMachine>;
  fileExplorerRef: ActorRefFrom<typeof fileExplorerMachine>;
  filesystemRef: ActorRefFrom<typeof filesystemMachine>;
  graphicsRef: ActorRefFrom<typeof graphicsMachine>;
  cadRef: ActorRefFrom<typeof cadMachine>;
  screenshotRef: ActorRefFrom<typeof screenshotCapabilityMachine>;
  cameraRef: ActorRefFrom<typeof cameraCapabilityMachine>;
  logRef: ActorRefFrom<typeof logMachine>;
  setChatMessages: (chatId: string, messages: Message[]) => void;
  setCodeParameters: (files: Record<string, { content: string }>, parameters: Record<string, unknown>) => void;
  updateName: (name: string) => void;
  updateDescription: (description: string) => void;
  updateTags: (tags: string[]) => void;
  updateThumbnail: (thumbnail: string) => void;
  // Chat related functions
  addChat: (initialMessages?: Message[]) => void;
  setActiveChat: (chatId: string) => void;
  updateChatName: (chatId: string, name: string) => void;
  deleteChat: (chatId: string) => void;
};

const BuildContext = createContext<BuildContextType | undefined>(undefined);

export function BuildProvider({
  children,
  buildId,
  provide,
  input,
}: {
  readonly children: ReactNode;
  readonly buildId: string;
  readonly provide?: Parameters<typeof buildMachine.provide>[0];
  readonly input?: Omit<Parameters<typeof useActorRef<typeof buildMachine>>[1]['input'], 'buildId'>;
}): React.JSX.Element {
  // Create the build machine actor - it will auto-load based on buildId
  const actorRef = useActorRef(buildMachine.provide(provide ?? {}), {
    input: { buildId, ...input },
    inspect,
  });

  // Select state from the machine
  const build = useSelector(actorRef, (state) => state.context.build);
  const isLoading = useSelector(actorRef, (state) => state.context.isLoading);
  const error = useSelector(actorRef, (state) => state.context.error);
  const gitRef = useSelector(actorRef, (state) => state.context.gitRef);
  const fileExplorerRef = useSelector(actorRef, (state) => state.context.fileExplorerRef);
  const filesystemRef = useSelector(actorRef, (state) => state.context.filesystemRef);
  const graphicsRef = useSelector(actorRef, (state) => state.context.graphicsRef);
  const cadRef = useSelector(actorRef, (state) => state.context.cadRef);
  const screenshotRef = useSelector(actorRef, (state) => state.context.screenshotRef);
  const cameraRef = useSelector(actorRef, (state) => state.context.cameraRef);
  const logRef = useSelector(actorRef, (state) => state.context.logRef);

  useEffect(() => {
    actorRef.send({ type: 'loadBuild', buildId });
  }, [actorRef, buildId]);

  // Memoize callbacks
  const setChatMessages = useCallback(
    (chatId: string, messages: Message[]) => {
      actorRef.send({ type: 'updateChatMessages', buildId, chatId, messages });
    },
    [actorRef, buildId],
  );

  const setCodeParameters = useCallback(
    (files: Record<string, { content: string }>, parameters: Record<string, unknown>) => {
      actorRef.send({ type: 'updateCodeParameters', buildId, files, parameters });
    },
    [actorRef, buildId],
  );

  const updateName = useCallback(
    (name: string) => {
      actorRef.send({ type: 'updateBuild', buildId, updates: { name } });
    },
    [actorRef, buildId],
  );

  const updateDescription = useCallback(
    (description: string) => {
      actorRef.send({ type: 'updateBuild', buildId, updates: { description } });
    },
    [actorRef, buildId],
  );

  const updateTags = useCallback(
    (tags: string[]) => {
      actorRef.send({ type: 'updateBuild', buildId, updates: { tags }, options: { ignoreKeys: ['tags'] } });
    },
    [actorRef, buildId],
  );

  const updateThumbnail = useCallback(
    (thumbnail: string) => {
      actorRef.send({ type: 'updateBuild', buildId, updates: { thumbnail }, options: { noUpdatedAt: true } });
    },
    [actorRef, buildId],
  );

  const addChat = useCallback(
    (initialMessages?: Message[]) => {
      actorRef.send({ type: 'addChat', buildId, initialMessages });
    },
    [actorRef, buildId],
  );

  const setActiveChat = useCallback(
    (chatId: string) => {
      actorRef.send({ type: 'setActiveChat', buildId, chatId });
    },
    [actorRef, buildId],
  );

  const updateChatName = useCallback(
    (chatId: string, name: string) => {
      actorRef.send({ type: 'updateChatName', buildId, chatId, name });
    },
    [actorRef, buildId],
  );

  const deleteChat = useCallback(
    (chatId: string) => {
      actorRef.send({ type: 'deleteChat', buildId, chatId });
    },
    [actorRef, buildId],
  );

  const value = useMemo<BuildContextType>(() => {
    const activeChatId = build?.lastChatId;
    const activeChat = build?.chats.find((chat) => chat.id === activeChatId);
    const code = build?.assets.mechanical?.files[build.assets.mechanical.main]?.content ?? '';
    const parameters = build?.assets.mechanical?.parameters ?? {};

    return {
      buildId,
      build,
      isLoading,
      error,
      code,
      parameters,
      activeChatId,
      activeChat,
      buildRef: actorRef,
      gitRef,
      fileExplorerRef,
      filesystemRef,
      graphicsRef,
      cadRef,
      screenshotRef,
      cameraRef,
      logRef,
      setChatMessages,
      setCodeParameters,
      updateName,
      updateDescription,
      updateTags,
      updateThumbnail,
      addChat,
      setActiveChat,
      updateChatName,
      deleteChat,
    };
  }, [
    buildId,
    build,
    isLoading,
    error,
    actorRef,
    gitRef,
    fileExplorerRef,
    filesystemRef,
    graphicsRef,
    cadRef,
    screenshotRef,
    cameraRef,
    logRef,
    setChatMessages,
    setCodeParameters,
    updateName,
    updateDescription,
    updateTags,
    updateThumbnail,
    addChat,
    setActiveChat,
    updateChatName,
    deleteChat,
  ]);

  return <BuildContext.Provider value={value}>{children}</BuildContext.Provider>;
}

export function useBuild<T extends BuildContextType = BuildContextType>(options?: {
  readonly enableNoContext?: false;
}): T;
export function useBuild<T extends BuildContextType = BuildContextType>(options: {
  readonly enableNoContext: true;
}): T | undefined;
export function useBuild({ enableNoContext = false }: { readonly enableNoContext?: boolean } = {}):
  | BuildContextType
  | undefined {
  const context = useContext(BuildContext);
  if (context === undefined && !enableNoContext) {
    throw new Error('useBuild must be used within a BuildProvider');
  }

  return context;
}

// Selector hook that allows selecting specific properties from the build context
export function useBuildSelector<T>(selector: (state: BuildContextType) => T): T {
  const buildContext = useBuild();

  // Use useMemo to only recompute when the selected value changes
  return useMemo(() => selector(buildContext), [buildContext, selector]);
}
