import { z } from 'zod';
import { uiMessagesSchema } from '#schemas/message.schema.js';
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
 * User-message metadata is validated by `messageMetadataSchema` inside
 * `uiMessagesSchema` for display-side fields only (creation timestamp +
 * lifecycle status). The current turn's configuration is *only* read from
 * `agent` — never from `messages[N].metadata`.
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

/** Parsed (server-side) shape of a chat-turn request. @public */
export type ChatTurnRequest = {
  id: string;
  messages: MyUIMessage[];
  agent: AgentConfig;
};
