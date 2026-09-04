/**
 * Paseo canonical-timeline discipline, as pure functions.
 *
 * Everything here was proved in production by `paseo-execution.adapter.ts`,
 * which W4-PASEO deleted with the API's chat plane. Two invariants earned their
 * place there and are kept verbatim in meaning:
 *
 * 1. **Cursor discipline.** The canonical timeline is paged by `(epoch, seq)`
 *    and any of `error` / `reset` / `staleCursor` / `gap` on a page is a hard
 *    failure — never a silent restart, because a silent restart replays a turn
 *    the user already saw as a second turn.
 * 2. **Send exactly once.** After a reconnect the prompt may or may not have
 *    reached the daemon, and the only honest third answer is a refusal.
 *
 * Kept SDK-free so both are testable without a relay.
 */
import type { AgentTimelineItem } from '@getpaseo/protocol/agent-types';
import type { ExternalAgentLogEvent, JsonValue } from '@taucad/agent-host';

/** Position in one canonical timeline. `seq` is the entry's `seqEnd`. @public */
export type PaseoCursor = Readonly<{ epoch: string; seq: number }>;

/** The page shape this module consumes from `agent.timeline.refetch`. */
export type PaseoTimelinePage = Readonly<{
  epoch: string;
  entries: ReadonlyArray<{ readonly seqEnd: number; readonly item: AgentTimelineItem }>;
  hasNewer?: boolean;
  hasOlder?: boolean;
  // oxlint-disable-next-line typescript/no-restricted-types -- mirrors the upstream payload, which sends null for "no page before this".
  startCursor?: PaseoCursor | null;
  error?: unknown;
  reset?: boolean;
  staleCursor?: boolean;
  gap?: boolean;
}>;

/** Durable send state carried on the run's marker. @public */
export type PaseoSendState = 'pending' | 'sending' | 'sent' | 'approval';

/**
 * Whether this attempt may send the prompt.
 *
 * `ambiguous` is the whole point: a `sending` claim that never reached `sent`
 * means the daemon may or may not hold the prompt, and sending again would
 * duplicate the user's turn. Refusing is the only answer that cannot lie.
 *
 * @param sendState - Durable state from a previous attempt.
 * @param submitted - Whether the timeline already shows this run's prompt.
 * @returns What this attempt should do.
 */
export const decidePaseoPromptSend = (
  sendState: PaseoSendState,
  submitted: boolean,
): 'send' | 'reconcile' | 'ambiguous' => {
  if (submitted || sendState === 'sent') {
    return 'reconcile';
  }
  if (sendState === 'pending') {
    return 'send';
  }
  return 'ambiguous';
};

/** A canonical page that cannot be replayed safely. @public */
export const paseoTimelineResetError = (): Error =>
  Object.assign(new Error('Paseo canonical timeline requires a reset; replay cannot continue safely.'), {
    code: 'PASEO_TIMELINE_RESET',
  });

/**
 * Entries strictly after `cursor`, and the cursor they advance it to.
 *
 * @param page - One canonical page.
 * @param cursor - Position already projected, if any.
 * @returns The entries to project, in order, each with its resulting cursor.
 * @throws When the page reports a reset, gap, stale cursor or error.
 */
export const advancePaseoCursor = (
  page: PaseoTimelinePage,
  cursor: PaseoCursor | undefined,
): ReadonlyArray<{ readonly cursor: PaseoCursor; readonly item: AgentTimelineItem }> => {
  /* The wire spells "no error" as `null`, not as an absent field — a strict
   * `!== undefined` check here refused every healthy page. */
  const reported = page.error ?? undefined;
  if (reported !== undefined || page.reset === true || page.staleCursor === true || page.gap === true) {
    throw paseoTimelineResetError();
  }
  return page.entries
    .filter((entry) => cursor === undefined || page.epoch !== cursor.epoch || entry.seqEnd > cursor.seq)
    .map((entry) => ({ cursor: { epoch: page.epoch, seq: entry.seqEnd }, item: entry.item }));
};

/** Whether a live stream frame is newer than what has been projected. @public */
export const isPaseoFrameNew = (
  frame: Readonly<{ epoch?: string | undefined; seq?: number | undefined }>,
  cursor: PaseoCursor | undefined,
): frame is Readonly<{ epoch: string; seq: number }> => {
  if (frame.epoch === undefined || frame.seq === undefined) {
    return false;
  }
  return cursor === undefined || frame.epoch !== cursor.epoch || frame.seq > cursor.seq;
};

/** Whether the timeline already carries this run's own prompt. @public */
export const timelineCarriesPrompt = (page: PaseoTimelinePage, runId: string): boolean =>
  page.entries.some(
    (entry) =>
      entry.item.type === 'user_message' && (entry.item.clientMessageId === runId || entry.item.messageId === runId),
  );

// oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- upstream detail payloads are JSON by construction; `undefined` is the only shape the log cannot hold.
const asJson = (value: unknown): JsonValue => (value === undefined ? null : (value as JsonValue));

/** Tool calls whose input has been projected, so a later status names it. @public */
export type PaseoToolCalls = Map<string, { readonly toolName: string; readonly callId: string }>;

/**
 * Project one canonical item into durable log events.
 *
 * The vocabulary is exactly W4-ACP's — `message.appended` with `assistant`,
 * `tool-input` and `tool-output` roles, each carrying
 * `metadata.tauInternal = { kind: 'external-tool', origin: 'external', agentId }`.
 * No new event type, so a reader that knows nothing about Paseo replays the log
 * unchanged.
 *
 * Unlike ACP, Paseo has no separate tool-update event: the *same* `callId`
 * reappears with a new `status`. A call first seen already terminal (history
 * replay) therefore emits both halves in one go.
 *
 * `reasoning`, `todo`, `compaction` and `user_message` are dropped: the first
 * three have no honest home in the log, and the host already appended the
 * user's own turn at admission. An `error` item is dropped here too — the run's
 * `run.lifecycle: failed` carries the reason, and duplicating it as prose would
 * read as something the agent said.
 *
 * @param item - The canonical item.
 * @param context - Agent id, id factory, and the open-tool-call table.
 * @returns Events to append, possibly none.
 */
export const projectPaseoItem = (
  item: AgentTimelineItem,
  context: {
    readonly agentId: string;
    readonly createId: () => string;
    readonly openToolCalls: PaseoToolCalls;
  },
): readonly ExternalAgentLogEvent[] => {
  const metadata = { tauInternal: { kind: 'external-tool', origin: 'external', agentId: context.agentId } };
  if (item.type === 'assistant_message') {
    if (item.text === '') {
      return [];
    }
    return [
      {
        type: 'message.appended',
        message: {
          id: item.messageId ?? context.createId(),
          role: 'assistant',
          content: [{ type: 'text', text: item.text }],
          metadata,
        },
      },
    ];
  }
  if (item.type !== 'tool_call') {
    return [];
  }
  const events: ExternalAgentLogEvent[] = [];
  let open = context.openToolCalls.get(item.callId);
  if (!open) {
    open = { toolName: item.name, callId: context.createId() };
    context.openToolCalls.set(item.callId, open);
    events.push({
      type: 'message.appended',
      message: {
        id: context.createId(),
        role: 'tool-input',
        toolCallId: open.callId,
        toolName: open.toolName,
        content: asJson(item.detail),
        metadata,
      },
    });
  }
  if (item.status === 'running') {
    return events;
  }
  context.openToolCalls.delete(item.callId);
  events.push({
    type: 'message.appended',
    message: {
      id: context.createId(),
      role: 'tool-output',
      toolCallId: open.callId,
      toolName: open.toolName,
      content: asJson(item.status === 'failed' ? (item.error ?? item.detail) : item.detail),
      isError: item.status === 'failed',
      metadata,
    },
  });
  return events;
};
