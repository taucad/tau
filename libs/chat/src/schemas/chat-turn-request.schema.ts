import { z } from 'zod';
import { safeValidateUiMessages, uiMessagesSchema } from '#schemas/message.schema.js';
import { agentConfigSchema } from '#schemas/agent-config.schema.js';
import type { MyUIMessage } from '#types/message.types.js';
import type { AgentConfig } from '#schemas/agent-config.schema.js';

/**
 * Wire contract for a single chat-turn request: a chat id, the message
 * history the client has, and the per-turn agent configuration. Transport
 * is incidental — today this rides as the HTTP body of `POST /v1/chat`,
 * tomorrow it could ride a WebSocket frame or a queued job; the shape is
 * the same.
 *
 * Per-turn configuration lives in a top-level `agent` block whose
 * discriminated-union schema (see `agent-config.schema.ts`) is the single
 * source of truth for "what does the agent need to run". Adding a new profile
 * or a new field is a single edit on the union; the API controller's
 * `switch (body.agent.profile)` then forces an exhaustive update.
 *
 * `chatTurnRequestSchema` validates only the synchronous envelope. Untrusted
 * boundaries must call `parseChatTurnRequest`, which also validates every
 * message through the AI SDK and Tau's metadata, data-part, and tool schemas.
 * The current turn's configuration is *only* read from `agent` — never from
 * `messages[N].metadata`.
 *
 * Lives in `@taucad/chat` (not `apps/api`) so the UI chat-clients can use it
 * to assert that the request they emit on the wire conforms to the server
 * contract (locks the contract at integration scope per blueprint R14).
 *
 * @public
 */
export const chatTurnRequestSchema = z
  .object({
    id: z.string(),
    messages: uiMessagesSchema,
    agent: agentConfigSchema,
  })
  .meta({ id: 'ChatTurnRequest' });

/** Wire-shape (input) of a chat-turn request. @public */
export type ChatTurnRequestInput = z.input<typeof chatTurnRequestSchema>;

/** Synchronously parsed envelope whose messages remain untrusted. @public */
export type ChatTurnRequestEnvelope = z.output<typeof chatTurnRequestSchema>;

/** Fully parsed server-side chat-turn request. @public */
export type ChatTurnRequest = Omit<ChatTurnRequestEnvelope, 'messages' | 'agent'> & {
  messages: MyUIMessage[];
  agent: AgentConfig;
};

const invalidMessagesError = (): z.ZodError =>
  new z.ZodError([{ code: 'custom', path: ['messages'], message: 'Invalid chat messages.' }]);

/** Parses the envelope and every UI message at an untrusted chat-turn boundary. @public */
export const parseChatTurnRequest = async (input: unknown): Promise<ChatTurnRequest> => {
  const envelope = chatTurnRequestSchema.parse(input);
  const messages = await safeValidateUiMessages(envelope.messages);
  if (!messages.success) {
    throw invalidMessagesError();
  }
  return { ...envelope, messages: messages.data };
};
