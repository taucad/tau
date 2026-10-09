/**
 * Agent usage telemetry (W36-C): one `agent.turn` entry per settled turn and
 * `agent.session` entries, for every agent — Tau, Claude Code, Codex over ACP.
 *
 * The admitting tab is the only reporter: `ChatTurnHost` starts a tracker when
 * it admits a run, so a replayed log or a second tab watching the same chat
 * never counts a turn twice. The tracker reads the same projection the run
 * watch reads, so every placement and agent goes through one code path.
 */
import { IngestEntryName, agentErrorCodeSchema, agentIdSchema, agentToolKinds } from '@taucad/telemetry';
import type { ClientMetricEntry } from '@taucad/telemetry';
import { tauToolKinds } from '@taucad/agent-host';
import type { CadAgentExecution } from '@taucad/chat';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { chunksSince } from '#machines/chat-projection.logic.js';
import { agentPlacementOf } from '#lib/agent-host-placement.js';
import { reportToApi } from '#runtime/observability/report-to-api.js';
import { requireClientEnvironmentUrl } from '#environment.config.js';
import { parseErrorForPersistence } from '#utils/error.utils.js';

type AgentTurnDetail = Extract<ClientMetricEntry, { name: 'agent.turn' }>['detail'];
type AgentSessionDetail = Extract<ClientMetricEntry, { name: 'agent.session' }>['detail'];
type ToolKind = (typeof agentToolKinds)[number];

/** Who ran a turn, in the labels the API records. @public */
export type AgentIdentity = Readonly<{ agentId: string; placement: AgentTurnDetail['placement'] }>;

/** Report one ingest entry; the default posts it to `/v1/telemetry/ingest`. @public */
export type AgentTelemetryReport = (entry: ClientMetricEntry) => void;

/** Telemetry loss is acceptable; a turn's admission must never fail because of it. */
const quietly = (action: () => void): void => {
  try {
    action();
  } catch (error) {
    console.warn('[agentUsageTelemetry] dropped', error);
  }
};

const defaultReport: AgentTelemetryReport = (entry) => {
  quietly(() => {
    reportToApi({
      reportUrl: `${requireClientEnvironmentUrl('TAU_API_URL')}/v1/telemetry/ingest`,
      name: entry.name,
      duration: entry.duration,
      detail: entry.detail ?? {},
    });
  });
};

/**
 * The agent and placement one execution runs as.
 *
 * @param execution - The turn's execution.
 * @returns Its telemetry identity; an id the API would refuse reads as `other`.
 * @public
 */
export const agentIdentityOf = (execution: CadAgentExecution): AgentIdentity => {
  const agentId = execution.kind === 'tau' ? 'tau' : execution.agentId;
  return {
    agentId: agentIdSchema.safeParse(agentId).success ? agentId : 'other',
    placement: agentPlacementOf(execution),
  };
};

/** Chunks that are structure or a failure, not something the agent said or did. */
const structuralChunks = new Set([
  'start',
  'start-step',
  'finish-step',
  'finish',
  'abort',
  'error',
  'message-metadata',
  'data-acp-session',
]);
const knownKinds: ReadonlySet<string> = new Set(agentToolKinds);
/**
 * Milliseconds after which a turn that never settled (a dispatch the host never logged) is dropped unreported.
 * ponytail: a fixed ceiling; report these as `abandoned` if they turn out to matter.
 */
const abandonAfter = 6 * 60 * 60 * 1000;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toolKindOf = (chunk: Readonly<Record<string, unknown>>): ToolKind => {
  const metadata = isRecord(chunk['toolMetadata']) ? chunk['toolMetadata'] : undefined;
  const tau = isRecord(metadata?.['tau']) ? metadata['tau'] : undefined;
  const kind =
    (typeof tau?.['kind'] === 'string' ? tau['kind'] : undefined) ??
    (typeof chunk['toolName'] === 'string' ? tauToolKinds.get(chunk['toolName']) : undefined);
  return kind !== undefined && knownKinds.has(kind) ? (kind as ToolKind) : 'other';
};

/** Runs this tab is already tracking; a Resume re-admits the same run. */
const tracked = new Set<string>();

/** Where a tracker reads its run. @public */
export type AgentTurnSource = Readonly<{
  getProjection: () => ChatProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

type ToolResult = Readonly<{ kind: ToolKind; status: 'completed' | 'failed' }>;

/** What one turn's durable chunks said, folded incrementally. */
type TurnFacts = {
  readonly toolKinds: Map<string, ToolKind>;
  readonly toolResults: Map<string, ToolResult>;
  readonly usage: Map<string, Readonly<Record<string, unknown>>>;
};

const foldChunk = (facts: TurnFacts, chunk: Readonly<Record<string, unknown>>): void => {
  const { type } = chunk;
  const callId = typeof chunk['toolCallId'] === 'string' ? chunk['toolCallId'] : undefined;
  if (type === 'tool-input-available' && callId !== undefined) {
    facts.toolKinds.set(callId, toolKindOf(chunk));
  } else if ((type === 'tool-output-available' || type === 'tool-output-error') && callId !== undefined) {
    const kind = toolKindOf(chunk);
    facts.toolResults.set(callId, {
      kind: kind === 'other' ? (facts.toolKinds.get(callId) ?? kind) : kind,
      status: type === 'tool-output-error' ? 'failed' : 'completed',
    });
  } else if (type === 'data-usage' && typeof chunk['id'] === 'string' && isRecord(chunk['data'])) {
    facts.usage.set(chunk['id'], chunk['data']);
  }
};

/** Calls that reached a terminal chunk; one a Stop interrupted has neither status, so a cancelled turn counts none. */
const toolCallsOf = (facts: TurnFacts): Pick<AgentTurnDetail, 'toolCalls'> => {
  const counts = new Map<string, { kind: ToolKind; status: ToolResult['status']; count: number }>();
  for (const { kind, status } of facts.toolResults.values()) {
    const entry = counts.get(`${kind}:${status}`) ?? { kind, status, count: 0 };
    entry.count += 1;
    counts.set(`${kind}:${status}`, entry);
  }
  return counts.size === 0 ? {} : { toolCalls: [...counts.values()] };
};

/** Sums the run's `data-usage` parts, which are per-turn figures; nothing when the agent reported none. */
const tokensOf = (facts: TurnFacts): Pick<AgentTurnDetail, 'tokens'> => {
  if (facts.usage.size === 0) {
    return {};
  }
  const sum = (field: string): number => {
    let total = 0;
    for (const data of facts.usage.values()) {
      const value = data[field];
      total += typeof value === 'number' ? Math.max(0, Math.round(value)) : 0;
    }
    return total;
  };
  return {
    tokens: {
      input: sum('inputTokens'),
      output: sum('outputTokens'),
      cacheRead: sum('cacheReadTokens'),
      cacheWrite: sum('cacheWriteTokens'),
    },
  };
};

const terminalLifecycles: ReadonlySet<unknown> = new Set(['completed', 'failed', 'cancelled']);

const outcomeOf = (lifecycle: unknown, code: string | undefined): Pick<AgentTurnDetail, 'outcome' | 'errorCode'> => {
  if (lifecycle === 'cancelled' || code === 'USER_STOPPED') {
    return { outcome: 'cancelled' };
  }
  if (lifecycle === 'failed') {
    return {
      outcome: 'error',
      errorCode: code !== undefined && agentErrorCodeSchema.safeParse(code).success ? code : 'RUN_FAILED',
    };
  }
  return { outcome: 'completed' };
};

/**
 * Follow one admitted run to its terminal row and report it once.
 *
 * Tool calls are counted by call id from their terminal chunk; tokens are the
 * sum of the run's `data-usage` parts (the ACP session delta is taken
 * host-side). Usage the agent never reported is omitted, never estimated. A
 * paused run (an approval) keeps its clock running. A resumed run keeps its
 * earlier attempts' chunks, so only chunks that arrive after admission count,
 * and one that was already terminal is reported at its *next* terminal row.
 *
 * A tracker outlives the surface that started it, so a run that settles after
 * the person leaves the chat is still reported; one whose chat is released
 * before it settles is dropped at the abandon ceiling.
 *
 * @param options - The run, who runs it, and where to read and report.
 * @public
 */
export const trackAgentTurn = (
  options: Readonly<{
    runId: string;
    identity: AgentIdentity;
    source: AgentTurnSource;
    admittedAt?: number;
    now?: () => number;
    report?: AgentTelemetryReport;
    /** Called once, when the host has logged the run: the turn was accepted, not just composed. */
    onAccepted?: () => void;
  }>,
): void => {
  const { runId, identity, source, onAccepted } = options;
  if (tracked.has(runId)) {
    return;
  }
  tracked.add(runId);
  const now = options.now ?? (() => performance.now());
  const report = options.report ?? defaultReport;
  const admittedAt = options.admittedAt ?? now();
  const facts: TurnFacts = { toolKinds: new Map(), toolResults: new Map(), usage: new Map() };
  const initial = source.getProjection();
  const initialRun = initial?.ledger.runs[runId];
  let reopened = !terminalLifecycles.has(initialRun?.lifecycle);
  let accepted = false;
  let timeToFirstUpdate: number | undefined;
  /* A resume re-admits the same run, whose earlier attempts' chunks stay in the projection: none of them is this turn's. */
  let durableSeen = initial?.views[runId]?.chunks.length ?? 0;
  let liveSeen = initial?.live?.runId === runId ? initial.live.chunks.length : 0;
  let done = false;

  const markFirstUpdate = (type: string): void => {
    if (timeToFirstUpdate === undefined && !structuralChunks.has(type)) {
      timeToFirstUpdate = Math.max(0, now() - admittedAt);
    }
  };

  const fold = (projection: ChatProjection): void => {
    const live = projection.live?.runId === runId ? projection.live.chunks : [];
    /* A reread or a new segment restarts a stream; call and usage ids keep the counts exact. */
    for (const chunk of chunksSince(live, live.length < liveSeen ? 0 : liveSeen)) {
      markFirstUpdate(chunk.type);
    }
    liveSeen = live.length;
    const durable = projection.views[runId]?.chunks ?? [];
    for (const chunk of chunksSince(durable, durable.length < durableSeen ? 0 : durableSeen)) {
      markFirstUpdate(chunk.type);
      foldChunk(facts, chunk as unknown as Readonly<Record<string, unknown>>);
    }
    durableSeen = durable.length;
  };

  const check = (): void => {
    const projection = done ? undefined : source.getProjection();
    if (projection === undefined) {
      return;
    }
    fold(projection);
    const run = projection.ledger.runs[runId];
    const settled = terminalLifecycles.has(run?.lifecycle);
    if (settled && !reopened && run?.attempt === initialRun?.attempt) {
      return;
    }
    if (!accepted && run?.lifecycle !== undefined) {
      accepted = true;
      onAccepted?.();
    }
    if (!settled) {
      reopened = true;
      return;
    }
    finish();
    report({
      name: IngestEntryName.AGENT_TURN,
      duration: Math.max(0, now() - admittedAt),
      detail: {
        ...identity,
        ...outcomeOf(run?.lifecycle, run?.failure?.code),
        ...(timeToFirstUpdate === undefined ? {} : { timeToFirstUpdate }),
        ...toolCallsOf(facts),
        ...tokensOf(facts),
      },
    });
  };

  const unsubscribe = source.subscribe(check);
  const abandon = setTimeout(() => {
    finish();
  }, abandonAfter);
  function finish(): void {
    done = true;
    unsubscribe();
    clearTimeout(abandon);
    tracked.delete(runId);
  }
  check();
};

/**
 * Report a turn refused before it ran: its admission threw.
 *
 * @param options - Who would have run it, the admission failure (its `code`, when bounded), the milliseconds the
 *   admission took, and where to report (defaults to the ingest API).
 * @public
 */
export const reportRefusedAgentTurn = ({
  identity,
  error,
  duration,
  report = defaultReport,
}: Readonly<{ identity: AgentIdentity; error: unknown; duration: number; report?: AgentTelemetryReport }>): void => {
  /* The same reading the chat's error card uses: a code thrown on the error, or one inside its structured message. */
  const code = error instanceof Error ? parseErrorForPersistence(error).code : undefined;
  report({
    name: IngestEntryName.AGENT_TURN,
    duration: Math.max(0, duration),
    detail: {
      ...identity,
      outcome: 'refused',
      errorCode: code !== undefined && agentErrorCodeSchema.safeParse(code).success ? code : 'ADMISSION_FAILED',
    },
  });
};

/** The transitions of one chat surface's agent session. @public */
export type AgentSessionTracker = Readonly<{
  admitted: (identity: AgentIdentity) => void;
  refused: (identity: AgentIdentity) => void;
  end: () => void;
}>;

/**
 * One chat surface's agent session: it starts at the first admitted turn for an
 * agent and placement, ends when the chat leaves it (another agent, another
 * chat, unmount), and is refused when its first turn could not be admitted.
 *
 * @param report - Where to report; defaults to the ingest API.
 * @returns The session's three transitions.
 * @public
 */
export const createAgentSessionTracker = (report: AgentTelemetryReport = defaultReport): AgentSessionTracker => {
  let active: AgentIdentity | undefined;
  const send = (identity: AgentIdentity, outcome: AgentSessionDetail['outcome']): void => {
    report({ name: IngestEntryName.AGENT_SESSION, duration: 0, detail: { ...identity, outcome } });
  };
  const same = (identity: AgentIdentity): boolean =>
    active?.agentId === identity.agentId && active.placement === identity.placement;
  const end = (): void => {
    if (active !== undefined) {
      send(active, 'ended');
      active = undefined;
    }
  };
  return {
    admitted(identity: AgentIdentity): void {
      if (!same(identity)) {
        end();
        active = identity;
        send(identity, 'started');
      }
    },
    refused(identity: AgentIdentity): void {
      if (!same(identity)) {
        send(identity, 'refused');
      }
    },
    end,
  };
};

/** One admission's telemetry: report it admitted under its run, or refused. @public */
export type AgentTurnTelemetry = Readonly<{
  admitted: (runId: string) => void;
  refused: (error: unknown) => void;
}>;

/**
 * Agent usage telemetry for one chat surface: its session, and every turn it admits.
 *
 * @param source - The chat's projection.
 * @param report - Where to report; defaults to the ingest API.
 * @returns `begin` per admission, and `end` when the surface leaves the chat.
 * @public
 */
export const createAgentUsageTelemetry = (
  source: AgentTurnSource,
  report: AgentTelemetryReport = defaultReport,
): Readonly<{ begin: (execution: CadAgentExecution) => AgentTurnTelemetry; end: () => void }> => {
  const session = createAgentSessionTracker(report);
  return {
    begin(execution) {
      const admittedAt = performance.now();
      let identity: AgentIdentity | undefined;
      quietly(() => {
        identity = agentIdentityOf(execution);
      });
      return {
        admitted(runId) {
          quietly(() => {
            if (identity !== undefined) {
              const admittedAs = identity;
              trackAgentTurn({
                runId,
                identity,
                admittedAt,
                source,
                report,
                onAccepted: () => {
                  quietly(() => {
                    session.admitted(admittedAs);
                  });
                },
              });
            }
          });
        },
        refused(error) {
          quietly(() => {
            if (identity !== undefined) {
              session.refused(identity);
              reportRefusedAgentTurn({ identity, error, duration: performance.now() - admittedAt, report });
            }
          });
        },
      };
    },
    end() {
      quietly(session.end);
    },
  };
};
