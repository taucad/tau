/**
 * Chat composer context — unified contract
 *
 * Composer-only, Home, and active-chat providers all populate
 * the SAME `ChatComposerContextValue` shape. Consumers read one
 * `useChatComposer()` hook and never branch on which provider is in scope —
 * the runtime branch collapses to the two provider constructors.
 *
 * - **`<ChatComposerProvider>`** — composer-only (marketing CTA, library
 *   empty state). Cookie-only model/kernel; `status: 'ready'`; `stop` is a
 *   no-op; `contextUsage` and `session` are `undefined`. Owns a throwaway
 *   draft actor with no-op persistence.
 *
 * - **`<ActiveChatProvider chatId>`** — session-backed (project route).
 *   Chat-row-preferred model/kernel with cookie fallback and dual-write on
 *   set; live `status` from the AI SDK `Chat`; `stop` dispatches
 *   `stopRequest`; `contextUsage` is the most-recent `data-context-usage`
 *   part on any message; `session` carries the live triple.
 *
 * `useActiveChatSession()` remains the strict entry point for genuine
 * session consumers (`useCadChatClient`, `CaptureViewControl`) — it throws
 * when no session is mounted. Composer consumers should read the unified
 * context instead.
 *
 * Architectural rationale: see
 * [`docs/research/chat-composer-context-unification.md`](docs/research/chat-composer-context-unification.md).
 */

import { useActorRef, useSelector } from '@xstate/react';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Chat } from '@ai-sdk/react';
import { waitFor } from 'xstate';
import type { ActorRefFrom } from 'xstate';
import { isAnyToolPart } from '@taucad/chat';
import type { CadAgentExecution, ContextUsageData, MyUIMessage } from '@taucad/chat';
import type { KernelEntry, KernelId } from '@taucad/types/constants';
import { isKernelId, resolveKernel } from '@taucad/types/constants';
import { isKernelAvailable } from '#constants/available-kernel-configurations.js';
import { fromSafeAsync } from '#lib/xstate.lib.js';
import { draftMachine } from '#hooks/draft.machine.js';
import { resizeImageActor } from '#hooks/resize-image.actor.js';
import { useDraftImageErrorToast } from '#hooks/use-draft-image-error-toast.js';
import { inspect } from '#machines/inspector.js';
import { useChatSession, useChatSessionSnapshot } from '#hooks/use-chat-session.js';
import type { ChatSession } from '#services/chat-session-store.js';
import type { chatPersistenceMachine } from '#hooks/chat-persistence.machine.js';
import { useModels } from '#hooks/use-models.js';
import type { ResolvedModel } from '#hooks/use-models.js';
import { useKernel } from '#hooks/use-kernel.js';
import { withTauExecutionModel } from '#utils/chat-execution.js';
import { useFileManager } from '#hooks/use-file-manager.js';
import { createNewProjectComposerFileStore } from '#db/new-project-composer-file-storage.js';
import type { NewProjectComposerRecord } from '#db/new-project-composer-file-storage.js';
import { toast } from '#components/ui/sonner.js';

type ChatInstance = Chat<MyUIMessage>;

// ---------------------------------------------------------------------------
// Public contract
// ---------------------------------------------------------------------------

/**
 * Resolved chat-scoped model state. Mirrors the shape that the session and
 * composer providers each populate from their own strategy (chat-row +
 * cookie dual-write vs cookie-only).
 */
export type ActiveChatModel = {
  /**
   * Chat-scoped active model id. Under the session provider this prefers
   * the model within `Chat.activeExecution`, falling back to the cookie default. Under the
   * composer provider this is the cookie default.
   */
  modelId: string;
  /** Display-resolved view of {@link ActiveChatModel.modelId}. */
  model: ResolvedModel;
  /**
   * Patch the active model. The session provider dual-writes (chat row +
   * cookie) per decision C in `chat-active-model-kernel-persistence.md`;
   * the composer provider writes the cookie only.
   */
  setActiveModel: (modelId: string) => void;
};

/** Durable execution target for the active chat. */
export type ActiveChatExecution = {
  execution: CadAgentExecution;
  setActiveExecution: (execution: CadAgentExecution) => void;
};

export type ChatAgentActivity = 'ready' | 'working' | 'approval-required' | 'stopping';

/**
 * Resolved chat-scoped CAD kernel state. Same dual-strategy shape as
 * {@link ActiveChatModel}. `kernel` is non-nullable because every
 * boundary that produces `kernelId` is guarded by `isKernelId` (cookie
 * read in `useKernel`, chat-row hydration in `useSessionKernel`) before
 * the resolver runs.
 */
export type ActiveChatKernel = {
  kernelId: KernelId;
  kernel: KernelEntry;
  setActiveKernel: (kernelId: KernelId) => void;
};

/**
 * Live session triple. Exposed via `ChatComposerContextValue.session` so
 * genuine session consumers can opt into the strict shape; composer
 * consumers leave it untouched.
 */
export type ActiveChatSessionContextValue = {
  activeChatId: string;
  chat: Chat<MyUIMessage>;
  persistenceActorRef: ActorRefFrom<typeof chatPersistenceMachine>;
  draftActorRef: ActorRefFrom<typeof draftMachine>;
};

/**
 * Unified composer contract. Both providers populate every field — no
 * "optional" branches at consumer call sites.
 */
export type ChatComposerContextValue = {
  /**
   * Draft actor (text/images/mode/tool selection). Backed by no-op
   * persistence under the composer provider; backed by chat-row
   * persistence under the session provider.
   */
  draftActorRef: ActorRefFrom<typeof draftMachine>;
  /** Chat-scoped model resolver (composer-cookie vs session dual-write). */
  model: ActiveChatModel;
  /** Chat-scoped execution target. */
  execution: ActiveChatExecution;
  /** Chat-scoped kernel resolver (composer-cookie vs session dual-write). */
  kernel: ActiveChatKernel;
  /**
   * Live chat status. `'ready'` under the composer provider (no session to
   * stream); reflects the AI SDK `Chat.status` under the session provider.
   */
  status: ChatInstance['status'];
  /** User-facing activity for the selected execution target. */
  agentActivity: ChatAgentActivity;
  /**
   * Cancel-in-flight callback. No-op under the composer provider;
   * dispatches `stopRequest` to the persistence machine under the session
   * provider.
   */
  stop: () => void;
  /**
   * Most-recent `data-context-usage` part across the chat's messages, or
   * `undefined` when no usage data has streamed. Always `undefined` under
   * the composer provider (no messages exist).
   */
  contextUsage: ContextUsageData | undefined;
  /**
   * Live session triple when mounted under `<ActiveChatProvider>`,
   * otherwise `undefined`. Reserved for genuine session consumers; the
   * composer surface should leave this untouched.
   */
  session: ActiveChatSessionContextValue | undefined;
  /** Whether this surface offers execution placement selection. */
  canSelectExecution: boolean;
  /** Consume the current draft at its persistence owner. */
  consumeDraft: () => Promise<void>;
};

const ChatComposerContext = createContext<ChatComposerContextValue | undefined>(undefined);
const ActiveChatSessionContext = createContext<ActiveChatSessionContextValue | undefined>(undefined);

// ---------------------------------------------------------------------------
// Composer-only draft actor wiring
// ---------------------------------------------------------------------------

const noopPersistDraftActor = fromSafeAsync<void, { draft: MyUIMessage }>(async () => undefined);
const noopPersistEditDraftActor = fromSafeAsync<void, { messageId: string; draft: MyUIMessage }>(async () => undefined);
const noopClearMessageEditActor = fromSafeAsync<void, { messageId: string }>(async () => undefined);

const composerDraftMachine = draftMachine.provide({
  actors: {
    persistDraftActor: noopPersistDraftActor,
    persistEditDraftActor: noopPersistEditDraftActor,
    clearMessageEditActor: noopClearMessageEditActor,
    resizeImageActor,
  },
});

// Stable no-op so the `stop` callback identity does not change across
// composer-provider renders — consumers can safely include it in dep
// arrays without forcing rerenders.
const noopStop = (): void => undefined;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

/**
 * Composer-only provider. Populates the unified contract with cookie-backed
 * model/kernel resolvers, a throwaway draft actor, and no-session sentinel
 * values for `status`/`stop`/`contextUsage`/`session`.
 */
export function ChatComposerProvider({ children }: { readonly children: React.ReactNode }): React.JSX.Element {
  const draftActorRef = useActorRef(composerDraftMachine, { input: {}, inspect });

  useDraftImageErrorToast(draftActorRef);

  const model = useCookieModel();
  const execution = useCookieExecution(model);
  const kernel = useCookieKernel();
  const consumeDraft = useConsumeDraft(draftActorRef);

  const value = useMemo<ChatComposerContextValue>(
    () => ({
      draftActorRef,
      model,
      execution,
      kernel,
      status: 'ready',
      agentActivity: 'ready',
      stop: noopStop,
      contextUsage: undefined,
      session: undefined,
      canSelectExecution: false,
      consumeDraft,
    }),
    [draftActorRef, model, execution, kernel, consumeDraft],
  );

  return <ChatComposerContext.Provider value={value}>{children}</ChatComposerContext.Provider>;
}

type HomeInitialization =
  | { readonly status: 'loading' }
  | { readonly status: 'ready' | 'degraded'; readonly record: NewProjectComposerRecord };

/** Home-workspace provider for the durable pre-project composer. */
export function HomeNewProjectComposerProvider({
  children,
  fallback = null,
}: {
  readonly children: React.ReactNode;
  readonly fallback?: React.ReactNode;
}): React.ReactNode {
  const { client } = useFileManager();
  const store = useMemo(() => createNewProjectComposerFileStore(client), [client]);
  const [initialization, setInitialization] = useState<HomeInitialization>({ status: 'loading' });
  const reportedFailure = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async (): Promise<void> => {
      try {
        const result = await store.read();
        if (cancelled) {
          return;
        }
        if (result.status === 'invalid') {
          if (!reportedFailure.current) {
            reportedFailure.current = true;
            console.error('Invalid Home new-project composer record:', result.error);
            toast.error('Failed to restore the new-project draft');
          }
          setInitialization({ status: 'degraded', record: { version: 1 } });
          return;
        }
        setInitialization({
          status: 'ready',
          record: result.status === 'valid' ? result.record : { version: 1 },
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!reportedFailure.current) {
          reportedFailure.current = true;
          console.error('Failed to read Home new-project composer record:', error);
          toast.error('Failed to restore the new-project draft');
        }
        setInitialization({ status: 'degraded', record: { version: 1 } });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (initialization.status === 'loading') {
    return fallback;
  }
  return (
    <HomeNewProjectComposerReadyProvider store={store} record={initialization.record}>
      {children}
    </HomeNewProjectComposerReadyProvider>
  );
}

type HomeComposerStore = ReturnType<typeof createNewProjectComposerFileStore>;

function HomeNewProjectComposerReadyProvider({
  children,
  record,
  store,
}: {
  readonly children: React.ReactNode;
  readonly record: NewProjectComposerRecord;
  readonly store: HomeComposerStore;
}): React.JSX.Element {
  const reportWriteFailure = useCallback((error: unknown): void => {
    console.error('Failed to persist Home new-project composer record:', error);
    toast.error('Failed to save the new-project draft', {
      id: 'home-new-project-composer-save-error',
    });
  }, []);
  const homeDraftMachine = useMemo(
    () =>
      draftMachine.provide({
        actors: {
          persistDraftActor: fromSafeAsync<void, { draft: MyUIMessage }>(async ({ input }) => {
            try {
              await store.patchDraft(input.draft);
            } catch (error) {
              reportWriteFailure(error);
            }
          }),
          persistEditDraftActor: noopPersistEditDraftActor,
          clearMessageEditActor: noopClearMessageEditActor,
          resizeImageActor,
        },
      }),
    [reportWriteFailure, store],
  );
  const draftActorRef = useActorRef(homeDraftMachine, { input: { initialDraft: record.draft }, inspect });
  useDraftImageErrorToast(draftActorRef);

  const execution = useHomeExecution(record.execution, store, reportWriteFailure);
  const model = useExecutionModel(execution);
  const kernel = useCookieKernel();
  const consumeDraft = useConsumeDraft(draftActorRef);
  const value = useMemo<ChatComposerContextValue>(
    () => ({
      draftActorRef,
      model,
      execution,
      kernel,
      status: 'ready',
      agentActivity: 'ready',
      stop: noopStop,
      contextUsage: undefined,
      session: undefined,
      canSelectExecution: true,
      consumeDraft,
    }),
    [consumeDraft, draftActorRef, execution, kernel, model],
  );
  return <ChatComposerContext.Provider value={value}>{children}</ChatComposerContext.Provider>;
}

/**
 * Session-backed provider. Acquires the live `ChatSession` for `chatId`
 * from the app-shell `ChatSessionStore`, then populates the unified
 * composer contract from chat-row + cookie sources. Mounting this provider
 * implies a session must be acquirable; consumers below it can call
 * {@link useActiveChatSession} freely.
 */
export function ActiveChatProvider({
  children,
  chatId,
}: {
  readonly children: React.ReactNode;
  readonly chatId: string;
}): React.JSX.Element {
  const session = useChatSession(chatId);

  // Single global toast site for image-resize failures across the chat
  // surface. Mounted at the provider so the 12 image entry points never
  // need their own try/catch around the resize step. See
  // `useDraftImageErrorToast` JSDoc.
  useDraftImageErrorToast(session.draftActorRef);

  const execution = useSessionExecution(session);
  const model = useExecutionModel(execution);
  const kernel = useSessionKernel(session);
  const status = useSessionStatus(chatId);
  const agentActivity = useSessionAgentActivity(session, chatId, status);
  const stop = useSessionStop(session);
  const contextUsage = useSessionContextUsage(chatId);
  const consumeDraft = useConsumeDraft(session.draftActorRef);

  const sessionValue = useMemo<ActiveChatSessionContextValue>(
    () => ({
      activeChatId: chatId,
      chat: session.chat,
      persistenceActorRef: session.persistenceActorRef,
      draftActorRef: session.draftActorRef,
    }),
    [chatId, session.chat, session.persistenceActorRef, session.draftActorRef],
  );

  const composerValue = useMemo<ChatComposerContextValue>(
    () => ({
      draftActorRef: session.draftActorRef,
      model,
      execution,
      kernel,
      status,
      agentActivity,
      stop,
      contextUsage,
      session: sessionValue,
      canSelectExecution: true,
      consumeDraft,
    }),
    [
      session.draftActorRef,
      model,
      execution,
      kernel,
      status,
      agentActivity,
      stop,
      contextUsage,
      sessionValue,
      consumeDraft,
    ],
  );

  return (
    <ChatComposerContext.Provider value={composerValue}>
      <ActiveChatSessionContext.Provider value={sessionValue}>{children}</ActiveChatSessionContext.Provider>
    </ChatComposerContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Consumer hooks
// ---------------------------------------------------------------------------

/**
 * Read the unified composer contract. Works under either provider —
 * `model`/`kernel`/`status`/`stop`/`contextUsage`/`session` are populated by
 * the provider itself, so consumers never branch on provider identity.
 *
 * @throws when used outside both providers.
 */
export function useChatComposer(): ChatComposerContextValue {
  const context = useContext(ChatComposerContext);
  if (!context) {
    throw new Error('useChatComposer must be used within <ChatComposerProvider> or <ActiveChatProvider>');
  }
  return context;
}

/**
 * Read the strict session triple. Use for genuine session consumers
 * (`useCadChatClient`, `CaptureViewControl`) that need the `chat` /
 * `persistenceActorRef` directly. Composer consumers should call
 * {@link useChatComposer} instead — the unified context already exposes
 * `session` as a field for the rare opt-in.
 *
 * @throws when used outside `<ActiveChatProvider>`.
 */
export function useActiveChatSession(): ActiveChatSessionContextValue {
  const context = useContext(ActiveChatSessionContext);
  if (!context) {
    throw new Error('useActiveChatSession must be used within <ActiveChatProvider>');
  }
  return context;
}

// ---------------------------------------------------------------------------
// Strategy helpers — composer-only branch
// ---------------------------------------------------------------------------

/**
 * Cookie-only model resolver. Used by `<ChatComposerProvider>` to populate
 * `ChatComposerContextValue.model` without a chat session in scope. Setters
 * write only to the cookie default — there is no chat row to patch.
 */
function useCookieModel(): ActiveChatModel {
  const { selectedModelId, selectedModel, setSelectedModelId } = useModels();
  const setActiveModel = useCallback(
    (next: string) => {
      setSelectedModelId(next);
    },
    [setSelectedModelId],
  );
  return useMemo<ActiveChatModel>(
    () => ({ modelId: selectedModelId, model: selectedModel, setActiveModel }),
    [selectedModelId, selectedModel, setActiveModel],
  );
}

/**
 * Cookie-only execution resolver for ephemeral composer surfaces. Those
 * surfaces do not offer execution selection, so the cookie model and browser
 * host are the complete contract.
 */
function useCookieExecution(model: ActiveChatModel): ActiveChatExecution {
  const execution = useMemo<CadAgentExecution>(() => ({ kind: 'tau', model: model.modelId }), [model.modelId]);
  const setActiveExecution = useCallback(
    (next: CadAgentExecution) => {
      if (next.kind === 'tau') {
        model.setActiveModel(next.model);
      }
    },
    [model],
  );
  return useMemo(() => ({ execution, setActiveExecution }), [execution, setActiveExecution]);
}

/**
 * Cookie-only kernel resolver. Same role as {@link useCookieModel} for the
 * CAD kernel. The cookie boundary is already healed by `useKernel` itself,
 * so the resolved `kernel` is a definite `KernelConfiguration`.
 */
function useCookieKernel(): ActiveChatKernel {
  const { kernel: cookieKernel, setKernel: setCookieKernel, selectedKernel: kernel } = useKernel();
  const setActiveKernel = useCallback(
    (next: KernelId) => {
      setCookieKernel(next);
    },
    [setCookieKernel],
  );
  return useMemo<ActiveChatKernel>(
    () => ({ kernelId: cookieKernel, kernel, setActiveKernel }),
    [cookieKernel, kernel, setActiveKernel],
  );
}

// ---------------------------------------------------------------------------
// Strategy helpers — session-backed branch
// ---------------------------------------------------------------------------

/**
 * Session-backed model resolver. Prefers the Tau model in `Chat.activeExecution` from the
 * persistence machine; falls back to the cookie default. `setActiveModel`
 * dual-writes (cookie + chat row) so reload preserves the chat-local
 * value and future new chats inherit the most recent choice.
 *
 * Mirrors the contract of the previous `useActiveChatModel` hook (now
 * deleted) but is provider-internal: external consumers read
 * `useChatComposer().model` instead.
 */
function useExecutionModel(activeExecution: ActiveChatExecution): ActiveChatModel {
  const { selectedModelId, selectedModel, resolveModel } = useModels();
  const modelId = activeExecution.execution.kind === 'tau' ? activeExecution.execution.model : selectedModelId;
  const model = useMemo<ResolvedModel>(
    () => (modelId === selectedModelId ? selectedModel : resolveModel(modelId)),
    [modelId, selectedModel, selectedModelId, resolveModel],
  );
  const setActiveModel = useCallback(
    (next: string) => {
      activeExecution.setActiveExecution(withTauExecutionModel(activeExecution.execution, next));
    },
    [activeExecution],
  );
  return useMemo<ActiveChatModel>(() => ({ modelId, model, setActiveModel }), [modelId, model, setActiveModel]);
}

function useHomeExecution(
  initial: CadAgentExecution | undefined,
  store: HomeComposerStore,
  reportWriteFailure: (error: unknown) => void,
): ActiveChatExecution {
  const { selectedModelId, setSelectedModelId } = useModels();
  const [execution, setExecution] = useState<CadAgentExecution>(initial ?? { kind: 'tau', model: selectedModelId });
  const setActiveExecution = useCallback(
    (next: CadAgentExecution) => {
      setExecution(next);
      if (next.kind === 'tau') {
        setSelectedModelId(next.model);
      }
      const persist = async (): Promise<void> => {
        try {
          await store.patchExecution(next);
        } catch (error) {
          reportWriteFailure(error);
        }
      };
      void persist();
    },
    [reportWriteFailure, setSelectedModelId, store],
  );
  return useMemo(() => ({ execution, setActiveExecution }), [execution, setActiveExecution]);
}

function useConsumeDraft(draftActorRef: ActorRefFrom<typeof draftMachine>): () => Promise<void> {
  return useCallback(async () => {
    draftActorRef.send({ type: 'clearDraft' });
    await waitFor(draftActorRef, (snapshot) => snapshot.matches({ inputSaving: 'idle' }));
  }, [draftActorRef]);
}

function useSessionExecution(session: ChatSession): ActiveChatExecution {
  const persisted = useSelector(session.persistenceActorRef, (state) => state.context.activeExecution);
  const { selectedModelId, setSelectedModelId } = useModels();
  const execution = useMemo<CadAgentExecution>(
    () => persisted ?? { kind: 'tau', model: selectedModelId },
    [persisted, selectedModelId],
  );
  const setActiveExecution = useCallback(
    (next: CadAgentExecution) => {
      if (next.kind === 'tau') {
        setSelectedModelId(next.model);
      }
      session.persistenceActorRef.send({ type: 'setActiveExecution', execution: next });
    },
    [session.persistenceActorRef, setSelectedModelId],
  );
  return useMemo(() => ({ execution, setActiveExecution }), [execution, setActiveExecution]);
}

/**
 * Session-backed kernel resolver. Same shape as {@link useSessionModel}.
 * The chat-row id is re-validated via {@link isKernelId} so a stale id
 * (e.g. a kernel that was retired from `kernelConfigurations` after the
 * row was persisted) heals to the cookie default instead of resurrecting
 * into the UI.
 */
function useSessionKernel(session: ChatSession): ActiveChatKernel {
  const chatActiveKernel = useSelector(session.persistenceActorRef, (state) => state.context.activeKernel);
  const { kernel: cookieKernel, setKernel: setCookieKernel } = useKernel();
  const sessionKernel =
    isKernelId(chatActiveKernel) && isKernelAvailable(chatActiveKernel) ? chatActiveKernel : undefined;
  const kernelId: KernelId = sessionKernel ?? cookieKernel;
  const kernel = resolveKernel(kernelId);
  const setActiveKernel = useCallback(
    (next: KernelId) => {
      setCookieKernel(next);
      session.persistenceActorRef.send({ type: 'setActiveKernel', kernel: next });
    },
    [session.persistenceActorRef, setCookieKernel],
  );
  return useMemo<ActiveChatKernel>(() => ({ kernelId, kernel, setActiveKernel }), [kernelId, kernel, setActiveKernel]);
}

/**
 * Live `chat.status` snapshot. Returns `'ready'` while the session is
 * mounting (and as a constant under the composer provider, which does
 * not call this helper).
 */
function useSessionStatus(chatId: string): ChatInstance['status'] {
  return useChatSessionSnapshot(chatId, (s) => s?.chat.status ?? 'ready');
}

function useSessionAgentActivity(
  session: ChatSession,
  chatId: string,
  status: ChatInstance['status'],
): ChatAgentActivity {
  const approvalRequired = useChatSessionSnapshot(chatId, (snapshot) =>
    snapshot?.chat.messages.some((message) =>
      message.parts.some((part) => isAnyToolPart(part) && part.state === 'approval-requested'),
    ),
  );
  const stopping = useSelector(session.persistenceActorRef, (snapshot) =>
    snapshot.matches({ requestLifecycle: 'stopping' }),
  );
  if (approvalRequired) {
    return 'approval-required';
  }
  if (stopping) {
    return 'stopping';
  }
  return status === 'submitted' || status === 'streaming' ? 'working' : 'ready';
}

/**
 * Stable `stop()` callback that dispatches `stopRequest` to the
 * persistence machine for the active session.
 */
function useSessionStop(session: ChatSession): () => void {
  return useCallback(() => {
    session.persistenceActorRef.send({ type: 'stopRequest' });
  }, [session.persistenceActorRef]);
}

/**
 * Most-recent `data-context-usage` part across the chat's messages, or
 * `undefined` when no usage data has streamed yet. The reverse scan keeps
 * the lookup O(latest-message-parts) for the common case where the
 * indicator updates after each assistant turn.
 */
function useSessionContextUsage(chatId: string): ContextUsageData | undefined {
  return useChatSessionSnapshot(chatId, (s) => {
    if (!s) {
      return undefined;
    }
    const { messages } = s.chat;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i]!;
      for (let j = message.parts.length - 1; j >= 0; j--) {
        const part = message.parts[j]!;
        if (part.type === 'data-context-usage') {
          return part.data;
        }
      }
    }
    return undefined;
  });
}
