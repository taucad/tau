import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { isAnyToolPart } from '@taucad/chat';
import type { ChatStatus } from 'ai';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import { useRevisionActor } from '#routes/w.$workspace.$project/revision-provider.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import type { PersistedRevisionGraphState } from '#types/revision.types.js';

export type AgentProjectionState = 'waiting' | 'running' | 'error' | 'idle';

/**
 * Durable fields that do not currently belong to the Chat row. A future
 * server-backed projection can supply these without changing the Agents pane
 * or moving execution ownership out of {@link ChatSessionStore}.
 */
export type AgentProjectionMetadata = {
  readonly workspace?: string;
  readonly branch?: string;
};

/** Serializable, read-only view model rendered by the Agents workbench pane. */
export type AgentProjection = {
  readonly chatId: string;
  readonly name: string;
  readonly state: AgentProjectionState;
  readonly focused: boolean;
  readonly lastActivityAt: number;
  readonly model: {
    readonly id: string;
    readonly name: string;
    readonly family: ResolvedModel['family'];
    readonly provider: string;
  };
  readonly workspace: string;
  readonly branch: string;
  readonly pendingApprovalCount: number;
  readonly totalCost: number;
  readonly unread: boolean;
  readonly detail?: string;
};

export type UseAgentProjectionsOptions = {
  readonly workspaceLabel?: string;
  readonly metadataByChatId?: Readonly<Record<string, AgentProjectionMetadata>>;
};

export type AgentProjectionsView = {
  readonly agents: readonly AgentProjection[];
  readonly isLoading: boolean;
  readonly error?: string;
  readonly retry: () => Promise<unknown>;
};

type AgentRequestLifecycle = 'idle' | 'invoking' | 'retrying' | 'stopping';

type AgentProjectionInput = {
  readonly chat: ChatEntity;
  readonly session?: ChatSession;
  readonly status?: ChatStatus;
  readonly lifecycle: AgentRequestLifecycle;
  readonly persistedGraph?: PersistedRevisionGraphState;
  readonly focusedChatId?: string;
  readonly defaultModel: ResolvedModel;
  readonly resolveModel: (id: string) => ResolvedModel;
  readonly defaultWorkspace: string;
  readonly metadata?: AgentProjectionMetadata;
};

const emptyMetadataByChatId: Readonly<Record<string, AgentProjectionMetadata>> = {};

const readLifecycle = (session: ChatSession | undefined): AgentRequestLifecycle => {
  const snapshot = session?.persistenceActorRef.getSnapshot();
  if (!snapshot) {
    return 'idle';
  }
  for (const lifecycle of ['invoking', 'retrying', 'stopping'] as const) {
    if (snapshot.matches({ requestLifecycle: lifecycle })) {
      return lifecycle;
    }
  }
  return 'idle';
};

const countPendingApprovals = (messages: readonly MyUIMessage[]): number => {
  let count = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (isAnyToolPart(part) && part.state === 'approval-requested') {
        count += 1;
      }
    }
  }
  return count;
};

const lastMessageActivityAt = (messages: readonly MyUIMessage[], fallback: number): number => {
  let lastActivityAt = fallback;
  for (const message of messages) {
    lastActivityAt = Math.max(lastActivityAt, message.metadata?.createdAt ?? fallback);
  }
  return lastActivityAt;
};

const totalUsageCost = (messages: readonly MyUIMessage[]): number =>
  messages.reduce(
    (total, message) =>
      total +
      message.parts.reduce(
        (messageTotal, part) => messageTotal + (part.type === 'data-usage' ? part.data.totalCost : 0),
        0,
      ),
    0,
  );

const branchForChat = (
  chatId: string,
  messages: readonly MyUIMessage[],
  persistedGraph: PersistedRevisionGraphState | undefined,
): string => {
  if (!persistedGraph) {
    return 'main';
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (message.role !== 'user') {
      continue;
    }
    const node = persistedGraph.nodes[message.id];
    if (node?.chatId === chatId) {
      return node.branchName;
    }
  }
  return 'main';
};

const errorDetail = (input: Pick<AgentProjectionInput, 'chat' | 'session'>): string | undefined => {
  const runtimeError = input.session?.chat.error;
  if (runtimeError) {
    return runtimeError.message;
  }
  return input.session?.persistenceActorRef.getSnapshot().context.persistedError?.message ?? input.chat.error?.message;
};

const resolveState = ({
  pendingApprovalCount,
  lifecycle,
  status,
  hasError,
}: {
  readonly pendingApprovalCount: number;
  readonly lifecycle: AgentRequestLifecycle;
  readonly status?: ChatStatus;
  readonly hasError: boolean;
}): AgentProjectionState => {
  if (pendingApprovalCount > 0 || lifecycle === 'retrying') {
    return 'waiting';
  }
  if (lifecycle !== 'idle' || status === 'submitted' || status === 'streaming') {
    return 'running';
  }
  return hasError ? 'error' : 'idle';
};

const resolveDetail = ({
  pendingApprovalCount,
  lifecycle,
  state,
  failure,
}: {
  readonly pendingApprovalCount: number;
  readonly lifecycle: AgentRequestLifecycle;
  readonly state: AgentProjectionState;
  readonly failure?: string;
}): string | undefined => {
  if (pendingApprovalCount > 0) {
    return `${pendingApprovalCount} approval${pendingApprovalCount === 1 ? '' : 's'} required`;
  }
  if (lifecycle === 'retrying') {
    return 'Retrying connection';
  }
  if (state === 'running') {
    return lifecycle === 'stopping' ? 'Stopping' : 'Streaming response';
  }
  return state === 'error' ? (failure ?? 'Request failed') : undefined;
};

/** Pure projection builder used by the hook and contract tests. */
export const buildAgentProjection = (input: AgentProjectionInput): AgentProjection => {
  const {
    chat,
    session,
    status,
    lifecycle,
    persistedGraph,
    focusedChatId,
    defaultModel,
    resolveModel,
    defaultWorkspace,
    metadata,
  } = input;
  const messages = session?.chat.messages ?? chat.messages;
  const pendingApprovalCount = countPendingApprovals(messages);
  const persistedSnapshot = session?.persistenceActorRef.getSnapshot();
  const activeExecution = persistedSnapshot?.context.activeExecution ?? chat.activeExecution;
  const activeModelId = activeExecution?.kind === 'tau' ? activeExecution.model : defaultModel.id;
  const model = activeModelId === defaultModel.id ? defaultModel : resolveModel(activeModelId);
  const failure = errorDetail(input);
  const state = resolveState({
    pendingApprovalCount,
    lifecycle,
    status,
    hasError: failure !== undefined || status === 'error',
  });
  const lastActivityAt = lastMessageActivityAt(messages, chat.createdAt);
  const detail = resolveDetail({ pendingApprovalCount, lifecycle, state, failure });

  return {
    chatId: chat.id,
    name: chat.name,
    state,
    focused: chat.id === focusedChatId,
    lastActivityAt,
    model: {
      id: model.id,
      name: model.name,
      family: model.family,
      provider: model.provider.name,
    },
    workspace: metadata?.workspace ?? defaultWorkspace,
    branch: metadata?.branch ?? branchForChat(chat.id, messages, persistedGraph),
    pendingApprovalCount,
    totalCost: totalUsageCost(messages),
    unread: chat.id !== focusedChatId && chat.hasUnreadTurn === true,
    ...(detail === undefined ? {} : { detail }),
  };
};

const statePriority: Readonly<Record<AgentProjectionState, number>> = {
  waiting: 0,
  running: 1,
  error: 2,
  idle: 3,
};

export const sortAgentProjections = (agents: readonly AgentProjection[]): AgentProjection[] =>
  [...agents].sort(
    (left, right) =>
      statePriority[left.state] - statePriority[right.state] ||
      Number(right.focused) - Number(left.focused) ||
      right.lastActivityAt - left.lastActivityAt ||
      left.chatId.localeCompare(right.chatId),
  );

const liveProjectionSnapshot = (store: ChatSessionStore, chatIds: readonly string[]): string =>
  JSON.stringify(
    chatIds.map((chatId) => {
      const session = store.get(chatId);
      if (!session) {
        return [chatId, 'parked'];
      }
      const { messages } = session.chat;
      const persistenceSnapshot = session.persistenceActorRef.getSnapshot();
      return [
        chatId,
        store.getStatus(chatId),
        readLifecycle(session),
        countPendingApprovals(messages),
        totalUsageCost(messages),
        lastMessageActivityAt(messages, 0),
        persistenceSnapshot.context.activeExecution,
        persistenceSnapshot.context.persistedError?.message,
        session.chat.error?.message,
      ];
    }),
  );

/**
 * Projects every durable project chat plus any live store-owned state. The
 * subscription is project-wide: background chat updates wake this pane even
 * when their React chat view is not mounted.
 */
export const useAgentProjections = (options?: UseAgentProjectionsOptions): AgentProjectionsView => {
  const { projectId, editorRef } = useProject();
  const { chats, isLoading, error, retry } = useChats(projectId);
  const store = useChatSessionStore();
  const { selectedModel, resolveModel } = useModels();
  const revisionActor = useRevisionActor();
  const persistedGraph = useSelector(revisionActor, (state) => state.context.graph);
  const focusedChatId = useSelector(editorRef, (state) => state.context.focusedChatId);
  const chatIds = useMemo(() => chats.map((chat) => chat.id), [chats]);
  const metadataByChatId = options?.metadataByChatId ?? emptyMetadataByChatId;
  const defaultWorkspace = options?.workspaceLabel ?? 'Current workspace';

  const subscribe = useCallback(
    (listener: () => void) => {
      let sessionCleanups: Array<() => void> = [];

      const bindSessions = (): void => {
        for (const cleanup of sessionCleanups) {
          cleanup();
        }
        sessionCleanups = [];
        for (const chatId of chatIds) {
          const session = store.get(chatId);
          if (!session) {
            continue;
          }
          const actorSubscription = session.persistenceActorRef.subscribe(listener);
          const unsubscribeChat = store.subscribeChat(chatId, listener);
          sessionCleanups.push(() => {
            actorSubscription.unsubscribe();
            unsubscribeChat();
          });
        }
      };

      bindSessions();
      const unsubscribeMembership = store.subscribeMembership(() => {
        bindSessions();
        listener();
      });
      return () => {
        unsubscribeMembership();
        for (const cleanup of sessionCleanups) {
          cleanup();
        }
      };
    },
    [chatIds, store],
  );

  const getSnapshot = useCallback(() => liveProjectionSnapshot(store, chatIds), [chatIds, store]);
  const liveSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const agents = useMemo(
    () =>
      sortAgentProjections(
        chats.map((chat) => {
          const session = store.get(chat.id);
          return buildAgentProjection({
            chat,
            session,
            status: store.getStatus(chat.id),
            lifecycle: readLifecycle(session),
            persistedGraph,
            focusedChatId,
            defaultModel: selectedModel,
            resolveModel,
            defaultWorkspace,
            metadata: metadataByChatId[chat.id],
          });
        }),
      ),
    [
      chats,
      defaultWorkspace,
      focusedChatId,
      liveSnapshot,
      metadataByChatId,
      persistedGraph,
      resolveModel,
      selectedModel,
      store,
    ],
  );

  return { agents, isLoading, error, retry };
};
