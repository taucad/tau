import type { CadAgentConfigInput, ToolSelection } from '@taucad/chat';
import type { ChatMode } from '@taucad/chat/constants';
import { useChatComposer } from '#hooks/active-chat-provider.js';
import { useChatSelector } from '#hooks/use-chat.js';
import { useCookie } from '#hooks/use-cookie.js';
import { useChatSnapshot } from '#hooks/use-chat-snapshot.js';
import { useContextPayload } from '#hooks/use-context-payload.js';
import { cookieName } from '#constants/cookie.constants.js';

/**
 * Assemble the per-request CAD agent config from the producer hooks that own
 * each individual field.
 *
 * This is the **single source of truth** for "what does the CAD agent need to
 * run this turn" on the UI side. Every UI submit site (chat textarea, quick
 * starts, Fix-with-AI, homepage, regenerate-on-edit) composes through a
 * chat-client that wraps this hook — not by re-reading the producer hooks
 * directly. Adding a new field on the CAD agent is a single edit here, plus
 * the matching addition on `cadAgentConfigSchema`.
 *
 * Returns the **input** shape (`z.input<typeof cadAgentConfigSchema>`):
 * `snapshot` and `contextPayload` are truly optional both on the wire and in
 * the parsed type — assembling them as `undefined` propagates straight through
 * the API without a sentinel collapse.
 *
 * @public
 */
export const useCadAgentConfig = (): CadAgentConfigInput => {
  const {
    model: { modelId },
    kernel: { kernelId },
  } = useChatComposer();
  const mode = useChatSelector((state) => state.draftMode as ChatMode);
  const toolChoice = useChatSelector((state) => state.draftToolChoice as ToolSelection);
  const [testingEnabled] = useCookie(cookieName.chatTestingEnabled, true);
  const snapshot = useChatSnapshot();
  const contextPayload = useContextPayload();

  return {
    profile: 'cad',
    model: modelId,
    kernel: kernelId,
    mode,
    toolChoice,
    testingEnabled,
    snapshot,
    contextPayload,
  };
};
