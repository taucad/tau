import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { useSelector } from '@xstate/react';
import type { Chat as ChatEntity, MyUIMessage } from '@taucad/chat';
import { useChats } from '#hooks/use-chats.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { useProject } from '#hooks/use-project.js';
import { chatStatusLabel, selectChatStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSidebarState, ChatSidebarStatus } from '#hooks/use-sidebar-status.js';
import type { ChatSession, ChatSessionStore } from '#services/chat-session-store.js';

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

type AgentProjectionInput = {
  readonly chat: ChatEntity;
  readonly session?: ChatSession;
  readonly focusedChatId?: string;
  readonly defaultModel: ResolvedModel;
  readonly resolveModel: (id: string) => ResolvedModel;
  readonly defaultWorkspace: string;
  readonly metadata?: AgentProjectionMetadata;
};

const emptyMetadataByChatId: Readonly<Record<string, AgentProjectionMetadata>> = {};

/**
 * The pane's four-state vocabulary, folded from the chat's own machine (D32).
 *
 * There is no second derivation any more (R12): the `chat-session` machine is
 * the one thing that says what a chat is doing, this only coarsens its ten
 * states into the four this pane's rail draws, and the row's detail is the
 * sidebar's own sentence so both surfaces say the same words.
 *
 * Ponytail: a chat with no machine is `idle`, full stop. A project session owns
 * a machine for every one of its chats, so the only rows without one are in a
 * project that is not live — and a closed project has no agent running. The one
 * fact this loses is a *persisted* error from a previous session, which used to
 * colour the row off `chat.error`; the honest place to restore it is the store
 * replaying it as `runLifecycle{phase:'failed'}` when it rehydrates the chat,
 * not a second status here.
 */
const paneState: Readonly<Record<ChatSidebarState, AgentProjectionState>> = {
  idle: 'idle',
  queued: 'running',
  working: 'running',
  tool: 'running',
  approval: 'waiting',
  question: 'waiting',
  reconnecting: 'waiting',
  /* P71: the run reported completion but the host has not attested the turn's
   * cut and lease retirement yet — still the agent's. */
  finishing: 'running',
  done: 'idle',
  failed: 'error',
  stopped: 'idle',
};

const chatStatusOf = (session: ChatSession | undefined): ChatSidebarStatus | undefined => {
  const snapshot = session?.stateActorRef?.getSnapshot();
  return snapshot === undefined ? undefined : selectChatStatus(snapshot);
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

/** Pure projection builder used by the hook and contract tests. */
export const buildAgentProjection = (input: AgentProjectionInput): AgentProjection => {
  const { chat, session, focusedChatId, defaultModel, resolveModel, defaultWorkspace, metadata } = input;
  const messages = session?.chat.messages ?? chat.messages;
  const status = chatStatusOf(session);
  const persistedSnapshot = session?.persistenceActorRef.getSnapshot();
  const activeExecution = persistedSnapshot?.context.activeExecution ?? chat.activeExecution;
  const activeModelId = activeExecution?.kind === 'tau' ? activeExecution.model : defaultModel.id;
  const model = activeModelId === defaultModel.id ? defaultModel : resolveModel(activeModelId);
  const detail = status === undefined ? undefined : chatStatusLabel(status);

  return {
    chatId: chat.id,
    name: chat.name,
    state: status === undefined ? 'idle' : paneState[status.state],
    focused: chat.id === focusedChatId,
    lastActivityAt: lastMessageActivityAt(messages, chat.createdAt),
    model: {
      id: model.id,
      name: model.name,
      family: model.family,
      provider: model.provider.name,
    },
    workspace: metadata?.workspace ?? defaultWorkspace,
    /* No chat has a branch of its own: turns attach to the chat's checkout and
     * never create one (A29, S11). The row shows the checkout's branch, which
     * the machine carries once a turn has landed on one. */
    branch: metadata?.branch ?? status?.branch ?? 'main',
    pendingApprovalCount: status?.pendingApprovalCount ?? 0,
    operationIds: usageOperationIds(messages),
    /* The machine's `read` region, which the store restores from the
     * project's unread record (D9) — never a second answer (I26). */
    unread: chat.id !== focusedChatId && status?.unread === true,
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
        chatStatusOf(session),
        usageOperationIds(messages),
        lastMessageActivityAt(messages, 0),
        persistenceSnapshot.context.activeExecution,
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

  /*
   * P66: the pane reads the value, never a key it then re-derives from.
   *
   * This used to be `useMemo(build, [..., liveSnapshot, ...])` over a JSON key
   * the callback never read — and React Compiler infers a memo's dependencies
   * from what the callback reads, so the key was dropped and the pane froze on
   * whatever the store said first. The projections are the snapshot now, held
   * stable while the store's settled key is unchanged; the closure is rebuilt
   * when React's own inputs move, which is the other half of the same bailout.
   */
  const build = useCallback(
    (): readonly AgentProjection[] =>
      sortAgentProjections(
        chats.map((chat) =>
          buildAgentProjection({
            chat,
            session: store.get(chat.id),
            focusedChatId,
            defaultModel: selectedModel,
            resolveModel,
            defaultWorkspace,
            metadata: metadataByChatId[chat.id],
          }),
        ),
      ),
    [chats, defaultWorkspace, focusedChatId, metadataByChatId, resolveModel, selectedModel, store],
  );
  const cache = useRef<{ build: typeof build; key: string; value: readonly AgentProjection[] } | undefined>(undefined);
  const getSnapshot = useCallback(() => {
    /* Stable while the store's settled key and React's own inputs are
     * unchanged — `build`'s identity is the second half, and it moves exactly
     * when what it reads does. */
    const key = liveProjectionSnapshot(store, chatIds);
    if (cache.current?.key !== key || cache.current.build !== build) {
      cache.current = { build, key, value: build() };
    }
    return cache.current.value;
  }, [build, chatIds, store]);
  const agents = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return { agents, isLoading, error, retry };
};
