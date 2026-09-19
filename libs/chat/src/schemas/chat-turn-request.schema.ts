import { z } from 'zod';
import { safeValidateUiMessages, uiMessagesSchema } from '#schemas/message.schema.js';
import { agentConfigSchema } from '#schemas/agent-config.schema.js';
import type { MyUIMessage } from '#types/message.types.js';
import type { AgentConfig } from '#schemas/agent-config.schema.js';

/**
 * Admission metadata for one logical chat run.
 *
 * The idempotency key is minted once by the client for a logical run and is
 * reused only when that same run is retried after a transport interruption.
 * `version` makes the admission protocol independently evolvable from the
 * agent configuration and message schemas.
 *
 * @public
 */
export const chatRunAdmissionSchema = z
  .object({
    version: z.literal(1),
    idempotencyKey: z.string().min(16).max(128),
  })
  .strict()
  .meta({ id: 'ChatRunAdmission' });

/**
 * Immutable execution target for one CAD turn: which host writes it.
 *
 * There is no revision *mode*: placement is non-branching by default (north
 * star D7/I18) — a turn lands on its chat's checkout, and the host that owns
 * that tree records the revision. `workspaceId` names the checkout a *browser*
 * turn was placed on and `baseRevisionId` what it descends from; both are
 * absent for a host-placed turn, which resolves its own.
 *
 * `conflict` is present only for a turn started by *Ask chat to resolve*: the
 * conflicted revision it descends from and the paths still without a side. It
 * rides here rather than in the message text because it is a fact about where
 * the turn lands, and the agent must be able to read the three terms back from
 * the graph (A22) rather than parse them out of a prompt.
 *
 * @public
 */
export const chatExecutionTargetSchema = z
  .object({
    hostId: z.string().min(1).max(128),
    workspaceId: z.string().min(1).max(128).optional(),
    baseRevisionId: z.string().min(1).max(256).optional(),
    conflict: z
      .object({
        revisionId: z.string().min(1).max(256),
        paths: z.array(z.string().min(1).max(1024)).min(1).max(1000),
      })
      .strict()
      .optional(),
  })
  .strict()
  .meta({ id: 'ChatExecutionTarget' });

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
    projectId: z.string().min(1),
    messages: uiMessagesSchema,
    agent: agentConfigSchema,
    admission: chatRunAdmissionSchema,
    execution: chatExecutionTargetSchema.optional(),
  })
  .superRefine((request, context) => {
    if (request.agent.profile === 'cad' && request.execution === undefined) {
      context.addIssue({ code: 'custom', path: ['execution'], message: 'CAD turns require an execution target.' });
    }
    if (request.agent.profile !== 'cad' && request.execution !== undefined) {
      context.addIssue({ code: 'custom', path: ['execution'], message: 'Only CAD turns accept an execution target.' });
    }
  })
  .meta({ id: 'ChatTurnRequest' });

/** Admission metadata for one parsed chat run. @public */
export type ChatRunAdmission = z.infer<typeof chatRunAdmissionSchema>;

/** Wire-shape admission metadata. @public */
export type ChatRunAdmissionInput = z.input<typeof chatRunAdmissionSchema>;

/** Immutable execution target for one CAD turn. @public */
export type ChatExecutionTarget = z.infer<typeof chatExecutionTargetSchema>;

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
