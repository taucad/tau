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
import { useModels } from '#hooks/use-models.js';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';

/**
 * Input payload for {@link CadChatClient.submit}. Mirrors the surface the
 * `ChatTextarea`'s `onSubmit` hands the client — a string `text` plus the
 * draft's stored attachments. `ChatTurnHost` composes the durable host command
 * from the selected agent and its current project context.
 *
 * @public
 */
export type CadChatSubmitInput = {
  readonly text: string;
  /** The draft's attachments, stored beside its record; the client promotes them before sending (D18). */
  readonly attachments?: readonly StoredAttachmentRef[];
};

/**
 * Public surface of the CAD chat client. UI assembly sites express gestures
 * through these verbs, never a raw SDK request or hand-built host command.
 *
 * `ChatSessionStore` turns each gesture into one command id and a projection
 * watch. The persistence machine retains only chat record/error/composer state;
 * the host log owns run lifecycle, transcript and settlement.
 *
 * @public
 */
export type CadChatClient = {
  /**
   * Send a fresh user message through the chat's admission and command path.
   *
   * Settles once the message is handed to the chat or the dispatch failed, so
   * the composer can stay busy through attachment copy and workspace admission
   * (chat activity indicator closeout R8). It never rejects; failures surface
   * on the chat's error banner or a toast.
   */
  submit: (input: CadChatSubmitInput) => Promise<void>;
  /**
   * Replace the targeted user message's text/image parts and regenerate the
   * assistant turn from there. Admission uses the live agent config, never
   * historical user-message metadata (which is retained for display).
   */
  edit: (messageId: string, input: CadChatSubmitInput) => void;
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
  /**
   * Hand the running Tau turn a message it reads before its next step; otherwise send it as a new message.
   *
   * A send during an external agent's live turn queues behind that turn.
   */
  steerOrSubmit: (text: string) => Promise<void>;
  /** Live message list from the bound `Chat` instance. */
  messages: readonly MyUIMessage[];
  /** Live status from the bound `Chat` instance. */
  status: ChatStatus;
  /** Live error from the bound `Chat` instance. */
  error: Error | undefined;
  /**
   * Snapshot of the agent config the next turn's admission will use.
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
 * - {@link useChatActions} — the gesture entry point into the session store.
 *
 * Exposes profile-aware verbs (`submit`, `edit`). Verb identities are
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

  const respondToToolApproval = useCallback(
    async (
      approvalId: string,
      approved: boolean,
      decision?: { readonly reason?: string | undefined; readonly optionId?: string | undefined },
    ): Promise<void> => {
      const { reason, optionId } = decision ?? {};
      await store.respondToProjectedApproval(activeChatId, approvalId, { approved, reason, optionId });
    },
    [activeChatId, store],
  );

  const steerOrSubmit = useCallback(
    async (text: string): Promise<void> => {
      if (!(await store.steerProjectedRun(activeChatId, text))) {
        await submit({ text });
      }
    },
    [activeChatId, store, submit],
  );

  return {
    submit,
    edit,
    respondToToolApproval,
    steerOrSubmit,
    messages,
    status,
    error: chat.error,
    agent,
  };
};
