import { useCallback, useEffect, useMemo } from 'react';
import type { ChatStatus } from 'ai';
import type { CadAgentConfigInput, MyUIMessage } from '@taucad/chat';
import { generatePrefixedId } from '@taucad/utils/id';
import { idPrefix } from '@taucad/types/constants';
import { messageRole, messageStatus } from '@taucad/chat/constants';
import { useCadAgentConfig } from '#hooks/use-cad-agent-config.js';
import { useActiveChatInstance } from '#chat-clients/_internal/use-active-chat-instance.js';
import { useChatActions, useChatSelector } from '#hooks/use-chat.js';
import { useActiveChatSession } from '#hooks/active-chat-provider.js';
import { useChatSessionStore } from '#hooks/chat-session-store-provider.js';
import { extractMimeTypeFromDataUrl } from '#utils/chat.utils.js';

/**
 * Input payload for {@link CadChatClient.submit}. Mirrors the surface the
 * `ChatTextarea`'s `onSubmit` hands the client — a string `text` plus an
 * optional list of image-url attachments. All other request configuration
 * (model, kernel, mode, toolChoice, testingEnabled, snapshot, contextPayload)
 * is composed *inside* the client from `useCadAgentConfig`.
 *
 * @public
 */
export type CadChatSubmitInput = {
  readonly text: string;
  readonly imageUrls?: readonly string[];
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
  /** Send a fresh user message. Builds `{ body: { agent } }` from the live agent config. */
  submit: (input: CadChatSubmitInput) => void;
  /**
   * Replace the targeted user message's text/image parts and regenerate the
   * assistant turn from there. The wire body's `agent` block is composed
   * from the live `useCadAgentConfig` snapshot — never from the historical
   * user-message metadata (which is preserved verbatim for display badges).
   */
  edit: (messageId: string, input: CadChatSubmitInput) => void;
  /** Re-run the assistant turn after a specific user message id (used by message-edit / regen-on-N flows). */
  retry: (messageId: string, modelId?: string) => void;
  /** Re-run the latest assistant turn (used by pending-tail hydration + Fix-with-AI in-place). */
  regenerateTail: () => void;
  /** Abort the in-flight request, if any. */
  stop: () => void;
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

const buildUserMessage = (input: CadChatSubmitInput): MyUIMessage => {
  const trimmed = input.text.trim();
  const imageUrls = input.imageUrls ?? [];
  const fileParts: MyUIMessage['parts'] = imageUrls.map((url) => ({
    type: 'file',
    url,
    mediaType: extractMimeTypeFromDataUrl(url),
  }));
  const textParts: MyUIMessage['parts'] = trimmed.length > 0 ? [{ type: 'text', text: trimmed }] : [];
  const parts: MyUIMessage['parts'] = [...fileParts, ...textParts];
  return {
    id: generatePrefixedId(idPrefix.message),
    role: messageRole.user,
    parts,
    metadata: {
      status: messageStatus.pending,
      createdAt: Date.now(),
    },
  };
};

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
 * Exposes profile-aware verbs (`submit`, `retry`, `regenerateTail`, `stop`)
 * that thread `body: { agent }` onto every wire call. Verb identities are
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
  const body = useMemo(() => ({ agent }), [agent]);
  // The CAD chat client is session-required by construction (it composes
  // `useActiveChatInstance` / `useChatActions`), so `activeChatId` is a
  // guaranteed `string` from the strict session context — no optional
  // branching needed.
  const { activeChatId } = useActiveChatSession();
  const store = useChatSessionStore();

  // Publish the latest agent body to the chat-session store so the
  // hydration auto-regenerate on pending-tail (the one path that fires a
  // request through the persistence machine without an explicit body) can
  // fall back to this snapshot. Without this, the very first
  // homepage-seeded turn would dispatch with `body: undefined` and the API
  // would 400 with `agent: Required`. See `ChatSessionStore.setLatestAgentBody`.
  useEffect(() => {
    store.setLatestAgentBody(activeChatId, body);
    return () => {
      store.setLatestAgentBody(activeChatId, undefined);
    };
  }, [activeChatId, body, store]);

  const submit = useCallback(
    (input: CadChatSubmitInput) => {
      const userMessage = buildUserMessage(input);
      actions.sendMessage(userMessage, { body });
    },
    [actions, body],
  );

  const edit = useCallback(
    (messageId: string, input: CadChatSubmitInput) => {
      actions.editMessage(messageId, input.text, {
        imageUrls: input.imageUrls ? [...input.imageUrls] : undefined,
        body,
      });
    },
    [actions, body],
  );

  const retry = useCallback(
    (messageId: string, modelId?: string) => {
      // "Retry with a different model" overrides only `agent.model` for this
      // single dispatch; the active model is **not** mutated. The override
      // is composed inline so the wire body still carries the rest of the
      // current `agent` config (kernel, mode, toolChoice, testingEnabled,
      // snapshot, contextPayload) verbatim. Without this branch, retries
      // would silently fall through to the active model and the
      // model-selector dropdown would be a no-op (R10/t17).
      const overrideBody = modelId ? { agent: { ...agent, model: modelId } } : body;
      actions.retryMessage(messageId, { body: overrideBody });
    },
    [actions, agent, body],
  );

  const regenerateTail = useCallback(() => {
    actions.regenerate({ body });
  }, [actions, body]);

  const stop = useCallback(() => {
    actions.stop();
  }, [actions]);

  return {
    submit,
    edit,
    retry,
    regenerateTail,
    stop,
    messages: chat.messages,
    status,
    error: chat.error,
    agent,
  };
};
