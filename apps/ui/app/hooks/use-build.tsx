import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useCallback } from 'react';
import { useActorRef, useSelector } from '@xstate/react';
import type { Message } from '@ai-sdk/react';
import type { Build, Chat } from '@taucad/types';
import { buildMachine } from '#machines/build.machine.js';
import { inspect } from '#machines/inspector.js';

type BuildContextType = {
  isLoading: boolean;
  build: Build | undefined;
  error: Error | undefined;
  code: string;
  parameters: Record<string, unknown>;
  activeChat: Chat | undefined;
  activeChatId: string | undefined;
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
}: {
  readonly children: ReactNode;
  readonly buildId: string;
}): React.JSX.Element {
  // Create the build machine actor
  const actorRef = useActorRef(buildMachine, { input: { buildId }, inspect });

  // Load the build when component mounts or buildId changes
  useEffect(() => {
    actorRef.send({ type: 'loadBuild', buildId });
  }, [buildId, actorRef]);

  // Select state from the machine
  const build = useSelector(actorRef, (state) => state.context.build);
  const isLoading = useSelector(actorRef, (state) => state.context.isLoading);
  const error = useSelector(actorRef, (state) => state.context.error);

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
      build,
      isLoading,
      error,
      code,
      parameters,
      activeChatId,
      activeChat,
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
    build,
    isLoading,
    error,
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

export function useBuild(): BuildContextType {
  const context = useContext(BuildContext);
  if (context === undefined) {
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
