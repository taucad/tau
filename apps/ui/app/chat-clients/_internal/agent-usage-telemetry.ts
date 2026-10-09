/**
 * Agent usage telemetry (W36-C): one `agent.turn` entry per settled turn and
 * `agent.session` entries, for every agent — Tau, Claude Code, Codex over ACP.
 *
 * The admitting tab is the only reporter: `ChatTurnHost` starts a tracker when
 * it admits a run, so a replayed log or a second tab watching the same chat
 * never counts a turn twice. The tracker reads the same projection the run
 * watch reads, so every placement and agent goes through one code path.
 */
import {
  IngestEntryName,
  agentErrorCodeSchema,
  agentIdSchema,
  agentToolKinds,
  builtInSkillSlugs,
  geospecRunStatuses,
  kernelIds,
  tauToolNames,
} from '@taucad/telemetry';
import type { AgentTurnContext, ClientMetricEntry, evaluationClasses, lookupOutcomes } from '@taucad/telemetry';
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
type TauToolName = (typeof tauToolNames)[number];
type SkillLabel = AgentTurnContext['skillsActivated'][number];
type LookupOutcome = (typeof lookupOutcomes)[number];
type EvaluationClass = (typeof evaluationClasses)[number];
type GeospecRunStatus = (typeof geospecRunStatuses)[number];

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

/* Turn context (usage metrics): every rule below runs on the device. Paths, patterns, messages and names are read
 * here to classify a call and never leave it; only the counts and fixed labels `contextOf` builds are reported. */

/**
 * Evaluation messages that mean the agent called an API that does not exist as written. Matched on the device;
 * the message is never sent. Adding a pattern changes only the classification, never what is collected.
 */
const apiMisusePatterns = [
  'is not a function',
  'is not defined',
  'has no exported member',
  'does not contain a definition for',
  'unexpected keyword argument',
  'no attribute',
  'You need a previous curve',
  'Invalid props for',
] as const;

/** Source extensions of the kernels' model files. */
const modelFileExtensions = ['.ts', '.js', '.py', '.kcl', '.scad', '.cs'] as const;
const knownTauTools: ReadonlySet<string> = new Set(tauToolNames);
const knownSkills: ReadonlySet<string> = new Set(builtInSkillSlugs);
const knownRunStatuses: ReadonlySet<string> = new Set(geospecRunStatuses);
const knownKernels: ReadonlySet<string> = new Set(kernelIds);
/** A project-rooted skill file, as Tau's own tools address it. */
const tauSkillFile = /^\.agents\/skills\/([^/]+)\/(.+)$/u;
/** A skill file an ACP agent reads from the per-digest skill directory Tau stages (`<config>/acp-skills/<sha256>/`). */
const acpSkillFile = /\/acp-skills\/[^/]+\/\.agents\/skills\/([^/\s]+)\/(\S+)/gu;
/** `SKILL.md` itself, tolerating a shell quote or separator after it. */
const skillBody = /^SKILL\.md(?![\w.-])/u;
/** Kinds that change the workspace; a call of one of these is never a lookup. */
const mutatingKinds: ReadonlySet<ToolKind> = new Set(['edit', 'delete', 'move']);
/** Tau's code for a path that does not exist. */
const fileNotFoundCodes: ReadonlySet<unknown> = new Set(['FILE_NOT_FOUND']);
const textEncoder = new TextEncoder();

const tauMetadataOf = (chunk: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined => {
  const metadata = isRecord(chunk['toolMetadata']) ? chunk['toolMetadata'] : undefined;
  return isRecord(metadata?.['tau']) ? metadata['tau'] : undefined;
};

/** Every string in a value, record keys included (an ACP patch keys its changes by path); bounded in depth. */
const stringsIn = (value: unknown, depth = 0): string[] => {
  if (typeof value === 'string') {
    return [value];
  }
  if (depth > 4) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => stringsIn(item, depth + 1));
  }
  return isRecord(value) ? Object.entries(value).flatMap(([key, item]) => [key, ...stringsIn(item, depth + 1)]) : [];
};

const locationPathsOf = (chunk: Readonly<Record<string, unknown>>): string[] => {
  const locations = tauMetadataOf(chunk)?.['locations'];
  return Array.isArray(locations)
    ? locations.flatMap((location: unknown) =>
        isRecord(location) && typeof location['path'] === 'string' ? [location['path']] : [],
      )
    : [];
};

/** Whether a path names a model source file: a kernel extension, outside `.tau/` and `.agents/`, not a GeoSpec. */
const isModelFile = (path: string): boolean => {
  if (/\s/u.test(path) || !modelFileExtensions.some((extension) => path.endsWith(extension))) {
    return false;
  }
  const rooted = `/${path}`;
  const name = rooted.slice(rooted.lastIndexOf('/') + 1);
  return !rooted.includes('/.tau/') && !rooted.includes('/.agents/') && !name.includes('.geospec.');
};

const skillLabelOf = (slug: string): SkillLabel => (knownSkills.has(slug) ? (slug as SkillLabel) : 'custom');

/** What one call is, for the turn's context. */
type CallFacts = {
  /** Its position among the turn's calls, by first input. */
  readonly ordinal: number;
  kind: ToolKind;
  /** Its name, when it is one of Tau's own tools (not one an ACP agent reached through Tau's MCP server). */
  tool?: TauToolName;
  /** Its Tau tool name, own or through Tau's MCP server: what its input and output mean. */
  semantics?: TauToolName;
  /** It looked up a skill's reference material. */
  reference: boolean;
  /** The skill it activates, when it completes. */
  activates?: SkillLabel;
  /** It writes a model source file. */
  write: boolean;
};

/** A Tau tool's path argument: its target file, its search root, else its first string argument. */
const tauPathOf = (input: unknown): string | undefined => {
  if (!isRecord(input)) {
    return undefined;
  }
  const path = input['targetFile'] ?? input['path'];
  return typeof path === 'string' ? path : Object.values(input).find((value) => typeof value === 'string');
};

const classifyCall = (
  chunk: Readonly<Record<string, unknown>>,
  ordinal: number,
): Omit<CallFacts, 'ordinal'> & { ordinal: number } => {
  const kind = toolKindOf(chunk);
  const toolName = typeof chunk['toolName'] === 'string' ? chunk['toolName'] : undefined;
  const semantics = toolName !== undefined && knownTauTools.has(toolName) ? (toolName as TauToolName) : undefined;
  const own = semantics !== undefined && tauMetadataOf(chunk)?.['origin'] !== 'external';
  const { input } = chunk;
  const facts: CallFacts = { ordinal, kind, reference: false, write: false };
  if (own) {
    facts.tool = semantics;
  }
  if (semantics !== undefined) {
    facts.semantics = semantics;
    const path = tauPathOf(input);
    if (semantics === 'create_file' || semantics === 'edit_file') {
      facts.write = path !== undefined && isModelFile(path);
    } else if (semantics === 'use_skill') {
      const skillName = isRecord(input) ? input['skillName'] : undefined;
      if (typeof skillName === 'string') {
        facts.activates = skillLabelOf(skillName);
      }
    } else if (path !== undefined && !mutatingKinds.has(kind)) {
      const match = tauSkillFile.exec(path);
      facts.reference = match !== null && knownSkills.has(match[1]!) && !skillBody.test(match[2]!);
    }
    return facts;
  }
  const candidates = [...stringsIn(input), ...locationPathsOf(chunk)];
  if (kind === 'edit') {
    facts.write = candidates.some((candidate) => isModelFile(candidate));
  } else if (!mutatingKinds.has(kind)) {
    for (const candidate of candidates) {
      for (const [, slug, rest] of candidate.matchAll(acpSkillFile)) {
        if (skillBody.test(rest!)) {
          facts.activates ??= skillLabelOf(slug!);
        } else {
          facts.reference = true;
        }
      }
    }
  }
  return facts;
};

/** A Tau tool failure's code: the host records `{ errorCode, message }`, which the projection serialises. */
const errorCodeOf = (errorText: unknown): unknown => {
  if (typeof errorText !== 'string' || !errorText.startsWith('{')) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(errorText);
    return isRecord(parsed) ? parsed['errorCode'] : undefined;
  } catch {
    return undefined;
  }
};

/** Whether an ACP result carries any text: a search that printed nothing found nothing. */
const hasText = (value: unknown, depth = 0): boolean => {
  if (typeof value === 'string') {
    return value.trim() !== '';
  }
  if (depth > 4) {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some((item: unknown) => hasText(item, depth + 1));
  }
  return isRecord(value)
    ? Object.entries(value).some(([key, item]) => key !== 'status' && hasText(item, depth + 1))
    : false;
};

const lookupOutcomeOf = (call: CallFacts, chunk: Readonly<Record<string, unknown>>): LookupOutcome => {
  if (chunk['type'] === 'tool-output-error') {
    return call.semantics !== undefined && fileNotFoundCodes.has(errorCodeOf(chunk['errorText']))
      ? 'not_found'
      : 'tool_error';
  }
  const { output } = chunk;
  if (isRecord(output) && (output['totalMatches'] === 0 || output['totalFiles'] === 0)) {
    return 'zero_match';
  }
  return call.semantics === undefined && call.kind === 'search' && !hasText(output) ? 'zero_match' : 'ok';
};

/** UTF-8 bytes a lookup returned: a read's text, else the result as the model receives it. */
const bytesOf = (output: unknown): number => {
  const text =
    typeof output === 'string'
      ? output
      : isRecord(output) && typeof output['content'] === 'string'
        ? output['content']
        : output === undefined
          ? ''
          : JSON.stringify(output);
  return textEncoder.encode(text).byteLength;
};

/** How one durable `evaluate_model` result ended. */
const evaluationClassOf = (chunk: Readonly<Record<string, unknown>>): EvaluationClass => {
  const { output } = chunk;
  if (chunk['type'] === 'tool-output-error' || !isRecord(output)) {
    return 'other';
  }
  const issues = (Array.isArray(output['kernelIssues']) ? output['kernelIssues'] : []).filter((issue) =>
    isRecord(issue),
  );
  const errors = issues.filter((issue) => issue['severity'] === 'error');
  if (output['status'] === 'ready' && errors.length === 0) {
    return 'ok';
  }
  const failing = errors.length === 0 ? issues : errors;
  const message = (issue: Readonly<Record<string, unknown>>): string =>
    typeof issue['message'] === 'string' ? issue['message'] : '';
  if (failing.some((issue) => issue['code'] === 'OPERATION_TIMEOUT')) {
    return 'timeout';
  }
  if (failing.some((issue) => apiMisusePatterns.some((pattern) => message(issue).includes(pattern)))) {
    return 'api_misuse';
  }
  if (failing.some((issue) => issue['type'] === 'compilation')) {
    return 'compile';
  }
  if (failing.some((issue) => issue['type'] === 'runtime')) {
    return 'runtime';
  }
  return failing.some(
    (issue) => issue['type'] === 'kernel' || (typeof issue['code'] === 'string' && issue['code'] !== 'UNKNOWN'),
  )
    ? 'kernel'
    : 'other';
};

/** The turn's context, folded as its chunks arrive. */
type ContextFacts = {
  firstWrite?: Readonly<{ calls: number; elapsed: number }>;
  readonly settled: Set<string>;
  readonly writes: Set<string>;
  readonly skills: Set<SkillLabel>;
  readonly lookups: Map<LookupOutcome, number>;
  referenceBytes: number;
  readonly evaluations: Map<EvaluationClass, number>;
  /** The latest evaluation did not end `ok`, so a model write now is a correction. */
  afterError: boolean;
  corrections: number;
  readonly geospec: { runs: number; passed: number; failed: number; readonly statuses: Map<GeospecRunStatus, number> };
};

const increment = <Key>(counts: Map<Key, number>, key: Key, by = 1): void => {
  counts.set(key, (counts.get(key) ?? 0) + by);
};

const foldCallInput = (facts: TurnFacts, callId: string, call: CallFacts): void => {
  const { context } = facts;
  if (!call.write || context.writes.has(callId)) {
    return;
  }
  context.writes.add(callId);
  context.firstWrite ??= { calls: call.ordinal, elapsed: facts.elapsed() };
  if (context.afterError) {
    context.corrections += 1;
  }
};

const foldCallOutput = (facts: TurnFacts, call: CallFacts, chunk: Readonly<Record<string, unknown>>): void => {
  const { context } = facts;
  const completed = chunk['type'] === 'tool-output-available';
  if (completed && call.activates !== undefined) {
    context.skills.add(call.activates);
  }
  if (call.reference) {
    const outcome = lookupOutcomeOf(call, chunk);
    increment(context.lookups, outcome);
    if (call.tool !== undefined && completed) {
      context.referenceBytes += bytesOf(chunk['output']);
    }
  }
  if (call.semantics === 'evaluate_model') {
    const evaluation = evaluationClassOf(chunk);
    increment(context.evaluations, evaluation);
    context.afterError = evaluation !== 'ok';
  }
  const { output } = chunk;
  if (
    call.semantics === 'test_model' &&
    completed &&
    isRecord(output) &&
    Array.isArray(output['failures']) &&
    typeof output['passed'] === 'number'
  ) {
    const { geospec } = context;
    geospec.runs += 1;
    geospec.passed += Math.max(0, Math.round(output['passed']));
    geospec.failed += output['failures'].length;
    const status = output['runStatus'];
    if (typeof status === 'string' && knownRunStatuses.has(status)) {
      increment(geospec.statuses, status as GeospecRunStatus);
    }
  }
};

/** Runs this tab is already tracking; a Resume re-admits the same run. */
const tracked = new Set<string>();

/** The turn's kernel, carried only when the person allows usage metrics; its presence is that consent. @public */
export type AgentTurnUsageMetrics = Readonly<{ kernelId: AgentTurnContext['kernelId'] }>;

/** Where a tracker reads its run. @public */
export type AgentTurnSource = Readonly<{
  getProjection: () => ChatProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

type ToolResult = Readonly<{ kind: ToolKind; tool?: TauToolName; status: 'completed' | 'failed' }>;

/** What one turn's durable chunks said, folded incrementally. */
type TurnFacts = {
  /** Every call whose input arrived, in first-input order. */
  readonly calls: Map<string, CallFacts>;
  readonly toolResults: Map<string, ToolResult>;
  readonly usage: Map<string, Readonly<Record<string, unknown>>>;
  readonly context: ContextFacts;
  /** Milliseconds since admission, read when a fact needs the time. */
  readonly elapsed: () => number;
};

const createTurnFacts = (elapsed: () => number): TurnFacts => ({
  elapsed,
  calls: new Map(),
  toolResults: new Map(),
  usage: new Map(),
  context: {
    settled: new Set(),
    writes: new Set(),
    skills: new Set(),
    lookups: new Map(),
    referenceBytes: 0,
    evaluations: new Map(),
    afterError: false,
    corrections: 0,
    geospec: { runs: 0, passed: 0, failed: 0, statuses: new Map() },
  },
});

/**
 * Fold one durable chunk.
 *
 * @param facts - The turn so far.
 * @param chunk - The chunk.
 */
const foldChunk = (facts: TurnFacts, chunk: Readonly<Record<string, unknown>>): void => {
  const { type } = chunk;
  const callId = typeof chunk['toolCallId'] === 'string' ? chunk['toolCallId'] : undefined;
  if (type === 'tool-input-available' && callId !== undefined) {
    /* An ACP call's input is replaced as the agent refines it; it keeps its first position. */
    const call = classifyCall(chunk, facts.calls.get(callId)?.ordinal ?? facts.calls.size);
    facts.calls.set(callId, call);
    foldCallInput(facts, callId, call);
  } else if ((type === 'tool-output-available' || type === 'tool-output-error') && callId !== undefined) {
    const kind = toolKindOf(chunk);
    const call = facts.calls.get(callId);
    facts.toolResults.set(callId, {
      kind: kind === 'other' ? (call?.kind ?? kind) : kind,
      ...(call?.tool === undefined ? {} : { tool: call.tool }),
      status: type === 'tool-output-error' ? 'failed' : 'completed',
    });
    if (call !== undefined && !facts.context.settled.has(callId)) {
      facts.context.settled.add(callId);
      foldCallOutput(facts, call, chunk);
    }
  } else if (type === 'data-usage' && typeof chunk['id'] === 'string' && isRecord(chunk['data'])) {
    facts.usage.set(chunk['id'], chunk['data']);
  }
};

/**
 * Calls that reached a terminal chunk; one a Stop interrupted has neither status, so a cancelled turn counts none.
 * Tau's own tools are named only with usage-metrics consent.
 */
const toolCallsOf = (facts: TurnFacts, named: boolean): Pick<AgentTurnDetail, 'toolCalls'> => {
  const counts = new Map<string, NonNullable<AgentTurnDetail['toolCalls']>[number]>();
  for (const { kind, tool, status } of facts.toolResults.values()) {
    const name = named ? tool : undefined;
    const key = `${kind}:${name ?? ''}:${status}`;
    const entry = counts.get(key) ?? { kind, ...(name === undefined ? {} : { tool: name }), status, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return counts.size === 0 ? {} : { toolCalls: [...counts.values()] };
};

const countsOf = <Label extends string, Field extends string>(
  counts: ReadonlyMap<Label, number>,
  field: Field,
): Array<Record<Field, Label> & { count: number }> =>
  [...counts].map(([label, count]) => ({ ...(Object.fromEntries([[field, label]]) as Record<Field, Label>), count }));

/**
 * What the turn did with its context, in the schema's counts and labels only.
 *
 * @param facts - The settled turn.
 * @param usageMetrics - Its kernel, and whether reference bytes are measured (Tau's own tools only).
 * @returns The `context` the entry carries.
 */
const contextOf = (
  facts: TurnFacts,
  usageMetrics: Readonly<{ kernelId: AgentTurnContext['kernelId']; measuresBytes: boolean }>,
): AgentTurnContext => {
  const { context } = facts;
  const { geospec } = context;
  return {
    kernelId: usageMetrics.kernelId,
    skillsActivated: [...context.skills].slice(0, 8),
    ...(context.firstWrite === undefined
      ? {}
      : {
          callsBeforeFirstModelWrite: context.firstWrite.calls,
          timeToFirstModelWrite: context.firstWrite.elapsed,
        }),
    referenceLookups: countsOf(context.lookups, 'outcome'),
    ...(usageMetrics.measuresBytes ? { referenceBytesRead: context.referenceBytes } : {}),
    evaluations: countsOf(context.evaluations, 'class'),
    correctionsAfterError: context.corrections,
    ...(geospec.runs === 0
      ? {}
      : {
          geospec: {
            runs: geospec.runs,
            passed: geospec.passed,
            failed: geospec.failed,
            runStatuses: countsOf(geospec.statuses, 'status'),
          },
        }),
  };
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
    /** Present only with usage-metrics consent: the entry then carries `context` and names Tau's own tools. */
    usageMetrics?: AgentTurnUsageMetrics;
    /** Called once, when the host has logged the run: the turn was accepted, not just composed. */
    onAccepted?: () => void;
  }>,
): void => {
  const { runId, identity, source, usageMetrics, onAccepted } = options;
  if (tracked.has(runId)) {
    return;
  }
  tracked.add(runId);
  const now = options.now ?? (() => performance.now());
  const report = options.report ?? defaultReport;
  const admittedAt = options.admittedAt ?? now();
  const facts = createTurnFacts(() => Math.max(0, now() - admittedAt));
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
        ...toolCallsOf(facts, usageMetrics !== undefined),
        ...tokensOf(facts),
        ...(usageMetrics === undefined
          ? {}
          : {
              context: contextOf(facts, { kernelId: usageMetrics.kernelId, measuresBytes: identity.agentId === 'tau' }),
            }),
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

/** What the admitting surface knows about consent and the kernel the turn runs on. @public */
export type AgentTurnConsent = Readonly<{ kernelId: string; allowsUsageMetrics: boolean }>;

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
 * @returns `begin` per admission (with the person's consent and the turn's kernel), and `end` when the surface
 *   leaves the chat.
 * @public
 */
export const createAgentUsageTelemetry = (
  source: AgentTurnSource,
  report: AgentTelemetryReport = defaultReport,
): Readonly<{
  begin: (execution: CadAgentExecution, consent: AgentTurnConsent) => AgentTurnTelemetry;
  end: () => void;
}> => {
  const session = createAgentSessionTracker(report);
  return {
    begin(execution, consent) {
      const admittedAt = performance.now();
      const usageMetrics: AgentTurnUsageMetrics | undefined =
        consent.allowsUsageMetrics && knownKernels.has(consent.kernelId)
          ? { kernelId: consent.kernelId as AgentTurnUsageMetrics['kernelId'] }
          : undefined;
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
                ...(usageMetrics === undefined ? {} : { usageMetrics }),
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
