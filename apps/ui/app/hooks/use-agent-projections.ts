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
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';
import type { ChatSessionActorRef } from '#machines/chat-session.machine.js';

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
  /**
   * Funded Tau operations this chat's turns were charged through.
   *
   * The projection stays serializable and price-free: the pane reads each
   * operation's authoritative receipt, so no local catalog multiplication can
   * reach a user-facing amount (B4 R2).
   */
  readonly operationIds: readonly string[];
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

const usageOperationIds = (messages: readonly MyUIMessage[]): string[] => {
  const ids = new Set<string>();
  for (const message of messages) {
    for (const part of message.parts) {
      if (part.type === 'data-usage' && part.data.operationId !== undefined) {
        ids.add(part.data.operationId);
      }
    }
  }
  return [...ids].sort();
};

const errorDetail = (input: Pick<AgentProjectionInput, 'chat' | 'session'>): string | undefined => {
  const runtimeError = input.session?.chat.error;
  if (runtimeError) {
    return runtimeError.message;
  }
  return input.session?.persistenceActorRef.getSnapshot().context.persistedError?.message ?? input.chat.error?.message;
};

/**
 * The pane's four-state vocabulary, read off the chat's own machine (D32).
 *
 * The machine is the one derivation of what a chat is doing; this only folds
 * its states into the coarser row the Agents pane draws. A chat with no live
 * session — a parked row, or a jsdom unit that never opened one — falls back to
 * the flags below.
 *
 * @param ref - The chat's state machine, when the project session owns one.
 * @returns The row's state and detail, or `undefined` when there is no machine.
 */
const stateFromMachine = (
  ref: ChatSessionActorRef | undefined,
): { readonly state: AgentProjectionState; readonly detail?: string } | undefined => {
  if (ref === undefined) {
    return undefined;
  }
  const snapshot = ref.getSnapshot();
  const { pendingApprovalCount, toolName, failureReason } = snapshot.context;
  if (snapshot.matches({ run: { running: { waiting: 'approval' } } })) {
    return {
      state: 'waiting',
      detail: `${pendingApprovalCount} approval${pendingApprovalCount === 1 ? '' : 's'} required`,
    };
  }
  if (snapshot.matches({ run: { running: { waiting: 'input' } } })) {
    return { state: 'waiting', detail: 'Waiting for input' };
  }
  if (snapshot.matches({ run: { running: 'reconnecting' } })) {
    return { state: 'waiting', detail: 'Retrying connection' };
  }
  if (snapshot.matches({ run: { running: 'tool' } })) {
    return { state: 'running', detail: toolName === undefined ? 'Running a tool' : `Running ${toolName}` };
  }
  if (snapshot.matches({ run: { running: 'generating' } })) {
    return { state: 'running', detail: 'Streaming response' };
  }
  if (snapshot.matches({ run: 'queued' })) {
    return { state: 'running', detail: 'Queued' };
  }
  if (snapshot.matches({ run: 'failed' })) {
    return { state: 'error', detail: failureReason ?? 'Request failed' };
  }
  return { state: 'idle' };
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
  const { chat, session, status, lifecycle, focusedChatId, defaultModel, resolveModel, defaultWorkspace, metadata } =
    input;
  const messages = session?.chat.messages ?? chat.messages;
  const pendingApprovalCount = countPendingApprovals(messages);
  const persistedSnapshot = session?.persistenceActorRef.getSnapshot();
  const activeExecution = persistedSnapshot?.context.activeExecution ?? chat.activeExecution;
  const activeModelId = activeExecution?.kind === 'tau' ? activeExecution.model : defaultModel.id;
  const model = activeModelId === defaultModel.id ? defaultModel : resolveModel(activeModelId);
  const failure = errorDetail(input);
  const fromMachine = stateFromMachine(session?.stateActorRef);
  const state =
    fromMachine?.state ??
    resolveState({
      pendingApprovalCount,
      lifecycle,
      status,
      hasError: failure !== undefined || status === 'error',
    });
  const lastActivityAt = lastMessageActivityAt(messages, chat.createdAt);
  const detail = fromMachine
    ? (fromMachine.detail ?? (state === 'error' ? (failure ?? 'Request failed') : undefined))
    : resolveDetail({ pendingApprovalCount, lifecycle, state, failure });

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
    /* No chat has a branch of its own: turns attach to the chat's checkout and
     * never create one (A29, S11). The row shows the checkout's branch, which
     * the caller passes as metadata when it knows it. */
    branch: metadata?.branch ?? 'main',
    pendingApprovalCount,
    operationIds: usageOperationIds(messages),
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
        usageOperationIds(messages),
        lastMessageActivityAt(messages, 0),
        persistenceSnapshot.context.activeExecution,
        persistenceSnapshot.context.persistedError?.message,
        session.chat.error?.message,
        session.stateActorRef?.getSnapshot().value,
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
          const stateSubscription = session.stateActorRef?.subscribe(listener);
          const unsubscribeChat = store.subscribeChat(chatId, listener);
          sessionCleanups.push(() => {
            actorSubscription.unsubscribe();
            stateSubscription?.unsubscribe();
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
            focusedChatId,
            defaultModel: selectedModel,
            resolveModel,
            defaultWorkspace,
            metadata: metadataByChatId[chat.id],
          });
        }),
      ),
    [chats, defaultWorkspace, focusedChatId, liveSnapshot, metadataByChatId, resolveModel, selectedModel, store],
  );

  return { agents, isLoading, error, retry };
};
