import { useCallback, useEffect, useRef } from 'react';
import type { ChatStatus } from 'ai';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';
import { toast } from 'sonner';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { attachmentSendBlockReason, buildUserMessage } from '#utils/chat.utils.js';
import type { StoredAttachmentRef } from '#utils/attachment.utils.js';
import {
  getBrowserAgentHostRun,
  resolveBrowserAgentHostInterrupt,
  resumableBrowserAgentHostRunId,
} from '#chat-clients/_internal/browser-agent-host-transport.js';
import { daemonPlacementOf } from '#lib/agent-host-placement.js';
import { useModels } from '#hooks/use-models.js';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';

/**
 * Input payload for {@link CadChatClient.submit}. Mirrors the surface the
 * `ChatTextarea`'s `onSubmit` hands the client — a string `text` plus the
 * draft's stored attachments. All other request configuration
 * (model, kernel, mode, toolChoice, testingEnabled, snapshot, contextPayload)
 * is composed *inside* the client from `useCadAgentConfig`.
 *
 * @public
 */
export type CadChatSubmitInput = {
  readonly text: string;
  /** The draft's attachments, stored beside its record; the client promotes them before sending (D18). */
  readonly attachments?: readonly StoredAttachmentRef[];
};

/**
 * Public surface of the CAD chat client. Every UI assembly site reaches the
 * `/v1/chat` wire through one of these verbs — never through the raw
 * `Chat.sendMessage` / `Chat.regenerate` API or a hand-built `body: { ... }`
 * literal. This is the indirection that stops the previously-broken
 * kernel / testingEnabled / model fields from sprawling across N call sites
 * (the original symptom behind the chat-metadata-first-class-architecture
 * refactor).
 *
 * The verbs route their requests through the **persistence machine** (via
 * `useChatActions().sendMessage`) so the entire request lifecycle —
 * milestone persists, tool-state cleanup on abort / disconnect, auto-retry
 * on transport disconnects, status emit on `streaming` — remains owned by
 * the existing `chatPersistenceMachine`. The chat client's only addition
 * is the per-request `body: { agent }` payload it threads onto each
 * dispatch (see `dispatchRequest` in `chat-session-store.ts`).
 *
 * @public
 */
export type CadChatClient = {
  /**
   * Send a fresh user message. Builds `{ body: { agent } }` from the live agent config.
   *
   * Settles once the message is handed to the chat or the dispatch failed, so
   * the composer can stay busy through attachment copy and workspace admission
   * (chat activity indicator closeout R8). It never rejects; failures surface
   * on the chat's error banner or a toast.
   */
  submit: (input: CadChatSubmitInput) => Promise<void>;
  /**
   * Replace the targeted user message's text/image parts and regenerate the
   * assistant turn from there. The wire body's `agent` block is composed
   * from the live `useCadAgentConfig` snapshot — never from the historical
   * user-message metadata (which is preserved verbatim for display badges).
   */
  edit: (messageId: string, input: CadChatSubmitInput) => void;
  /** Abort the in-flight request, if any. */
  stop: () => void;
  /**
   * Approve or deny a durable external-tool interrupt and resume it with the current agent config.
   *
   * `optionId` is the exact choice a request that offered a list was answered
   * with; without it the host re-derives one from `approved`, which substitutes
   * its guess for the human's decision (V6).
   */
  respondToToolApproval: (
    approvalId: string,
    approved: boolean,
    decision?: { readonly reason?: string | undefined; readonly optionId?: string | undefined },
  ) => Promise<void>;
  /** Live message list from the bound `Chat` instance. */
  messages: readonly MyUIMessage[];
  /** Live status from the bound `Chat` instance. */
  status: ChatStatus;
  /** Live error from the bound `Chat` instance. */
  error: Error | undefined;
  /**
   * Snapshot of the agent config the client will send on its next call.
   * Exposed for test/regression scope and the chat-session-store dispatch
   * adapter (R10/t17) — production UI sites should not read this directly.
   */
  agent: CadAgentConfigInput;
};

/** Stable, so a retried send replaces its toast instead of stacking another. */
const promotionToastId = 'chat-attachment-promotion';

/**
 * Profile-scoped chat client for the CAD agent.
 *
 * Composes:
 * - {@link useCadAgentConfig} — the assembler hook that builds the per-turn
 *   `agent` payload from the current UI producer hooks.
 * - {@link useActiveChatInstance} — the module-private accessor for the live
 *   AI SDK `Chat` instance owned by the chat-session store. Exposed via the
 *   client's `messages`/`status`/`error` reads.
 * - {@link useChatActions} — the persistence-machine entry point. Verbs go
 *   through here so the machine still owns lifecycle / cleanup / retry.
 *
 * Exposes profile-aware verbs (`submit`, `edit`, `stop`) that thread
 * `body: { agent }` onto every wire call. Verb identities are
 * stable across renders as long as the underlying actions and agent identity
 * don't change.
 *
 * @public
 */
export const useCadChatClient = (): CadChatClient => {
  const chat = useActiveChatInstance();
  const actions = useChatActions();
  const agent = useCadAgentConfig();
  const status = useChatSelector((state) => state.status);
  // The CAD chat client is session-required by construction (it composes
  // `useActiveChatInstance` / `useChatActions`), so `activeChatId` is a
  // guaranteed `string` from the strict session context — no optional
  // branching needed.
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();
  const { resolveModel } = useModels();
  /* This hook is a *view*: it composes gestures and reads the live chat. The
   * chat's agent-host binding and its admission belong to `ChatTurnHost`, which
   * is mounted once — owning either here made every transcript message a writer
   * of a fact the chat can only have one of. */
  const { surfaceDispatchFailure } = useTurnAdmission(agent.execution);
  // Always the current resolver: a dispatch composed before `GET /v1/models`
  // answers must read the catalog row that arrives *while* it waits, not the
  // unresolved one its render closed over.
  const resolveModelRef = useRef(resolveModel);
  useEffect(() => {
    resolveModelRef.current = resolveModel;
  }, [resolveModel]);
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  /**
   * Refuse a draft the turn's model cannot read (D20), and copy the rest into
   * the chat's directory before anything is admitted (D18). Admission first
   * would leave a claim admitted for a turn that never sends. A failed copy
   * leaves the draft as it is and sends nothing.
   */
  const withAttachments = useCallback(
    async (attachments: readonly StoredAttachmentRef[], send: () => void | Promise<void>): Promise<void> => {
      if (agent.execution.kind === 'tau' && attachments.length > 0) {
        const resolved = resolveModelRef.current(agent.execution.model);
        const blocked = attachmentSendBlockReason(attachments, {
          name: resolved.name,
          support: resolved.model?.support,
        });
        if (blocked !== undefined) {
          surfaceDispatchFailure(new Error(blocked));
          return;
        }
      }
      if (attachments.length > 0) {
        try {
          await store.promoteDraftAttachments(activeChatId, attachments);
        } catch (error) {
          console.error('[useCadChatClient] attachment promotion failed', error);
          toast.error("Your attachments couldn't be saved to this chat, so the message wasn't sent.", {
            id: promotionToastId,
          });
          return;
        }
      }
      await send();
    },
    [activeChatId, agent.execution, store, surfaceDispatchFailure],
  );

  const submit = useCallback(
    async (input: CadChatSubmitInput): Promise<void> => {
      const userMessage = buildUserMessage(input);
      await withAttachments(input.attachments ?? [], async () =>
        actions.sendMessage(userMessage, input.attachments === undefined ? {} : { attachments: input.attachments }),
      );
    },
    [actions, withAttachments],
  );

  const edit = useCallback(
    (messageId: string, input: CadChatSubmitInput) => {
      // async-iife: bootstrap — the edit composer closes at once; failures surface on the banner or a toast.
      void withAttachments(input.attachments ?? [], () => {
        actions.editMessage(
          messageId,
          input.text,
          input.attachments === undefined ? {} : { attachments: input.attachments },
        );
      });
    },
    [actions, withAttachments],
  );

  const stop = useCallback(() => {
    actions.stop();
  }, [actions]);

  const respondToToolApproval = useCallback(
    async (
      approvalId: string,
      approved: boolean,
      decision?: { readonly reason?: string | undefined; readonly optionId?: string | undefined },
    ): Promise<void> => {
      const { reason, optionId } = decision ?? {};
      const browserRun = getBrowserAgentHostRun(activeChatId);
      /* A daemon-placed chat whose paused run no stream of this page follows is answered all the same, and the page
       * then follows what the answer continued or ended (GM.r1 H1). */
      const detachedRunId =
        browserRun === undefined && daemonPlacementOf(agent.execution) !== undefined
          ? resumableBrowserAgentHostRunId(activeChatId)
          : undefined;
      const answeredRunId = browserRun?.runId ?? detachedRunId;
      if (answeredRunId !== undefined) {
        await resolveBrowserAgentHostInterrupt({
          chatId: activeChatId,
          runId: answeredRunId,
          interruptId: approvalId,
          approved,
          reason,
          optionId,
        });
        if (detachedRunId !== undefined) {
          void chat.resumeStream();
        }
      }
      /* An approval without a current host run is stale. It cannot create a
       * run through the SDK: only a host command may answer its interrupt. */
    },
    [activeChatId, agent.execution, chat],
  );

  return {
    submit,
    edit,
    stop,
    respondToToolApproval,
    messages,
    status,
    error: chat.error,
    agent,
  };
};
