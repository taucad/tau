import type { AgentLogEvent, CompactionTrace, ProviderMessage, RowKey } from '#log/event-types.js';

/*
 * Tau's own turn facts for agent observability (T05), read from committed rows.
 *
 * Native `pi.ai.request` spans say what a model request did. They cannot say
 * what a turn did: which tools ran and how each settled, whether history was
 * compacted, how long an approval held the run, or how the run ended. Those
 * are facts the host has already committed to the chat's log, so this reads
 * them from there rather than from live callbacks, and the answer is the same
 * on every device and every replay.
 *
 * It is a pure fold over rows. It is never on the execution path, writes
 * nothing, and holds nothing between calls. It carries identities, names,
 * counts and times only, never message content, so its output is safe for
 * every purpose that admits summaries. Destination envelopes, scope and
 * retention belong to the delivery projection (T09); this is its input.
 */

/** How a run or a tool call ended, in the evidence contract's vocabulary. @public */
export type ObservedOutcome = 'completed' | 'cancelled' | 'failed' | 'abandoned' | 'unknown';

/** A committed row's identity, with the chat it belongs to. @public */
export type ObservedSource = Readonly<{ chatId: string; leaderEpoch: string; sequence: number }>;

/** One tool call the run dispatched, as its committed rows record it. @public */
export type ObservedToolCall = Readonly<{
  call: string;
  toolName: string;
  /** `unknown` while no output row landed; a missing result is never read as a failure. */
  outcome: ObservedOutcome;
  input: ObservedSource;
  output: ObservedSource | undefined;
  /** When the input and the output rows were recorded; `settledAt` is absent with `output`. */
  startedAt: number;
  settledAt: number | undefined;
}>;

/** One gateway invocation the run prepared, and what the gateway answered for it. @public */
export type ObservedInvocation = Readonly<{
  attemptId: string;
  purpose: 'generation' | 'compaction';
  modelId: string;
  binding: 'pending' | 'terminal' | 'unavailable' | undefined;
  settlement: 'settled' | 'released' | 'absorbed' | 'voided' | undefined;
  prepared: ObservedSource;
}>;

/** One committed change to provider history that the model did not write. @public */
export type ObservedTransformation = Readonly<{
  operation: 'compact' | 'trim';
  lane: CompactionTrace['lane'] | undefined;
  tier: CompactionTrace['tier'] | undefined;
  tokensBefore: number | undefined;
  tokensAfter: number | undefined;
  omitted: number;
  source: ObservedSource;
}>;

/** A phase the run spent time in, between two committed rows. `end` is absent while it is open. @public */
export type ObservedInterval = Readonly<{
  phase: 'admission' | 'tool' | 'approval';
  start: number;
  end: number | undefined;
}>;

/** Everything one run's committed rows say about it. @public */
export type TurnObservation = Readonly<{
  chatId: string;
  runId: string;
  /** The person's turn the run answered, when its admission row names one. */
  turnId: string | undefined;
  termination: ObservedOutcome;
  /** Whether the run's turn wrote a revision, conflicted, or neither has been recorded yet. */
  revision: 'written' | 'unchanged' | 'conflicted' | 'failed' | undefined;
  invocations: readonly ObservedInvocation[];
  tools: readonly ObservedToolCall[];
  transformations: readonly ObservedTransformation[];
  intervals: readonly ObservedInterval[];
  /** The row that recorded the run's ending, and when; absent while the run has none. */
  ending: Readonly<{ source: ObservedSource; at: number }> | undefined;
  /** Newest time any fact landed. A heartbeat is not a fact, so it never moves this. */
  lastFactAt: number;
  /** Every row the observation was built from, once each, in log order. */
  sources: readonly ObservedSource[];
}>;

const terminalStates = new Set(['completed', 'failed', 'cancelled']);

const isExternalAgentTurn = (message: ProviderMessage): boolean =>
  message.role === 'user' && message.metadata?.tauInternal?.['kind'] === 'external-agent';

const rowKeyOf = (event: RowKey): string => `${event.leaderEpoch}\u0000${event.sequence}`;

type RunDraft = {
  chatId: string;
  runId: string;
  turnId: string | undefined;
  external: boolean;
  /** Terminal state per attempt, with the row that recorded it; the highest attempt's wins. */
  terminal: Map<number, Readonly<{ outcome: ObservedOutcome; source: ObservedSource; at: number }>>;
  revision: TurnObservation['revision'];
  invocations: Map<string, ObservedInvocation>;
  tools: Map<string, ObservedToolCall>;
  toolStarted: Map<string, number>;
  transformations: ObservedTransformation[];
  intervals: ObservedInterval[];
  openAdmission: number | undefined;
  openApprovals: Map<string, number>;
  lastFactAt: number;
  sources: ObservedSource[];
};

const draftFor = (runs: Map<string, RunDraft>, chatId: string, runId: string): RunDraft => {
  let draft = runs.get(runId);
  if (draft === undefined) {
    draft = {
      chatId,
      runId,
      turnId: undefined,
      external: false,
      terminal: new Map(),
      revision: undefined,
      invocations: new Map(),
      tools: new Map(),
      toolStarted: new Map(),
      transformations: [],
      intervals: [],
      openAdmission: undefined,
      openApprovals: new Map(),
      lastFactAt: 0,
      sources: [],
    };
    runs.set(runId, draft);
  }
  return draft;
};

const transformationOf = ({
  operation,
  details,
  omitted,
  source,
}: Readonly<{
  operation: ObservedTransformation['operation'];
  details: CompactionTrace | undefined;
  omitted: number;
  source: ObservedSource;
}>): ObservedTransformation => ({
  operation,
  lane: details?.lane,
  tier: details?.tier,
  tokensBefore: details?.tokensBefore,
  tokensAfter: details?.tokensAfter,
  omitted,
  source,
});

/* eslint-disable complexity -- One exhaustive switch over the committed vocabulary reads better than a dispatch table. */
const fold = (draft: RunDraft, event: AgentLogEvent, fact: Readonly<{ at: number; source: ObservedSource }>): void => {
  const { at, source } = fact;
  switch (event.type) {
    case 'run.lifecycle': {
      const attempt = event.attempt ?? 1;
      if (event.state === 'admitted') {
        draft.openAdmission ??= at;
      } else if (event.state === 'running' && draft.openAdmission !== undefined) {
        draft.intervals.push({ phase: 'admission', start: draft.openAdmission, end: at });
        draft.openAdmission = undefined;
      } else if (terminalStates.has(event.state)) {
        draft.terminal.set(attempt, { outcome: event.state as ObservedOutcome, source, at });
      }
      break;
    }
    case 'turn.history-projection-committed': {
      draft.turnId ??= event.message.id;
      draft.external ||= isExternalAgentTurn(event.message);
      break;
    }
    case 'message.appended': {
      const { message } = event;
      draft.external ||= isExternalAgentTurn(message);
      if (message.role === 'tool-input' && !draft.tools.has(message.toolCallId)) {
        draft.tools.set(message.toolCallId, {
          call: message.toolCallId,
          toolName: message.toolName,
          outcome: 'unknown',
          input: source,
          output: undefined,
          startedAt: at,
          settledAt: undefined,
        });
        draft.toolStarted.set(message.toolCallId, at);
      } else if (message.role === 'tool-output') {
        const input = draft.tools.get(message.toolCallId);
        /* An output is a committed result; the first one landed is the call's. */
        if (input !== undefined && input.output === undefined) {
          draft.tools.set(message.toolCallId, {
            ...input,
            outcome: message.isError ? 'failed' : 'completed',
            output: source,
            settledAt: at,
          });
          const started = draft.toolStarted.get(message.toolCallId);
          if (started !== undefined) {
            draft.intervals.push({ phase: 'tool', start: started, end: at });
          }
        }
      }
      break;
    }
    case 'interrupt.recorded': {
      if (event.phase === 'requested' && !draft.openApprovals.has(event.interruptId)) {
        draft.openApprovals.set(event.interruptId, at);
      } else if (event.phase === 'resolved') {
        const start = draft.openApprovals.get(event.interruptId);
        if (start !== undefined) {
          draft.intervals.push({ phase: 'approval', start, end: at });
          draft.openApprovals.delete(event.interruptId);
        }
      }
      break;
    }
    case 'history.compacted': {
      draft.transformations.push(
        transformationOf({
          operation: 'compact',
          details: event.details,
          omitted: event.evictedMessageIds.length,
          source,
        }),
      );
      break;
    }
    case 'message.envelope-replaced': {
      if (event.details !== undefined) {
        draft.transformations.push(transformationOf({ operation: 'trim', details: event.details, omitted: 0, source }));
      }
      break;
    }
    case 'model.invocation-prepared': {
      if (!draft.invocations.has(event.attemptId)) {
        draft.invocations.set(event.attemptId, {
          attemptId: event.attemptId,
          purpose: event.purpose,
          modelId: event.modelId,
          binding: undefined,
          settlement: undefined,
          prepared: source,
        });
      }
      break;
    }
    case 'model.invocation-bound': {
      const invocation = draft.invocations.get(event.attemptId);
      if (invocation !== undefined) {
        draft.invocations.set(event.attemptId, { ...invocation, binding: event.status });
      }
      break;
    }
    case 'model.invocation-settled': {
      const invocation = draft.invocations.get(event.attemptId);
      if (invocation !== undefined && invocation.settlement === undefined) {
        draft.invocations.set(event.attemptId, { ...invocation, settlement: event.outcome });
      }
      break;
    }
    case 'turn.finalized': {
      draft.turnId ??= event.turnId;
      draft.revision = event.revisionId === undefined ? 'unchanged' : 'written';
      break;
    }
    case 'turn.conflicted': {
      draft.revision = 'conflicted';
      break;
    }
    case 'turn.failed': {
      draft.revision ??= 'failed';
      break;
    }
    default: {
      break;
    }
  }
};
/* eslint-enable complexity -- End the exhaustive fold. */

const settle = (draft: RunDraft): TurnObservation => {
  const attempts = [...draft.terminal.keys()].toSorted((left, right) => left - right);
  const last = attempts.at(-1);
  const open: ObservedInterval[] = [...draft.openApprovals.values()].map((start) => ({
    phase: 'approval',
    start,
    end: undefined,
  }));
  if (draft.openAdmission !== undefined) {
    open.unshift({ phase: 'admission', start: draft.openAdmission, end: undefined });
  }
  const intervals = [...draft.intervals, ...open];
  const ending = last === undefined ? undefined : draft.terminal.get(last);
  return {
    chatId: draft.chatId,
    runId: draft.runId,
    turnId: draft.turnId,
    termination: ending?.outcome ?? 'unknown',
    revision: draft.revision,
    invocations: [...draft.invocations.values()],
    tools: [...draft.tools.values()],
    transformations: draft.transformations,
    intervals,
    ending: ending === undefined ? undefined : { source: ending.source, at: ending.at },
    lastFactAt: draft.lastFactAt,
    sources: draft.sources,
  };
};

/**
 * Fold one chat's committed rows into one observation per Tau run.
 *
 * - A row is read once by its key, however many segments or replicas carry it.
 * - A heartbeat is ignored: it is liveness, not a fact, and moves no clock.
 * - A tool call or invocation is identified by its own id, so a resumed attempt
 *   that re-reads it does not count it twice.
 * - The highest attempt's terminal row is the run's ending; a run with none is
 *   `unknown`, as is a tool call with no committed output.
 * - An external agent's run is left out entirely (ACP exclusion).
 *
 * @param chatId - The chat the rows belong to.
 * @param rows - The chat's rows in log order.
 * @returns One observation per Tau run, in the order each run first appears.
 * @public
 */
export const observeTurns = (chatId: string, rows: readonly AgentLogEvent[]): TurnObservation[] => {
  const seen = new Set<string>();
  const runs = new Map<string, RunDraft>();
  for (const event of rows) {
    const key = rowKeyOf(event);
    if (event.type === 'run.heartbeat' || seen.has(key)) {
      continue;
    }
    seen.add(key);
    const at = Date.parse(event.recordedAt);
    const draft = draftFor(runs, chatId, event.runId);
    const source = { chatId, leaderEpoch: event.leaderEpoch, sequence: event.sequence };
    draft.sources.push(source);
    if (Number.isFinite(at)) {
      draft.lastFactAt = Math.max(draft.lastFactAt, at);
    }
    fold(draft, event, { at: Number.isFinite(at) ? at : draft.lastFactAt, source });
  }
  return [...runs.values()].filter((draft) => !draft.external).map((draft) => settle(draft));
};
