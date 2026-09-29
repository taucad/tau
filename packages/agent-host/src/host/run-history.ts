/**
 * Pure readers over a chat's durable history that the host's services share: the external marker, the chat's vendor
 * session, the calls a history left unanswered, and the record that clears a resumable failure's marker.
 */

import { transportFailureDiagnosticType } from '#harness/session-record.js';
import { reduceEventLog } from '#log/reducer.js';
import type { LogRowBody } from '#log/chat-ledger.js';
import type { AgentLogEvent, JsonObject, JsonValue, ProviderMessage, RunLifecycleState } from '#log/event-types.js';
import type { ExternalSessionState } from '#host/tau-agent-host.js';
import type { InterruptRequest } from '#waist/ports.js';

type SessionEvent = LogRowBody;

/**
 * Terminal lifecycle state for one external stop reason.
 *
 * Only `end_turn` is a completed turn. An agent that hit its output ceiling,
 * refused, or exhausted its own request budget stopped with work outstanding,
 * and recording that as `completed` tells every later reader — the transcript,
 * a resume, the user — that the turn finished (V6). A reason this host has
 * never heard of resolves to `completed`: D14 keeps an older reader able to read
 * a newer writer, and the reason itself is recorded verbatim either way.
 */
export const externalStopStates = new Map<string, RunLifecycleState>([
  ['end_turn', 'completed'],
  ['cancelled', 'cancelled'],
  ['max_tokens', 'failed'],
  ['refusal', 'failed'],
  ['max_turn_requests', 'failed'],
]);

/** User-safe reason for a stop that ended the turn short. */
export const externalStopDetail = new Map<string, string>([
  ['max_tokens', 'The agent reached its own output limit before finishing this turn.'],
  ['refusal', 'The agent declined to answer this turn.'],
  ['max_turn_requests', 'The agent used its whole request budget for this turn.'],
]);

/**
 * The login record one thrown refusal carries, if it carries one.
 *
 * A runner refuses with a coded error (`EXTERNAL_AGENT_AUTH_REQUIRED`,
 * `EXTERNAL_AGENT_MODEL_UNAVAILABLE`, …) and may hang the facts a surface needs
 * on it — the login methods, a verification URL and code. The host is
 * deliberately incurious about the payload's shape: it records what it was
 * given, and the surfaces that render it own its schema (`agent-wire.ts`). The
 * code itself, and any stop `details`, ride {@link codedFailureDetail}.
 *
 * @param error - Whatever the external runner threw.
 * @returns The login record to append before the failure.
 */
export const externalRefusalOf = (
  error: unknown,
): {
  readonly login: Omit<SessionEvent & { readonly type: 'interrupt.recorded' }, 'interruptId'> | undefined;
} => {
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- reading one optional own property off a thrown value.
  const fields = error !== null && typeof error === 'object' ? (error as Record<string, unknown>) : undefined;
  const payload = fields?.['login'];
  return {
    login:
      typeof payload === 'object' && payload !== null && !Array.isArray(payload)
        ? {
            type: 'interrupt.recorded',
            phase: 'requested',
            reason: error instanceof Error ? error.message : 'This agent needs you to sign in.',
            // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a refusal payload is JSON by construction of its wire schema.
            payload: payload as JsonValue,
          }
        : undefined,
  };
};

/** Marker distinguishing an externally executed turn in the durable log. */
export const externalTurnKind = 'external-agent';

/**
 * The external-agent marker on the turn's own user message.
 *
 * Deliberately *not* a new event type: the vocabulary already carries
 * per-message provider metadata, and `tauInternal` is where Tau's own
 * non-provider facts live. A reader that knows nothing about external agents
 * still replays the log byte-for-byte.
 *
 * @param message - Message to inspect.
 * @returns The marker, when this message admitted an external turn.
 */
export const externalMarker = (
  message: ProviderMessage,
): (JsonObject & { readonly agentId: string; readonly runKind: string }) | undefined => {
  const marker = message.metadata?.tauInternal;
  if (
    marker === undefined ||
    typeof marker !== 'object' ||
    Array.isArray(marker) ||
    marker['kind'] !== externalTurnKind ||
    typeof marker['agentId'] !== 'string'
  ) {
    return undefined;
  }
  /* `runKind` is absent on markers written before the registry existed; those
   * were all ACP, which is what the node launcher registers under that key. */
  const runKind = typeof marker['runKind'] === 'string' ? marker['runKind'] : 'acp';
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the discriminating fields are checked above.
  return { ...marker, runKind } as JsonObject & { readonly agentId: string; readonly runKind: string };
};

/**
 * The external turn a log's last run admitted, if it was one.
 *
 * @param events - The chat's durable events.
 * @returns The marker and the message carrying it, or `undefined` for a Tau run.
 */
export const externalTurnOf = (
  events: readonly AgentLogEvent[],
):
  | { readonly marker: JsonObject & { readonly agentId: string; readonly runKind: string }; readonly messageId: string }
  | undefined => {
  const runId = events.at(-1)?.runId;
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.runId !== runId) {
      break;
    }
    if (event.type === 'message.appended' && event.message.role === 'user') {
      const marker = externalMarker(event.message);
      return marker ? { marker, messageId: event.message.id } : undefined;
    }
  }
  return undefined;
};

/**
 * The session one agent last held in this chat, across every run in its log.
 *
 * Deliberately *not* {@link externalTurnOf}: that one answers "is the last run
 * external and unfinished?" and stops at the run boundary, which is why every
 * turn used to start a fresh vendor session. This one answers "what has this
 * chat already opened with this agent?", so turn two continues turn one.
 *
 * @param events - The chat's durable events.
 * @param agentId - Agent this turn selected; a different agent gets its own session.
 * @returns The record the runner resumes from, or `undefined` for a first turn.
 */
export const externalSessionOf = (
  events: readonly AgentLogEvent[],
  agentId: string,
): (JsonObject & ExternalSessionState) | undefined => {
  /* Reduced, not raw: `remember` records the session id by *replacing* the
   * user message's envelope, so only the reducer's view carries it. */
  const messages = reduceEventLog(events);
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index]!;
    if (message.role !== 'user') {
      continue;
    }
    const marker = externalMarker(message);
    /* The most recent marker that actually *names* a session: only the turn
     * that opened one records it, and every later turn of the same session
     * carries a bare marker. */
    if (!marker || marker.agentId !== agentId || typeof marker['acpSessionId'] !== 'string') {
      continue;
    }
    const { kind: _kind, runKind: _runKind, ...state } = marker;
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `agentId` is checked above and every other field is optional.
    return state as JsonObject & ExternalSessionState;
  }
  return undefined;
};

/**
 *
 */
export type InterruptPayload = {
  readonly kind: InterruptRequest['kind'];
  readonly prompt: string;
  readonly context?: JsonValue | undefined;
};

export const isJsonObject = (value: JsonValue | undefined): value is JsonObject =>
  value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);

export const isInterruptPayload = (value: JsonValue | undefined): value is InterruptPayload => {
  if (!isJsonObject(value)) {
    return false;
  }
  return (
    (value['kind'] === 'approval' || value['kind'] === 'operator' || value['kind'] === 'safeguard') &&
    typeof value['prompt'] === 'string'
  );
};

export const internalKind = (message: ProviderMessage): string | undefined => {
  const metadata = message.metadata?.tauInternal;
  // oxlint-disable-next-line typescript/dot-notation -- JsonObject keys are index-signature properties under noPropertyAccessFromIndexSignature.
  const kind = metadata?.['kind'];
  return isJsonObject(metadata) && typeof kind === 'string' ? kind : undefined;
};

export const latestTurnId = (messages: readonly ProviderMessage[], fallback: string): string =>
  messages.findLast((message) => message.role === 'user' && internalKind(message) !== 'interrupt-recovery')?.id ??
  fallback;

/**
 * Every call this history left without a result, however it was recorded.
 *
 * A dispatched call is durable twice — the `toolCall` block the model wrote and
 * the `tool-input` row the dispatch adds — and a host that died between the two
 * leaves only the block. A provider refuses an unanswered call, so a resume has
 * to answer each pending id once, whichever row still carries it.
 *
 * @param messages - The reduced history the resume starts from.
 * @returns One entry per unanswered call, in the order the history holds them.
 */
export const pendingToolCalls = (
  messages: readonly ProviderMessage[],
): Array<{ readonly toolCallId: string; readonly toolName: string }> => {
  const outputs = new Set(messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])));
  const pending = new Map<string, { readonly toolCallId: string; readonly toolName: string }>();
  const callsOf = (message: ProviderMessage): Array<{ readonly toolCallId: string; readonly toolName: string }> => {
    if (message.role === 'tool-input') {
      return [{ toolCallId: message.toolCallId, toolName: message.toolName }];
    }
    const blocks: readonly JsonValue[] =
      message.role === 'assistant' && Array.isArray(message.content) ? message.content : [];
    return blocks.flatMap((block) =>
      isJsonObject(block) &&
      block['type'] === 'toolCall' &&
      typeof block['id'] === 'string' &&
      typeof block['name'] === 'string'
        ? [{ toolCallId: block['id'], toolName: block['name'] }]
        : [],
    );
  };
  for (const message of messages) {
    for (const call of callsOf(message)) {
      if (!outputs.has(call.toolCallId)) {
        pending.set(call.toolCallId, call);
      }
    }
  }
  return [...pending.values()];
};

/**
 * The failed call's marker, rewritten as the tool-use turn it actually was.
 *
 * A stream that fails *after* it completed a tool call leaves the marker mid
 * history — the tool's own rows follow it — so there is no prefix to rewind to.
 * Left as it stands, its transport-failure diagnostic is what every later
 * `snapshot()` reports as this chat's failure, and the re-issued call tells the
 * model its own last turn errored. Rewriting it keeps the work that settled and
 * drops the failure: the message the stream would have written had it simply
 * ended after that call.
 *
 * @param marker - The last assistant message of the failed run.
 * @param messages - The reduced history the resume starts from.
 * @returns The replacement envelope, or `undefined` when no tool call settled.
 */
export const settledMarkerEnvelope = (
  marker: ProviderMessage,
  messages: readonly ProviderMessage[],
): ProviderMessage | undefined => {
  const settled = new Set(messages.flatMap((message) => (message.role === 'tool-output' ? [message.toolCallId] : [])));
  const isCall = (block: JsonValue): boolean => isJsonObject(block) && block['type'] === 'toolCall';
  /* A call with no durable result is one the stream never finished writing. It
   * has no `tool-input` row either, and a provider refuses an unanswered call,
   * so it leaves with the failure. */
  const blocks: readonly JsonValue[] = Array.isArray(marker.content) ? marker.content : [];
  const content = blocks.filter(
    (block) => !isCall(block) || (isJsonObject(block) && typeof block['id'] === 'string' && settled.has(block['id'])),
  );
  if (!content.some((block) => isCall(block))) {
    return undefined;
  }
  const { errorMessage: _failed, diagnostics, ...metadata } = marker.metadata ?? {};
  const kept = diagnostics?.filter(
    (diagnostic) => !isJsonObject(diagnostic) || diagnostic['type'] !== transportFailureDiagnosticType,
  );
  return {
    ...marker,
    content,
    metadata: { ...metadata, stopReason: 'toolUse', ...(kept?.length ? { diagnostics: kept } : {}) },
  };
};

/**
 * The record that clears a resumable failure's marker before its call is re-issued.
 *
 * The stream wrapper records a failed call as an assistant message carrying the
 * transport-failure diagnostic. Left in place, pi refuses to continue from an
 * assistant tail and the recovery reminder tells the model a network drop
 * cancelled tools that in fact settled. The marker takes one of two shapes:
 * nothing ran after it, and retracting it restores the exact context the failed
 * call was built from; or a tool it had already started settled behind it, and
 * only its envelope can change ({@link settledMarkerEnvelope}) because a rewind
 * retains a prefix and the marker is no longer the tail.
 *
 * @param messages - The reduced history of the failed run.
 * @returns The event to append, or `undefined` when there is nothing to clear.
 */
export const failureMarkerClearance = (messages: readonly ProviderMessage[]): SessionEvent | undefined => {
  const marker = messages.findLast((message) => message.role === 'assistant');
  if (!marker) {
    return undefined;
  }
  /* Only a message that is provably the failure marker may be retracted or
   * rewritten: an assistant turn without the diagnostic is somebody's real
   * output, wherever it sits. A resumable failure is no longer only a gateway
   * refusal — `RUN_ABANDONED` is one too, and its tail is the agent's committed
   * work, so retracting it loses that work and asks the provider again from the
   * user turn. */
  const isMarker = marker.metadata?.diagnostics?.some(
    (diagnostic) => isJsonObject(diagnostic) && diagnostic['type'] === transportFailureDiagnosticType,
  );
  if (!isMarker) {
    return undefined;
  }
  if (messages.at(-1) === marker) {
    return {
      type: 'history.rewound',
      trigger: 'retry',
      retainedMessageIds: messages.slice(0, -1).map((message) => message.id),
    };
  }
  const replacement = settledMarkerEnvelope(marker, messages);
  return replacement === undefined
    ? undefined
    : { type: 'message.envelope-replaced', messageId: marker.id, replacement };
};
