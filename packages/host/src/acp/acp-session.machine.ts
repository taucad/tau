/**
 * `acpSession` — one vendor ACP session, from the adapter's spawn to its exit (W10 EA-S5).
 *
 * One child per key (`${agentId}:${chatId}`) of the parent `acpSessions`. It
 * restores the session (resume, else load, else create), lends itself to one
 * turn at a time, and closes through **one ladder**: `session/close` when the
 * agent advertises it (E13), SIGTERM to the adapter's process group, SIGKILL
 * after E17, and the E18 backstop, which kills again before it ends the state
 * (EA-R7). A cancel is settled, not assumed: the turn is answered after the
 * vendor's own answer or, past E22, from `closed`, after SIGKILL (EA-R8).
 *
 * The machine is pure. Its effects are four provided actors:
 * - `adapterConnection` (root): the adapter's process group and ACP
 *   connection; frames in and out, SIGTERM and SIGKILL on command.
 * - `lentTurn` (`busy`): the lent turn's seams — the MCP binding, the log
 *   projection (its text checkpoint is E23), approvals, logins, file requests,
 *   and `remember`. The seams are looked up by request id, so no function
 *   enters context (MC-R5).
 * - `publishSkills` (`starting`): the skill publication's directories.
 * - `persistPresentation` (`idle.persisting`): one presentation write between turns.
 *
 * Reports go to `parentRef` (MC-R11) or, with no parent, are emitted: `opened`,
 * `turnEnded` and, from the final state, `closed`.
 */

import { createAsyncLogic, createCallbackLogic, setup, types } from 'xstate';
import type { AnyActorRef } from 'xstate';
import type {
  AgentRequestParamsByMethod,
  AgentRequestResponsesByMethod,
  ClientRequestParamsByMethod,
  ClientRequestResponsesByMethod,
  ContentBlock,
  McpServer,
  SessionConfigOption,
  SessionUpdate,
  Usage as AcpUsage,
} from '@agentclientprotocol/sdk';

import type { JsonObject } from '@taucad/agent-host';
import type { ExternalAgentStop } from '@taucad/agent-host/wire';

import {
  advertised,
  airSessionFailureOf,
  asJson,
  asRecord,
  authRequiredCode,
  claudeLimitReset,
  clientCapabilities,
  codexLimitReset,
  confirmedConfiguration,
  emptySessionPresentation,
  isPresent,
  limitWithReset,
  loginOf,
  modelChoice,
  presentationAfter,
  protocolVersion,
  providerSentence,
  recoverableSessionLoss,
} from '#acp/session.js';
import type { AcpAgentFacts, AcpLimitReset, AcpSessionFailure, AcpSessionPresentation } from '#acp/session.js';
import type { AcpAdapter } from '#acp/registry.js';
import {
  busyContextSchema,
  closingContextSchema,
  childContextSchema as contextSchema,
  childEventSchemas as eventSchemas,
  reportSchemas,
} from '#acp/acp-machine-schemas.js';
import type { AcpBusyContext, AcpSessionContext, AcpSessionEvent } from '#acp/acp-machine-schemas.js';

/** E16: milliseconds the adapter has to spawn, initialize and restore before it is closed. */
export const acpStartTimeout = 30_000;
/** E13: milliseconds `session/close` is waited on before the ladder signals the group. */
export const sessionCloseTimeout = 2000;
/** E17: milliseconds from SIGTERM to SIGKILL of the adapter's process group. */
export const acpKillGrace = 2000;
/** E18: milliseconds `closing.terminating` may last; its handler kills again, then ends it. */
export const acpTerminateBackstop = 5000;
/** E22: milliseconds a cancelled turn waits for the vendor to settle its outstanding call. */
export const acpCancelSettleTimeout = 2000;

/** The `AcpSessions.tla` action a transition refines (MC-R27). */
export type AcpSessionsAction =
  | 'Acquire'
  | 'Opened'
  | 'Bound'
  | 'PromptAnswered'
  | 'TurnEnded'
  | 'IdleExpired'
  | 'CloseChat'
  | 'AdapterExited'
  | 'Cancel'
  | 'CancelBinding'
  | 'CancelSettled'
  | 'CancelTimedOut'
  | 'Dequeued'
  | 'CancelQueued'
  /** A step that leaves the spec's abstraction unchanged (the spec's `Stutter`). */
  | 'Stutter'
  /** A path the spec does not model: a fault, an adapter crash, a vendor refusal (the spec's `Unmodelled`). */
  | 'Unmodelled';

/** A refusal or failure, JSON-safe, as a run records it. */
export type AcpFailure = {
  readonly code: string;
  readonly message: string;
  readonly details?: JsonObject | undefined;
  readonly login?: JsonObject | undefined;
};

/** How a lent turn ended. */
export type AcpTurnResult =
  | { readonly ok: true; readonly stopReason: string; readonly title?: string | undefined }
  | { readonly ok: false; readonly failure: AcpFailure };

/** One turn lent to a resting (or opening) child. */
export type AcpLend = {
  /** `${runId}:${attempt}` (D15): the settlement and every cancel name it. */
  readonly requestId: string;
  readonly model?: string | undefined;
  readonly configuration?: Readonly<Record<string, string | boolean>> | undefined;
  /** The prompt for the session the record names, and for any other (a fresh one carries Tau's context). */
  readonly prompt: {
    readonly reattached?: readonly ContentBlock[] | undefined;
    readonly fresh?: readonly ContentBlock[] | undefined;
  };
  /** The chat's record as the turn read it: its session id, title and limit. */
  readonly record?: JsonObject | undefined;
};

/** What a child is spawned with, besides its first lend. */
export type AcpOpening = {
  readonly adapter: AcpAdapter;
  readonly cwd: string;
  readonly mcpServers: readonly McpServer[];
  /** The session the record names, to resume or load. */
  readonly acpSessionId?: string | undefined;
  readonly priorUsage?: AcpUsage | undefined;
  readonly limit?: AcpLimitReset | undefined;
  /** The chat's replaceable `acp-session` envelope. */
  readonly sessionMessageId: string;
  readonly sessionCommitted: boolean;
  /** The record named a directory this child does not run in (r1 risk 7). */
  readonly cwdMoved?: boolean | undefined;
  /** The revision mode the opening turn runs in, recorded on the record. */
  readonly mode?: string | undefined;
  /** Whether a fresh start appends a notice to the chat (the port does; `openAcpSession` does not). */
  readonly notices: boolean;
  /** The MCP capability this child's server list carries; each lend binds it (EA-R6). */
  readonly capabilityToken?: string | undefined;
};

/** Input of {@link acpSessionMachine}. */
export type AcpSessionInput = {
  readonly key: string;
  readonly parentRef?: AnyActorRef | undefined;
  readonly opening: AcpOpening;
  readonly lend?: AcpLend | undefined;
};

/** A failed ACP call, as the connection saw it. */
export type AcpCallError = {
  readonly message: string;
  readonly code?: string | number | undefined;
  readonly details?: JsonObject | undefined;
  readonly stderr: string;
};

/** The agent methods a child calls. */
export type AcpCallMethod =
  | 'initialize'
  | 'session/new'
  | 'session/load'
  | 'session/resume'
  | 'session/set_config_option'
  | 'session/prompt'
  | 'session/close';

/** A settled call's result, by method. */
export type AcpAnswer = {
  [M in AcpCallMethod]: { readonly method: M; readonly result: AgentRequestResponsesByMethod[M] };
}[AcpCallMethod];

/** The client methods an agent calls on a child. */
export type AcpVendorMethod =
  | 'session/request_permission'
  | 'fs/read_text_file'
  | 'fs/write_text_file'
  | 'elicitation/create';

/** One vendor request, by method. */
export type AcpVendorRequest = {
  [M in AcpVendorMethod]: { readonly method: M; readonly params: ClientRequestParamsByMethod[M] };
}[AcpVendorMethod];

/** A vendor request's answer: its result, or a refusal. */
export type AcpVendorAnswer =
  | { readonly result: ClientRequestResponsesByMethod[AcpVendorMethod] }
  | { readonly error: { readonly message: string; readonly code: string } };

/** Input of the `adapterConnection` actor. */
export type AcpConnectionInput = { readonly adapter: AcpAdapter; readonly cwd: string };

/** Commands the connection receives. */
export type AcpConnectionCommand =
  | {
      [M in AcpCallMethod]: {
        readonly type: 'call';
        readonly id: string;
        readonly method: M;
        readonly params: AgentRequestParamsByMethod[M];
      };
    }[AcpCallMethod]
  | { readonly type: 'notify'; readonly method: 'session/cancel'; readonly params: { readonly sessionId: string } }
  | ({ readonly type: 'respond'; readonly id: string } & AcpVendorAnswer)
  | { readonly type: 'terminate' }
  | { readonly type: 'kill' };

/** Input of the `lentTurn` actor. */
export type AcpLentTurnInput = {
  readonly requestId: string;
  readonly key: string;
  readonly adapter: AcpAdapter;
  readonly cwd: string;
  readonly sessionMessageId: string;
  readonly sessionCommitted: boolean;
  readonly presentation: AcpSessionPresentation;
  readonly priorUsage?: AcpUsage | undefined;
  readonly tauMcp: boolean;
  readonly capabilityToken?: string | undefined;
  /** The first lend after an open: the record written first, and the notice a fresh start owes the reader. */
  readonly opening?: { readonly record: JsonObject; readonly notice?: string | undefined } | undefined;
};

/** Commands the lent turn receives. */
export type AcpLentTurnCommand =
  | { readonly type: 'update'; readonly update: SessionUpdate }
  | { readonly type: 'sessionState'; readonly presentation: AcpSessionPresentation }
  | ({ readonly type: 'serve'; readonly id: string } & AcpVendorRequest)
  | { readonly type: 'loginComplete'; readonly elicitationId: string }
  | {
      readonly type: 'flush';
      readonly report?: { readonly usage?: AcpUsage | undefined; readonly model?: string | undefined } | undefined;
    }
  | { readonly type: 'record'; readonly record: JsonObject; readonly required: boolean };

/** Input of the `persistPresentation` actor. */
export type AcpPresentationInput = {
  readonly key: string;
  readonly agentId: string;
  readonly sessionMessageId: string;
  readonly sessionCommitted: boolean;
  readonly presentation: AcpSessionPresentation;
};

/** A report to the parent. */
export type AcpSessionReport =
  | { readonly type: 'opened'; readonly key: string }
  | {
      readonly type: 'turnEnded';
      readonly key: string;
      readonly requestId: string;
      readonly outcome: AcpTurnResult;
      /** False when the child closes after this turn. */
      readonly resting: boolean;
    }
  | { readonly type: 'closed'; readonly key: string; readonly failure: AcpFailure | undefined };

type Report = AcpSessionReport;
type ProbeReport = {
  readonly type: 'modelProbed';
  readonly requestId: string;
  readonly configOptions: readonly SessionConfigOption[] | undefined;
  readonly failure: AcpFailure | undefined;
};

/* What the pure helpers enqueue: sends to the two invoked children or the parent, and reports. */
type Enqueue = {
  sendTo(target: 'connection', event: AcpConnectionCommand): void;
  sendTo(target: 'lentTurn', event: AcpLentTurnCommand): void;
  sendTo(target: AnyActorRef, event: Report): void;
  emit(event: Report | ProbeReport): void;
  raise(
    event: { readonly type: 'killDue' },
    options: { readonly id: string } & Readonly<Record<'delay', number>> /* E17: acpKillGrace */,
  ): void;
};

/*
 * The machine's handlers name their parameters: an inline handler's are expanded from the whole
 * setup, once per handler, which overflows declaration emit (TS7056; xstate-policy K-17).
 */
type On<K extends AcpSessionEvent['type'], C = AcpSessionContext> = Readonly<{
  context: C;
  event: Extract<AcpSessionEvent, Readonly<{ type: K }>>;
}>;
type Held<C = AcpSessionContext> = Readonly<{ context: C }>;
type Faulted<C = AcpSessionContext> = Readonly<{ context: C; event: Readonly<{ error: unknown }> }>;
type ClosingContext = AcpSessionContext & { readonly deferred?: Report | undefined };

/**
 * Events a state takes on purpose without a transition (MC-R17).
 *
 * @internal
 */
export const acpSessionIgnoredEvents = {
  acpSession: [
    ['busy.cancelling', 'cancel'],
    ['busy.flushing', 'cancel'],
    ['busy.recording', 'cancel'],
    ['closing', 'cancel'],
    ['closing', 'close'],
  ],
} as const satisfies Readonly<Record<string, ReadonlyArray<readonly [state: string, eventType: string]>>>;

/**
 * `{ to, meta }` (MC-R27), typed as its transition function.
 * ponytail: alpha.59's `setup` types omit the `{ to, meta }` form the runtime takes (k9); drop the cast when xstate types it.
 *
 * @param tla - The `AcpSessions.tla` action the transition refines.
 * @param to - The transition function.
 * @returns The transition, carrying its static meta.
 * @internal
 */
export const refines = <F>(tla: AcpSessionsAction, to: F): F =>
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above.
  ({ meta: { tla }, to }) as unknown as F;

const tell = (context: AcpSessionContext, enq: Enqueue, report: Report): void => {
  if (context.parentRef === undefined) {
    enq.emit(report);
  } else {
    enq.sendTo(context.parentRef, report);
  }
};

/* Ask the agent one thing; the state waits on this id. */
const ask = <M extends AcpCallMethod>(
  context: AcpSessionContext,
  enq: Enqueue,
  { method, params }: { readonly method: M; readonly params: AgentRequestParamsByMethod[M] },
) => {
  const id = String(context.calls);
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- `M` is one member of the correlated command union.
  enq.sendTo('connection', { type: 'call', id, method, params } as AcpConnectionCommand);
  return { calls: context.calls + 1, pending: id };
};

const respond = (enq: Enqueue, id: string, answer: AcpVendorAnswer): void => {
  enq.sendTo('connection', { type: 'respond', id, ...answer });
};

const answers = (context: AcpSessionContext, id: string): boolean => context.pending === id;

/* An empty list that stays mutable under `as const` returns. */
const none: string[] = [];

const failed = (failure: AcpFailure): AcpTurnResult => ({ ok: false, failure });

const cancelled: AcpFailure = {
  code: 'EXTERNAL_AGENT_CANCELLED',
  message: 'The external agent turn was cancelled.',
};

/**
 * The thrown form of a failure, as a run records it.
 *
 * @param failure - The JSON-safe failure.
 * @returns An error carrying its code and details.
 * @internal
 */
export const failureError = (failure: AcpFailure): Error =>
  Object.assign(new Error(failure.message), {
    code: failure.code,
    ...(failure.details === undefined ? {} : { details: failure.details }),
    ...(failure.login === undefined ? {} : { login: failure.login }),
  });

/**
 * The failure an error thrown by a seam stands for: its own code, or a generic stop.
 *
 * @param error - Whatever the seam threw.
 * @param adapter - The agent the turn ran on.
 * @returns The failure to record.
 * @internal
 */
export const failureOfError = (error: unknown, adapter: Pick<AcpAdapter, 'id' | 'displayName'>): AcpFailure => {
  const code = asRecord(error)?.['code'];
  const message = error instanceof Error ? error.message : String(error);
  if (typeof code === 'string') {
    const details = asRecord(asRecord(error)?.['details']);
    return {
      code,
      message,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- a coded Tau error carries JSON details.
      ...(details === undefined ? {} : { details: details as JsonObject }),
    };
  }
  const details: ExternalAgentStop = {
    agentId: adapter.id,
    failure: { category: 'internal', title: message, actions: ['retry'] },
  };
  return {
    code: 'EXTERNAL_AGENT_FAILED',
    message: `${adapter.displayName} stopped unexpectedly: ${message}`,
    details: asJson(details) as JsonObject,
  };
};

/*
 * Codex refuses a model the account's login cannot run only in prose ("The 'x'
 * model is not supported when using Codex with a ChatGPT account."); no AIR
 * category or code marks it, and retrying it can never succeed.
 */
const modelRefused = (text: string): boolean => /\bmodel is not supported\b/iu.test(text);

const authRequired = (context: AcpSessionContext): AcpFailure => ({
  code: 'EXTERNAL_AGENT_AUTH_REQUIRED',
  message: `${context.adapter.id} is not logged in. Sign in to it on the machine running this agent, then try again.`,
  // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the login is a JSON record.
  login: asJson(loginOf(context.adapter, context.facts.authMethods)) as JsonObject,
});

/*
 * A refusal the user can act on, or the vendor failure that is left over.
 *
 * A Tau code *is* the answer; JSON-RPC `-32000` is the logged-out case; the rest
 * is a genuine failure whose stderr tail rides beside it as diagnostics.
 */
const failureOfCall = (context: AcpSessionContext, error: AcpCallError): AcpFailure => {
  if (typeof error.code === 'string') {
    return { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) };
  }
  if (error.code === authRequiredCode) {
    return authRequired(context);
  }
  const details: ExternalAgentStop = {
    agentId: context.adapter.id,
    failure: { category: 'internal', title: error.message, actions: ['retry'] },
    ...(error.stderr === '' ? {} : { diagnostics: error.stderr }),
  };
  if (modelRefused(error.message)) {
    return { code: 'EXTERNAL_AGENT_MODEL_UNAVAILABLE', message: error.message };
  }
  return {
    code: 'EXTERNAL_AGENT_FAILED',
    message: `${context.adapter.displayName} stopped unexpectedly: ${error.message}`,
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the stop is a JSON record.
    details: asJson(details) as JsonObject,
  };
};

const exitFailure = (context: AcpSessionContext, stderr: string): AcpFailure =>
  failureOfCall(context, { message: 'the adapter exited', stderr });

/*
 * The coded failure for a stop the agent classified itself (AIR `sessionFailure`).
 * A limit carries its reset while it is still ahead of `at`; Codex's reset is held
 * like Claude's so the record carries it past this stop (W10 F8).
 */
const stopped = (
  context: AcpSessionContext,
  stop: AcpSessionFailure,
  { meta, at }: { readonly meta: unknown; readonly at: number },
): { readonly failure: AcpFailure; readonly limit: AcpLimitReset | undefined } => {
  if (stop.category === 'access') {
    return { failure: authRequired(context), limit: context.limit };
  }
  const title = providerSentence(stop.title);
  const limit = codexLimitReset(meta) ?? context.limit;
  const reset = limitWithReset(stop) ? limit : undefined;
  const details: ExternalAgentStop = {
    agentId: context.adapter.id,
    failure: { category: stop.category, title, actions: stop.actions },
    ...(reset && reset.resetsAt * 1000 > at ? reset : {}),
  };
  return {
    failure: {
      code:
        stop.category === 'limit'
          ? 'EXTERNAL_AGENT_LIMIT_REACHED'
          : modelRefused(title)
            ? 'EXTERNAL_AGENT_MODEL_UNAVAILABLE'
            : 'EXTERNAL_AGENT_FAILED',
      message: title,
      // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- the stop is a JSON record.
      details: asJson(details) as JsonObject,
    },
    limit,
  };
};

const unavailable = (message: string): AcpFailure => ({ code: 'EXTERNAL_AGENT_UNAVAILABLE', message });

/* The directories and Grok's plugin roots every lifecycle call names. */
const lifecycleDirectories = (context: AcpSessionContext) => {
  const capabilities = context.facts.agentCapabilities;
  const supportsDirectories = advertised(capabilities?.sessionCapabilities?.additionalDirectories);
  const supportsPluginDirectories = context.pluginDirectories;
  const { directories } = context;
  return {
    ...(supportsDirectories && directories.length > 0 ? { additionalDirectories: [...directories] } : {}),
    ...(supportsPluginDirectories
      ? {
          _meta: {
            /* Tau's revision host owns the working tree for both resume and load. */
            'x.ai/restore_code': false,
            ...(directories.length > 0 ? { pluginDirs: directories.map((directory) => `${directory}/.agents`) } : {}),
          },
        }
      : {}),
  };
};

/* A capability the agent lacks, or `undefined` when it can host this session. */
const refusalOf = (context: AcpSessionContext): AcpFailure | undefined => {
  const { facts, adapter } = context;
  if (facts.protocolVersion !== protocolVersion) {
    return unavailable(
      `${adapter.id} speaks ACP version ${String(facts.protocolVersion)}; this Tau Host speaks ${String(protocolVersion)}. Update one of them.`,
    );
  }
  const capabilities = facts.agentCapabilities;
  if (
    context.directories.length > 0 &&
    !advertised(capabilities?.sessionCapabilities?.additionalDirectories) &&
    !context.pluginDirectories
  ) {
    return unavailable(`${adapter.id} does not support ACP additional directories required for Tau skills.`);
  }
  if (
    context.mcpServers.some((server) => 'type' in server && server.type === 'http') &&
    capabilities?.mcpCapabilities?.http !== true
  ) {
    return unavailable(`${adapter.id} does not support the HTTP MCP server required by Tau.`);
  }
  return undefined;
};

type Rung = 'resuming' | 'loading' | 'creating';

/* The restore ladder as a total choice (W2 form c): resume, else load, else create. */
const restore = (
  context: AcpSessionContext,
  enq: Enqueue,
  { from, patch = {} }: { readonly from: Rung; readonly patch?: Partial<AcpSessionContext> },
) => {
  const next = { ...context, ...patch };
  const capabilities = next.facts.agentCapabilities;
  const sessionId = next.acpSessionId;
  const params = { cwd: next.cwd, mcpServers: [...next.mcpServers], ...lifecycleDirectories(next) };
  if (sessionId !== undefined && from === 'resuming' && advertised(capabilities?.sessionCapabilities?.resume)) {
    return {
      target: '#opening.resuming',
      context: { ...patch, ...ask(next, enq, { method: 'session/resume', params: { sessionId, ...params } }) },
    } as const;
  }
  if (sessionId !== undefined && from !== 'creating' && capabilities?.loadSession === true) {
    return {
      target: '#opening.loading',
      context: { ...patch, ...ask(next, enq, { method: 'session/load', params: { sessionId, ...params } }) },
    } as const;
  }
  /* Never a silent fresh start: `contextLost` appends the notice once. */
  return {
    target: '#opening.creating',
    context: {
      ...patch,
      contextLost: sessionId !== undefined,
      priorUsage: undefined,
      ...ask(next, enq, { method: 'session/new', params }),
    },
  } as const;
};

type SessionAnswer = Pick<AgentRequestResponsesByMethod['session/new'], 'configOptions' | 'modes'>;

/* The session the restore ladder answered with, as context. */
const adopt = (context: AcpSessionContext, sessionId: string, answer: SessionAnswer) => {
  const configOptions = answer.configOptions ?? undefined;
  const modeId = answer.modes?.currentModeId ?? context.presentation.modeId;
  return {
    acpSessionId: sessionId,
    configOptions,
    presentation: {
      ...context.presentation,
      sessionId,
      configOptions: (configOptions ?? []).map((option) => asJson(option)),
      ...(modeId === undefined ? {} : { modeId }),
      ...(isPresent(answer.modes) ? { modes: answer.modes.availableModes.map((mode) => asJson(mode)) } : {}),
    },
  };
};

const stringField = (record: JsonObject | undefined, name: string): string | undefined => {
  const value = record?.[name];
  return typeof value === 'string' ? value : undefined;
};

const usageState = (usage: AcpUsage): JsonObject => ({
  totalTokens: usage.totalTokens,
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  ...(typeof usage.thoughtTokens === 'number' ? { thoughtTokens: usage.thoughtTokens } : {}),
  ...(typeof usage.cachedReadTokens === 'number' ? { cachedReadTokens: usage.cachedReadTokens } : {}),
  ...(typeof usage.cachedWriteTokens === 'number' ? { cachedWriteTokens: usage.cachedWriteTokens } : {}),
});

/**
 * The chat's ACP session record, whole (W10 EA-R9).
 *
 * The host reads the newest marker that names a session (`externalSessionOf`),
 * so a partial record on a later turn would read back as the opening turn's
 * stale one (F7, F8). What the session owns is its current value; a title it
 * has not re-proposed is carried from the record, and a lifted limit is written
 * as `null` because `remember` merges.
 *
 * @param context - The child.
 * @param lent - The turn whose record this is.
 * @returns The record `remember` writes.
 * @internal
 */
export const sessionRecordOf = (context: AcpSessionContext, lent: AcpLend): JsonObject => {
  const prior = lent.record;
  const model = modelChoice(context.configOptions)?.currentValue ?? lent.model;
  const title = context.presentation.title ?? stringField(prior, 'title');
  const { limit } = context;
  return {
    acpSessionId: context.acpSessionId ?? '',
    acpPromptedRequestId: context.promptedRequestId ?? null,
    cwd: context.cwd,
    ...(context.mode === undefined ? {} : { mode: context.mode }),
    ...(model === undefined ? {} : { model }),
    config: confirmedConfiguration(context.configOptions),
    ...(context.priorUsage === undefined ? {} : { acpPriorUsage: usageState(context.priorUsage) }),
    ...(title === undefined ? {} : { title }),
    ...(limit === undefined
      ? asRecord(prior?.['limit']) === undefined
        ? {}
        : { limit: null }
      : { limit: { resetsAt: limit.resetsAt, ...(limit.window === undefined ? {} : { window: limit.window }) } }),
  };
};

/*
 * The prompt blocks this agent can actually receive (V12): media it cannot read
 * is refused, never silently dropped; text resources degrade to text.
 */
const sendable = (context: AcpSessionContext, blocks: readonly ContentBlock[]): ContentBlock[] | AcpFailure => {
  const promptCapabilities = context.facts.agentCapabilities?.promptCapabilities;
  const media = blocks.find(
    (block) => (block.type === 'image' || block.type === 'audio') && promptCapabilities?.[block.type] !== true,
  );
  const refuse = (what: string): AcpFailure => ({
    code: 'EXTERNAL_AGENT_CONTENT_UNSUPPORTED',
    message: `${context.adapter.id} cannot read ${what}, so this turn was not sent. Describe it in text, or run it on an agent that can.`,
  });
  if (media) {
    return refuse(`${media.type} content`);
  }
  if (promptCapabilities?.embeddedContext === true) {
    return [...blocks];
  }
  if (blocks.some((block) => block.type === 'resource' && 'blob' in block.resource)) {
    return refuse('embedded binary content');
  }
  return blocks.map((block) =>
    block.type === 'resource' && 'text' in block.resource
      ? { type: 'text', text: `[${block.resource.uri}]\n${block.resource.text}` }
      : block,
  );
};

/* The prompt for this lend, or the refusal a restart's ambiguity earns. */
const promptOf = (context: AcpSessionContext, lent: AcpLend): readonly ContentBlock[] | AcpFailure => {
  const reattached = context.acpSessionId === stringField(lent.record, 'acpSessionId');
  const prompt = reattached ? lent.prompt.reattached : lent.prompt.fresh;
  return (
    prompt ?? {
      code: 'EXTERNAL_AGENT_RECOVERY_UNKNOWN',
      message: "Tau could not reopen the agent's earlier session, so this turn cannot continue where it stopped.",
    }
  );
};

type ConfigStep =
  | { readonly configId: string; readonly params: AgentRequestParamsByMethod['session/set_config_option'] }
  | { readonly failure: AcpFailure }
  | undefined;

/*
 * The next `session/set_config_option` this turn needs, a refusal, or none.
 * Refused, never ignored: the alternative is billing the person's account for a
 * model they did not choose. Each option is set at most once per turn.
 */
const configStep = (context: AcpSessionContext, lent: AcpLend, configured: readonly string[]): ConfigStep => {
  const { model, configuration } = lent;
  const { adapter, configOptions } = context;
  const sessionId = context.acpSessionId ?? '';
  if (model !== undefined) {
    const choice = modelChoice(configOptions);
    if (!choice?.values.includes(model)) {
      return {
        failure: {
          code: 'EXTERNAL_AGENT_MODEL_UNAVAILABLE',
          message: `${adapter.id} does not offer the model "${model}". It offers: ${(choice?.values ?? []).join(', ') || 'none'}.`,
        },
      };
    }
    if (choice.currentValue !== model && !configured.includes(choice.configId)) {
      return { configId: choice.configId, params: { sessionId, configId: choice.configId, value: model } };
    }
  }
  for (const [configId, value] of Object.entries(configuration ?? {})) {
    const option = configOptions?.find((candidate) => candidate.id === configId);
    if (option?.category === 'model' && model !== undefined && value !== model) {
      return {
        failure: {
          code: 'EXTERNAL_AGENT_CONFIG_UNAVAILABLE',
          message: `${adapter.id} received conflicting model selections: ${model} and ${String(value)}.`,
        },
      };
    }
    const accepted =
      option?.type === 'boolean'
        ? typeof value === 'boolean'
        : option?.type === 'select' &&
          typeof value === 'string' &&
          option.options.some((entry) =>
            ('options' in entry ? entry.options : [entry]).some((candidate) => candidate.value === value),
          );
    if (!accepted || !option) {
      return {
        failure: {
          code: 'EXTERNAL_AGENT_CONFIG_UNAVAILABLE',
          message: `${adapter.id} does not offer configuration ${configId}=${String(value)}.`,
        },
      };
    }
    if (option.currentValue !== value && !configured.includes(option.id)) {
      return {
        configId: option.id,
        params:
          typeof value === 'boolean'
            ? { sessionId, configId: option.id, type: 'boolean', value }
            : { sessionId, configId: option.id, value },
      };
    }
  }
  return undefined;
};

/* The fold every `session/update` gets, whatever state it lands in. */
const folded = (context: AcpSessionContext, update: SessionUpdate) => ({
  presentation: presentationAfter(context.presentation, update),
  ...(update.sessionUpdate === 'config_option_update' ? { configOptions: update.configOptions } : {}),
  ...(update.sessionUpdate === 'usage_update' ? { limit: claudeLimitReset(context.limit, update._meta) } : {}),
});

const ownUpdate = (context: AcpSessionContext, sessionId: string): boolean =>
  context.acpSessionId === undefined || sessionId === context.acpSessionId;

/* A vendor request with no lent turn to serve it: the answer ACP expects. */
const refuseVendor = (enq: Enqueue, id: string, request: AcpVendorRequest): void => {
  switch (request.method) {
    case 'session/request_permission': {
      respond(enq, id, { result: { outcome: { outcome: 'cancelled' } } });
      return;
    }
    case 'elicitation/create': {
      respond(enq, id, { result: { action: 'decline' } });
      return;
    }
    default: {
      respond(enq, id, {
        error: {
          message: 'This ACP filesystem request has no active session turn.',
          code: 'EXTERNAL_AGENT_INVALID_SESSION',
        },
      });
    }
  }
};

const sessionOf = (request: AcpVendorRequest): string | undefined =>
  'sessionId' in request.params && typeof request.params.sessionId === 'string' ? request.params.sessionId : undefined;

const lend = (lent: AcpLend) =>
  ({
    target: '#busy',
    context: {
      lent,
      outcome: undefined,
      configured: none,
      promptedRequestId: undefined,
      permissions: none,
      report: undefined,
      answered: undefined,
      closeAfter: false,
      deferEnd: false,
      opening: undefined,
      queued: undefined,
    },
  }) as const;

/* The open answered: report it, then lend the opening turn or rest. */
const opened = (context: AcpSessionContext, enq: Enqueue, patch: Partial<AcpSessionContext>) => {
  tell(context, enq, { type: 'opened', key: context.key });
  const next = { ...patch, pending: undefined, fresh: true };
  if (context.opening === undefined) {
    return { target: '#idle', context: next } as const;
  }
  const lent = lend(context.opening);
  return { target: lent.target, context: { ...next, ...lent.context } } as const;
};

/* Enter the close ladder: `session/close` when advertised, then the group signals. */
const close = (context: AcpSessionContext, enq: Enqueue, patch: Partial<AcpSessionContext & { deferred: Report }>) => {
  const next = { ...context, ...patch };
  if (next.exited) {
    return { target: '#closed', context: patch } as const;
  }
  const sessionId = next.acpSessionId;
  if (
    sessionId !== undefined &&
    next.presentation.sessionId !== undefined &&
    advertised(next.facts.agentCapabilities?.sessionCapabilities?.close)
  ) {
    return {
      target: '#closing.ending',
      context: { ...patch, ...ask(next, enq, { method: 'session/close', params: { sessionId } }) },
    } as const;
  }
  return { target: '#closing.terminating', context: { ...patch, pending: undefined } } as const;
};

/* Answer a lend still waiting in `idle` as cancelled; true when there was one. */
const dropQueued = (context: AcpSessionContext, enq: Enqueue): boolean => {
  if (context.queued === undefined) {
    return false;
  }
  tell(context, enq, {
    type: 'turnEnded',
    key: context.key,
    requestId: context.queued.requestId,
    outcome: failed(cancelled),
    resting: true,
  });
  return true;
};

/* An open that will not finish: answer its turn at once and close (no vendor turn, no binding). */
const abandonOpen = (context: AcpSessionContext, enq: Enqueue, failure: AcpFailure) => {
  if (context.opening !== undefined) {
    tell(context, enq, {
      type: 'turnEnded',
      key: context.key,
      requestId: context.opening.requestId,
      outcome: failed(failure),
      resting: false,
    });
  }
  return close(context, enq, { failure, opening: undefined, exited: context.exited });
};

/* Answer every permission request still waiting on the person: `cancelled`, as ACP requires. */
const cancelPermissions = (context: AcpBusyContext, enq: Enqueue): void => {
  for (const id of context.permissions) {
    respond(enq, id, { result: { outcome: { outcome: 'cancelled' } } });
  }
};

/* Drain the turn: the projection, then the binding, then the record (EA-R6, EA-R9). */
const flush = (
  context: AcpBusyContext,
  enq: Enqueue,
  patch: Partial<AcpBusyContext> & { readonly outcome: AcpTurnResult },
) => {
  cancelPermissions(context, enq);
  enq.sendTo('lentTurn', { type: 'flush', report: patch.report ?? context.report });
  return { target: 'flushing', context: { ...patch, permissions: none, pending: undefined } } as const;
};

/* End the turn: report it now, or from `closed` once the ladder has killed the group. */
const endTurn = (context: AcpBusyContext, enq: Enqueue, outcome: AcpTurnResult) => {
  const report: Report = {
    type: 'turnEnded',
    key: context.key,
    requestId: context.lent.requestId,
    outcome,
    resting: !context.closeAfter,
  };
  if (context.deferEnd) {
    return close(context, enq, { deferred: report });
  }
  tell(context, enq, report);
  return context.closeAfter ? close(context, enq, {}) : ({ target: '#idle', context: {} } as const);
};

/*
 * A close under a lent turn: the chat is done with this session, so the ladder starts
 * now while the turn still drains and is answered (SIGTERM, then SIGKILL after acpKillGrace).
 */
const ladder = (enq: Enqueue): void => {
  enq.sendTo('connection', { type: 'terminate' });
  enq.raise({ type: 'killDue' }, { id: 'killDue', delay: acpKillGrace });
};

/* A cancel (or a close) while the vendor is working on the turn. */
const cancelTurn = (context: AcpBusyContext, enq: Enqueue, closeAfter: boolean) => {
  enq.sendTo('connection', {
    type: 'notify',
    method: 'session/cancel',
    params: { sessionId: context.acpSessionId ?? '' },
  });
  cancelPermissions(context, enq);
  return {
    target: 'cancelling',
    context: {
      /* The call the vendor still owes; `cancelling` waits for it. */
      pending: context.pending,
      outcome: failed(cancelled),
      permissions: none,
      closeAfter: closeAfter || context.closeAfter,
    },
  } as const;
};

/* The first config call this turn needs, or the prompt itself. */
const configureOrPrompt = (context: AcpBusyContext, enq: Enqueue, patch: Partial<AcpBusyContext> = {}) => {
  const next = { ...context, ...patch };
  const step = configStep(next, next.lent, next.configured);
  if (step !== undefined && 'failure' in step) {
    return flush(next, enq, { ...patch, outcome: failed(step.failure) });
  }
  if (step !== undefined) {
    return {
      target: 'configuring',
      context: {
        ...patch,
        configured: [...next.configured, step.configId],
        ...ask(next, enq, { method: 'session/set_config_option', params: step.params }),
      },
    } as const;
  }
  const prompt = promptOf(next, next.lent);
  const blocks = 'code' in prompt ? prompt : sendable(next, prompt);
  if ('code' in blocks) {
    return flush(next, enq, { ...patch, outcome: failed(blocks) });
  }
  return {
    target: 'prompting',
    context: {
      ...patch,
      promptedRequestId: next.lent.requestId,
      ...ask(next, enq, { method: 'session/prompt', params: { sessionId: next.acpSessionId ?? '', prompt: blocks } }),
    },
  } as const;
};

const noticeOf = (context: AcpSessionContext): string | undefined => {
  if (!context.notices || !(context.contextLost || context.cwdMoved)) {
    return undefined;
  }
  return context.cwdMoved
    ? `${context.adapter.id} moved to a different Tau checkout, so it is starting a new session in that tree. Its earlier conversation remains in this chat but is not in the new agent session.`
    : `${context.adapter.id} could not restore this chat's earlier session, so it is starting a new one. Everything before this point is missing from its own context.`;
};

/*
 * The two `onDone` transitions, typed apart: alpha.59 gives an invoke's `onDone` no contextual type
 * inside a generic call, so `refines` infers them from their own signatures (k9).
 */
const skillsPublished = (
  { context, event }: { readonly context: AcpSessionContext; readonly event: { readonly output: readonly string[] } },
  enq: Enqueue,
) => {
  const directories: string[] = [...event.output];
  return {
    target: 'initializing',
    context: {
      directories,
      ...ask(context, enq, {
        method: 'initialize',
        params: {
          protocolVersion,
          clientCapabilities,
          clientInfo: { name: 'tau-host', version: '1' },
        },
      }),
    },
  } as const;
};

const presentationPersisted = ({ context }: { readonly context: AcpSessionContext }) => afterPersist(context);

const machineDefinition = setup({
  schemas: {
    context: contextSchema,
    input: types<AcpSessionInput>(),
    events: eventSchemas,
    emitted: reportSchemas,
    tags: types<'lent' | 'resting'>(),
    transitionMeta: types<{ tla: AcpSessionsAction }>(),
    children: {
      connection: types<AnyActorRef>(),
      lentTurn: types<AnyActorRef>(),
    },
  },
  /* The whole tree, so targets are checked; the lent turn exists only in `busy` (MC-R26). */
  states: {
    opening: {
      id: 'opening',
      states: {
        starting: { states: { publishing: {}, initializing: {} } },
        resuming: {},
        loading: {},
        creating: {},
      },
    },
    busy: {
      id: 'busy',
      schemas: { context: busyContextSchema },
      states: { binding: {}, configuring: {}, prompting: {}, cancelling: {}, flushing: {}, recording: {} },
    },
    idle: { id: 'idle', states: { resting: {}, probing: {}, persisting: {} } },
    closing: {
      id: 'closing',
      schemas: { context: closingContextSchema },
      states: { ending: {}, terminating: { states: { signalled: {}, killed: {} } } },
    },
    closed: { id: 'closed', type: 'final', schemas: { context: closingContextSchema } },
  },
  actors: {
    adapterConnection: createCallbackLogic<AcpConnectionCommand, AcpConnectionInput>(({ sendBack }) => {
      sendBack({ type: 'adapterExited', stderr: 'acpSession: the adapterConnection actor was not provided.' });
      return () => undefined;
    }),
    lentTurn: createCallbackLogic<AcpLentTurnCommand, AcpLentTurnInput>(({ sendBack }) => {
      sendBack({ type: 'lentFailed', failure: unavailable('acpSession: the lentTurn actor was not provided.') });
      return () => undefined;
    }),
    publishSkills: createAsyncLogic<readonly string[], undefined>({
      run: async () => [],
    }),
    persistPresentation: createAsyncLogic<void, AcpPresentationInput>({
      run: async () => undefined,
    }),
  },
});

const acpSessionMachineDefinition = machineDefinition.createMachine({
  id: 'acpSession',
  version: '2',
  context: ({ input }: Readonly<{ input: AcpSessionInput }>) => ({
    key: input.key,
    parentRef: input.parentRef,
    adapter: input.opening.adapter,
    cwd: input.opening.cwd,
    mcpServers: input.opening.mcpServers,
    ...(input.opening.capabilityToken === undefined ? {} : { capabilityToken: input.opening.capabilityToken }),
    ...(input.opening.mode === undefined ? {} : { mode: input.opening.mode }),
    notices: input.opening.notices,
    cwdMoved: input.opening.cwdMoved ?? false,
    sessionMessageId: input.opening.sessionMessageId,
    sessionCommitted: input.opening.sessionCommitted,
    directories: [],
    facts: { protocolVersion, agentCapabilities: undefined, authMethods: [], agentInfo: undefined },
    pluginDirectories: false,
    ...(input.opening.acpSessionId === undefined ? {} : { acpSessionId: input.opening.acpSessionId }),
    contextLost: false,
    fresh: false,
    configOptions: undefined,
    presentation: emptySessionPresentation,
    priorUsage: input.opening.priorUsage,
    limit: input.opening.limit,
    calls: 0,
    exited: false,
    stderr: '',
    ...(input.lend === undefined ? {} : { opening: input.lend }),
    dirty: false,
    stale: false,
  }),
  invoke: {
    id: 'connection',
    src: 'adapterConnection',
    input: ({ context }: Held) => ({ adapter: context.adapter, cwd: context.cwd }),
  },
  /*
   * A fault (MC-R12): a transition threw. The turn in hand is answered with it, and the child
   * closes through the ladder, whose connection cleanup kills the group.
   */
  onError: refines('Unmodelled', ({ context, event }: Faulted, enq: Enqueue) => {
    const failure = failureOfError(event.error, context.adapter);
    /* Root context is any state's: only `busy` holds a lent turn (MC-R26). */
    // oxlint-disable-next-line @typescript-eslint/consistent-type-assertions -- read, not narrowed, across per-state context.
    const requestId = (context as Partial<AcpBusyContext>).lent?.requestId ?? context.opening?.requestId;
    if (requestId !== undefined) {
      tell(context, enq, { type: 'turnEnded', key: context.key, requestId, outcome: failed(failure), resting: false });
    }
    return close(context, enq, { failure, opening: undefined });
  }),
  /* Anything a state does not take for itself. */
  on: {
    probeModel: refines('Stutter', ({ event }: On<'probeModel'>, enq: Enqueue) => {
      enq.emit({
        type: 'modelProbed',
        requestId: event.requestId,
        configOptions: undefined,
        failure: { code: 'CHAT_RUN_LIVE', message: 'This ACP session is not idle for model discovery.' },
      });
      return {};
    }),
    /* An answer nobody waits on: the state that asked has moved on (MC-R18). */
    callSettled: refines('Stutter', () => ({})),
    /* E17 after a cancel bound: SIGKILL the group, whatever state the child is in by now. */
    killDue: refines('Stutter', (_args: unknown, enq: Enqueue) => {
      enq.sendTo('connection', { type: 'kill' });
      return {};
    }),
    sessionUpdate: refines('Stutter', ({ context, event }: On<'sessionUpdate'>) =>
      ownUpdate(context, event.sessionId) ? { context: folded(context, event.update) } : {},
    ),
    vendorRequest: refines('Stutter', ({ event }: On<'vendorRequest'>, enq: Enqueue) => {
      refuseVendor(enq, event.id, event.request);
      return {};
    }),
    elicitationComplete: refines('Stutter', () => ({})),
    /* Stale answers of a lent turn that has already ended. */
    vendorAnswered: refines('Stutter', () => ({})),
    lentReady: refines('Stutter', () => ({})),
    lentFailed: refines('Stutter', () => ({})),
    flushed: refines('Stutter', () => ({})),
    recorded: refines('Stutter', () => ({})),
    lend: refines('Stutter', ({ context, event }: On<'lend'>, enq: Enqueue) => {
      /* Unreachable while the parent is correct: it lends only a resting child. */
      tell(context, enq, {
        type: 'turnEnded',
        key: context.key,
        requestId: event.lend.requestId,
        outcome: failed({ code: 'CHAT_RUN_LIVE', message: 'This chat already has a turn in its ACP session.' }),
        resting: true,
      });
      return {};
    }),
  },
  initial: 'opening',
  states: {
    /* No vendor turn and no binding exist yet, so a cancel or an exit answers the opening turn at once. */
    opening: {
      id: 'opening',
      on: {
        cancel: refines('Cancel', ({ context }: On<'cancel'>, enq: Enqueue) => abandonOpen(context, enq, cancelled)),
        close: refines('Cancel', ({ context }: On<'close'>, enq: Enqueue) => abandonOpen(context, enq, cancelled)),
        adapterExited: refines('AdapterExited', ({ context, event }: On<'adapterExited'>, enq: Enqueue) =>
          abandonOpen({ ...context, stderr: event.stderr, exited: true }, enq, exitFailure(context, event.stderr)),
        ),
      },
      initial: 'starting',
      states: {
        starting: {
          /* E16: acpStartTimeout bounds spawn, initialize and the skill publication. */
          timeout: acpStartTimeout,
          onTimeout: refines('Cancel', ({ context }: Held, enq: Enqueue) =>
            abandonOpen(context, enq, {
              code: 'EXTERNAL_AGENT_FAILED',
              message: `${context.adapter.displayName} did not start within ${String(acpStartTimeout / 1000)} seconds.`,
            }),
          ),
          initial: 'publishing',
          states: {
            publishing: {
              invoke: {
                src: 'publishSkills',
                onDone: refines('Stutter', skillsPublished),
                onError: refines('Unmodelled', ({ context, event }: Faulted, enq: Enqueue) =>
                  abandonOpen(context, enq, failureOfError(event.error, context.adapter)),
                ),
              },
            },
            initializing: {
              on: {
                callSettled: refines('Stutter', ({ context, event }: On<'callSettled'>, enq: Enqueue) => {
                  if (!answers(context, event.id)) {
                    return {};
                  }
                  if ('error' in event.answer) {
                    return abandonOpen(context, enq, failureOfCall(context, event.answer.error));
                  }
                  if (event.answer.method !== 'initialize') {
                    return {};
                  }
                  const initialized = event.answer.result;
                  const facts: AcpAgentFacts = {
                    protocolVersion: initialized.protocolVersion,
                    agentCapabilities: initialized.agentCapabilities,
                    authMethods: initialized.authMethods ?? [],
                    agentInfo: initialized.agentInfo ?? undefined,
                  };
                  const pluginDirectories = initialized._meta?.['x.ai/pluginDirs'] === true;
                  const next = { ...context, facts, pluginDirectories };
                  const refusal = refusalOf(next);
                  return refusal === undefined
                    ? restore(next, enq, { from: 'resuming', patch: { facts, pluginDirectories } })
                    : abandonOpen(next, enq, refusal);
                }),
              },
            },
          },
        },

        /* The restore ladder (EA-S5): a recoverable loss moves to the next rung; success opens. */
        resuming: {
          on: {
            callSettled: refines('Opened', ({ context, event }: On<'callSettled'>, enq: Enqueue) => {
              if (!answers(context, event.id)) {
                return {};
              }
              if ('error' in event.answer) {
                return recoverableSessionLoss(event.answer.error)
                  ? restore(context, enq, { from: 'loading' })
                  : abandonOpen(context, enq, failureOfCall(context, event.answer.error));
              }
              return event.answer.method === 'session/resume'
                ? opened(context, enq, adopt(context, context.acpSessionId ?? '', event.answer.result))
                : {};
            }),
          },
        },
        loading: {
          on: {
            callSettled: refines('Opened', ({ context, event }: On<'callSettled'>, enq: Enqueue) => {
              if (!answers(context, event.id)) {
                return {};
              }
              if ('error' in event.answer) {
                return recoverableSessionLoss(event.answer.error)
                  ? restore(context, enq, { from: 'creating' })
                  : abandonOpen(context, enq, failureOfCall(context, event.answer.error));
              }
              return event.answer.method === 'session/load'
                ? opened(context, enq, adopt(context, context.acpSessionId ?? '', event.answer.result))
                : {};
            }),
          },
        },
        creating: {
          on: {
            callSettled: refines('Opened', ({ context, event }: On<'callSettled'>, enq: Enqueue) => {
              if (!answers(context, event.id)) {
                return {};
              }
              if ('error' in event.answer) {
                return abandonOpen(context, enq, failureOfCall(context, event.answer.error));
              }
              return event.answer.method === 'session/new'
                ? opened(context, enq, adopt(context, event.answer.result.sessionId, event.answer.result))
                : {};
            }),
          },
        },
      },
    },

    busy: {
      id: 'busy',
      tags: ['lent'],
      invoke: {
        id: 'lentTurn',
        src: 'lentTurn',
        input: ({ context }: Held<AcpBusyContext>) => ({
          requestId: context.lent.requestId,
          key: context.key,
          adapter: context.adapter,
          cwd: context.cwd,
          sessionMessageId: context.sessionMessageId,
          sessionCommitted: context.sessionCommitted,
          presentation: context.presentation,
          ...(context.priorUsage === undefined ? {} : { priorUsage: context.priorUsage }),
          tauMcp: context.mcpServers.some((server) => server.name === 'tau'),
          ...(context.capabilityToken === undefined ? {} : { capabilityToken: context.capabilityToken }),
          ...(context.fresh
            ? { opening: { record: sessionRecordOf(context, context.lent), notice: noticeOf(context) } }
            : {}),
        }),
      },
      on: {
        sessionUpdate: refines('Stutter', ({ context, event }: On<'sessionUpdate', AcpBusyContext>, enq: Enqueue) => {
          if (!ownUpdate(context, event.sessionId)) {
            return {};
          }
          enq.sendTo('lentTurn', { type: 'update', update: event.update });
          return { context: folded(context, event.update) };
        }),
        vendorAnswered: refines('Stutter', ({ context, event }: On<'vendorAnswered', AcpBusyContext>, enq: Enqueue) => {
          if (event.permission && !context.permissions.includes(event.id)) {
            /* Already answered `cancelled` (MC-R18). */
            return {};
          }
          respond(enq, event.id, event.answer);
          return { context: { permissions: context.permissions.filter((id) => id !== event.id) } };
        }),
        elicitationComplete: refines(
          'Stutter',
          ({ event }: On<'elicitationComplete', AcpBusyContext>, enq: Enqueue) => {
            enq.sendTo('lentTurn', { type: 'loginComplete', elicitationId: event.elicitationId });
            return {};
          },
        ),
      },
      initial: 'binding',
      states: {
        /* The binding is activated and, after an open, the record and its notice are written. */
        binding: {
          on: {
            /* Bound: the binding is live, so the prompt goes out and a cancel from here is `session/cancel`. */
            lentReady: refines('Bound', ({ context }: On<'lentReady', AcpBusyContext>, enq: Enqueue) =>
              configureOrPrompt(context, enq, { fresh: false }),
            ),
            lentFailed: refines('Unmodelled', ({ context, event }: On<'lentFailed', AcpBusyContext>, enq: Enqueue) =>
              flush(context, enq, { outcome: failed(event.failure) }),
            ),
            adapterExited: refines(
              'Unmodelled',
              ({ context, event }: On<'adapterExited', AcpBusyContext>, enq: Enqueue) =>
                exitBusy(context, enq, event.stderr),
            ),
            close: refines('Cancel', ({ context }: On<'close', AcpBusyContext>, enq: Enqueue) => {
              ladder(enq);
              return flush(context, enq, { outcome: failed(cancelled), closeAfter: true });
            }),
            /* Before any prompt: no `session/cancel`, the turn ends resting (W10-F1). */
            cancel: refines('CancelBinding', ({ context }: On<'cancel', AcpBusyContext>, enq: Enqueue) =>
              flush(context, enq, { outcome: failed(cancelled) }),
            ),
            vendorRequest: refines(
              'Stutter',
              ({ context, event }: On<'vendorRequest', AcpBusyContext>, enq: Enqueue) => {
                if (event.request.method.startsWith('fs/') && sessionOf(event.request) === context.acpSessionId) {
                  enq.sendTo('lentTurn', { type: 'serve', id: event.id, ...event.request });
                } else {
                  refuseVendor(enq, event.id, event.request);
                }
                return {};
              },
            ),
          },
        },
        configuring: {
          on: {
            callSettled: refines('Stutter', ({ context, event }: On<'callSettled', AcpBusyContext>, enq: Enqueue) => {
              if (!answers(context, event.id)) {
                return {};
              }
              if ('error' in event.answer) {
                return flush(context, enq, { outcome: failed(failureOfCall(context, event.answer.error)) });
              }
              if (event.answer.method !== 'session/set_config_option') {
                return {};
              }
              const { configOptions } = event.answer.result;
              const presentation = {
                ...context.presentation,
                configOptions: configOptions.map((option) => asJson(option)),
              };
              enq.sendTo('lentTurn', { type: 'sessionState', presentation });
              return configureOrPrompt(context, enq, { configOptions, presentation, pending: undefined });
            }),
            cancel: refines('Cancel', ({ context }: On<'cancel', AcpBusyContext>, enq: Enqueue) =>
              cancelTurn(context, enq, false),
            ),
            close: refines('Cancel', ({ context }: On<'close', AcpBusyContext>, enq: Enqueue) => {
              ladder(enq);
              return cancelTurn(context, enq, true);
            }),
            adapterExited: refines(
              'Unmodelled',
              ({ context, event }: On<'adapterExited', AcpBusyContext>, enq: Enqueue) =>
                exitBusy(context, enq, event.stderr),
            ),
            vendorRequest: refines('Stutter', ({ context, event }: On<'vendorRequest', AcpBusyContext>, enq: Enqueue) =>
              serve(context, enq, event),
            ),
          },
        },
        prompting: {
          on: {
            callSettled: refines(
              'PromptAnswered',
              ({ context, event }: On<'callSettled', AcpBusyContext>, enq: Enqueue) => {
                if (!answers(context, event.id)) {
                  return {};
                }
                if ('error' in event.answer) {
                  return flush(context, enq, { outcome: failed(failureOfCall(context, event.answer.error)) });
                }
                if (event.answer.method !== 'session/prompt') {
                  return {};
                }
                const answered = event.answer.result;
                /* Read back, not echoed: the model the agent actually finished on (V6). */
                const model = modelChoice(context.configOptions)?.currentValue ?? context.lent.model;
                const report = { usage: answered.usage ?? undefined, model };
                /* A typed failure ends the turn `end_turn`: the stop reason alone would
                 * record a usage limit as a completed turn. */
                const stop = airSessionFailureOf(answered._meta);
                const ended = stop ? stopped(context, stop, { meta: answered._meta, at: event.at }) : undefined;
                return flush(context, enq, {
                  report,
                  answered: answered.usage ?? undefined,
                  outcome: ended ? failed(ended.failure) : { ok: true, stopReason: answered.stopReason },
                  ...(ended ? { limit: ended.limit } : {}),
                });
              },
            ),
            cancel: refines('Cancel', ({ context }: On<'cancel', AcpBusyContext>, enq: Enqueue) =>
              cancelTurn(context, enq, false),
            ),
            close: refines('Cancel', ({ context }: On<'close', AcpBusyContext>, enq: Enqueue) => {
              ladder(enq);
              return cancelTurn(context, enq, true);
            }),
            adapterExited: refines(
              'Unmodelled',
              ({ context, event }: On<'adapterExited', AcpBusyContext>, enq: Enqueue) =>
                exitBusy(context, enq, event.stderr),
            ),
            vendorRequest: refines('Stutter', ({ context, event }: On<'vendorRequest', AcpBusyContext>, enq: Enqueue) =>
              serve(context, enq, event),
            ),
          },
        },
        /* E22: the vendor has acpCancelSettleTimeout to settle its outstanding call. */
        cancelling: {
          timeout: acpCancelSettleTimeout,
          /* The vendor ignored `session/cancel`: the ladder starts now, while the turn drains (EA-R8).
           * SIGTERM to the group, and SIGKILL after acpKillGrace; the turn is answered from `closed`. */
          onTimeout: refines('CancelTimedOut', ({ context }: Held<AcpBusyContext>, enq: Enqueue) => {
            ladder(enq);
            return flush(context, enq, {
              outcome: context.outcome ?? failed(cancelled),
              closeAfter: true,
              deferEnd: true,
            });
          }),
          on: {
            close: refines('Stutter', (_args: unknown, enq: Enqueue) => {
              ladder(enq);
              return { context: { closeAfter: true } };
            }),
            adapterExited: refines(
              'Unmodelled',
              ({ context, event }: On<'adapterExited', AcpBusyContext>, enq: Enqueue) =>
                exitBusy(context, enq, event.stderr),
            ),
            callSettled: refines(
              'CancelSettled',
              ({ context, event }: On<'callSettled', AcpBusyContext>, enq: Enqueue) =>
                answers(context, event.id)
                  ? flush(context, enq, { outcome: context.outcome ?? failed(cancelled) })
                  : {},
            ),
          },
        },
        flushing: {
          on: {
            flushed: refines('Stutter', ({ context, event }: On<'flushed', AcpBusyContext>, enq: Enqueue) => {
              const outcome: AcpTurnResult =
                context.outcome?.ok === true
                  ? event.failure === undefined
                    ? { ...context.outcome, ...(event.title === undefined ? {} : { title: event.title }) }
                    : failed(event.failure)
                  : (context.outcome ?? failed(cancelled));
              /* Advance only once the report is durable: a failed append must not make
               * the next turn under-report its usage. */
              const priorUsage =
                event.failure === undefined ? (context.answered ?? context.priorUsage) : context.priorUsage;
              const next = { ...context, priorUsage };
              enq.sendTo('lentTurn', {
                type: 'record',
                record: sessionRecordOf(next, context.lent),
                required: outcome.ok,
              });
              return { target: 'recording', context: { outcome, priorUsage } };
            }),
            vendorAnswered: refines('Stutter', ({ event }: On<'vendorAnswered', AcpBusyContext>, enq: Enqueue) => {
              if (!event.permission) {
                respond(enq, event.id, event.answer);
              }
              return {};
            }),
            close: refines('Stutter', (_args: unknown, enq: Enqueue) => {
              ladder(enq);
              return { context: { closeAfter: true } };
            }),
            adapterExited: refines('Unmodelled', ({ event }: On<'adapterExited', AcpBusyContext>) => ({
              context: { exited: true, stderr: event.stderr, closeAfter: true },
            })),
          },
        },
        recording: {
          on: {
            close: refines('Stutter', (_args: unknown, enq: Enqueue) => {
              ladder(enq);
              return { context: { closeAfter: true } };
            }),
            adapterExited: refines('Unmodelled', ({ event }: On<'adapterExited', AcpBusyContext>) => ({
              context: { exited: true, stderr: event.stderr, closeAfter: true },
            })),
            recorded: refines('TurnEnded', ({ context, event }: On<'recorded', AcpBusyContext>, enq: Enqueue) =>
              endTurn(
                context,
                enq,
                event.failure !== undefined && context.outcome?.ok === true
                  ? failed(event.failure)
                  : (context.outcome ?? failed(cancelled)),
              ),
            ),
          },
        },
      },
    },

    idle: {
      id: 'idle',
      tags: ['resting'],
      on: {
        close: refines('CloseChat', ({ context }: On<'close'>, enq: Enqueue) => close(context, enq, {})),
        adapterExited: refines('AdapterExited', ({ event }: On<'adapterExited'>) => ({
          target: 'closed',
          context: { exited: true, stderr: event.stderr },
        })),
        /* A lend waiting on a presentation write is cancelled before it prompts; otherwise the turn already ended. */
        cancel: refines('Cancel', ({ context }: On<'cancel'>, enq: Enqueue) =>
          dropQueued(context, enq) ? { context: { queued: undefined } } : {},
        ),
      },
      initial: 'resting',
      states: {
        resting: {
          on: {
            probeModel: refines('Stutter', ({ context, event }: On<'probeModel'>, enq: Enqueue) => {
              const choice = modelChoice(context.configOptions);
              if (!choice?.values.includes(event.model) || choice.currentValue === event.model) {
                enq.emit({
                  type: 'modelProbed',
                  requestId: event.requestId,
                  configOptions: choice?.values.includes(event.model) ? context.configOptions : undefined,
                  failure: undefined,
                });
                return {};
              }
              return {
                target: 'probing',
                context: {
                  probeRequestId: event.requestId,
                  ...ask(context, enq, {
                    method: 'session/set_config_option',
                    params: { sessionId: context.acpSessionId ?? '', configId: choice.configId, value: event.model },
                  }),
                },
              };
            }),
            /* A failed presentation write is retried first (`persisting` serves or refuses the lend). */
            lend: refines('Acquire', ({ context, event }: On<'lend'>) =>
              context.stale ? { target: 'persisting', context: { queued: event.lend } } : lend(event.lend),
            ),
            sessionUpdate: refines('Stutter', ({ context, event }: On<'sessionUpdate'>) =>
              ownUpdate(context, event.sessionId)
                ? { target: 'persisting', context: folded(context, event.update) }
                : {},
            ),
          },
        },
        probing: {
          on: {
            lend: refines('Acquire', ({ context, event }: On<'lend'>, enq: Enqueue) => {
              if (context.queued !== undefined) {
                tell(context, enq, {
                  type: 'turnEnded',
                  key: context.key,
                  requestId: event.lend.requestId,
                  outcome: failed({ code: 'CHAT_RUN_LIVE', message: 'This chat already has a queued ACP turn.' }),
                  resting: true,
                });
                return {};
              }
              return { context: { queued: event.lend } };
            }),
            callSettled: refines('Stutter', ({ context, event }: On<'callSettled'>, enq: Enqueue) => {
              if (!answers(context, event.id)) {
                return {};
              }
              if ('error' in event.answer) {
                enq.emit({
                  type: 'modelProbed',
                  requestId: context.probeRequestId ?? '',
                  configOptions: undefined,
                  failure: failureOfCall(context, event.answer.error),
                });
                const next = context.queued === undefined ? undefined : lend(context.queued);
                return next === undefined
                  ? { target: 'resting', context: { pending: undefined, probeRequestId: undefined } }
                  : {
                      target: next.target,
                      context: { ...next.context, pending: undefined, probeRequestId: undefined },
                    };
              }
              if (event.answer.method !== 'session/set_config_option') {
                return {};
              }
              const { configOptions } = event.answer.result;
              enq.emit({
                type: 'modelProbed',
                requestId: context.probeRequestId ?? '',
                configOptions,
                failure: undefined,
              });
              const patch = {
                pending: undefined,
                probeRequestId: undefined,
                configOptions,
                presentation: { ...context.presentation, configOptions: configOptions.map((option) => asJson(option)) },
              };
              const next = context.queued === undefined ? undefined : lend(context.queued);
              return next === undefined
                ? { target: 'resting', context: patch }
                : { target: next.target, context: { ...next.context, ...patch } };
            }),
          },
        },
        /* One presentation write in flight; a newer state and a lend wait for it. */
        persisting: {
          invoke: {
            src: 'persistPresentation',
            input: ({ context }: Held) => ({
              key: context.key,
              agentId: context.adapter.id,
              sessionMessageId: context.sessionMessageId,
              sessionCommitted: context.sessionCommitted,
              presentation: context.presentation,
            }),
            onDone: refines('Dequeued', presentationPersisted),
            onError: refines('Stutter', ({ context, event }: Faulted, enq: Enqueue) => {
              if (context.queued !== undefined) {
                /* The owed write failed again: the lend is refused with its cause, and the child rests. */
                tell(context, enq, {
                  type: 'turnEnded',
                  key: context.key,
                  requestId: context.queued.requestId,
                  outcome: failed(failureOfError(event.error, context.adapter)),
                  resting: true,
                });
              }
              return { target: 'resting', context: { stale: true, dirty: false, queued: undefined } };
            }),
          },
          on: {
            lend: refines('Acquire', ({ event }: On<'lend'>) => ({ context: { queued: event.lend } })),
            sessionUpdate: refines('Stutter', ({ context, event }: On<'sessionUpdate'>) =>
              ownUpdate(context, event.sessionId) ? { context: { ...folded(context, event.update), dirty: true } } : {},
            ),
          },
        },
      },
    },

    closing: {
      id: 'closing',
      on: {
        adapterExited: refines('AdapterExited', ({ event }: On<'adapterExited'>) => ({
          target: 'closed',
          context: { exited: true, stderr: event.stderr },
        })),
      },
      initial: 'ending',
      states: {
        /* E13: `session/close` has sessionCloseTimeout before the group is signalled. */
        ending: {
          timeout: sessionCloseTimeout,
          onTimeout: refines('Stutter', () => ({ target: 'terminating', context: { pending: undefined } })),
          on: {
            callSettled: refines('Stutter', ({ context, event }: On<'callSettled'>) =>
              answers(context, event.id) ? { target: 'terminating', context: { pending: undefined } } : {},
            ),
          },
        },
        /* E18: acpTerminateBackstop; its handler kills the group again before the state ends. */
        terminating: {
          timeout: acpTerminateBackstop,
          onTimeout: refines('AdapterExited', (_args: unknown, enq: Enqueue) => {
            enq.sendTo('connection', { type: 'kill' });
            return { target: '#closed' };
          }),
          initial: 'signalled',
          states: {
            /* E17: SIGTERM to the group, then acpKillGrace before SIGKILL. */
            signalled: {
              entry: (_args: unknown, enq: Enqueue) => {
                enq.sendTo('connection', { type: 'terminate' });
              },
              timeout: acpKillGrace,
              onTimeout: refines('Stutter', () => ({ target: 'killed' })),
            },
            killed: {
              entry: (_args: unknown, enq: Enqueue) => {
                enq.sendTo('connection', { type: 'kill' });
              },
            },
          },
        },
      },
    },

    closed: {
      id: 'closed',
      type: 'final',
      entry: ({ context }: Held<ClosingContext>, enq: Enqueue) => {
        if (context.deferred !== undefined) {
          tell(context, enq, context.deferred);
        }
        tell(context, enq, { type: 'closed', key: context.key, failure: context.failure });
      },
    },
  },
});

type AcpSessionMachineDefinition = typeof acpSessionMachineDefinition;

/**
 * The type of {@link acpSessionMachine}, named so declarations reference it rather than inline it.
 *
 * @internal
 */
// oxlint-disable-next-line typescript/no-empty-interface, typescript/no-empty-object-type, typescript/consistent-type-definitions -- an interface, not a type alias: declarations reference it by name, where an alias is expanded into every transition of this machine and of any machine that holds it (K-17, TS7056)
export interface AcpSessionMachine extends AcpSessionMachineDefinition {}

/**
 * One vendor ACP session: restore, the lent turn, cancel, and the close ladder (W10 EA-S5).
 *
 * @internal
 */
export const acpSessionMachine: AcpSessionMachine = acpSessionMachineDefinition;

/* The adapter died under a lent turn: it fails, drains, and the child closes. */
function exitBusy(context: AcpBusyContext, enq: Enqueue, stderr: string) {
  return flush({ ...context, exited: true }, enq, {
    exited: true,
    stderr,
    closeAfter: true,
    outcome: context.outcome ?? failed(exitFailure(context, stderr)),
  });
}

/* A presentation write settled: write again if a newer one arrived, then serve a waiting lend. */
function afterPersist(context: AcpSessionContext) {
  const patch = { sessionCommitted: true, dirty: false, stale: false, queued: undefined };
  if (context.dirty) {
    return { target: '#idle.persisting', reenter: true, context: { ...patch, queued: context.queued } } as const;
  }
  if (context.queued !== undefined) {
    const lent = lend(context.queued);
    return { target: lent.target, context: { ...patch, ...lent.context } } as const;
  }
  return { target: '#idle.resting', context: patch } as const;
}

/* Serve a vendor request of the lent turn: approvals and logins while the vendor works, files too. */
function serve(
  context: AcpBusyContext,
  enq: Enqueue,
  { id, request }: { readonly id: string; readonly request: AcpVendorRequest },
) {
  const sessionId = sessionOf(request);
  if (sessionId !== undefined && sessionId !== context.acpSessionId) {
    refuseVendor(enq, id, request);
    return {};
  }
  enq.sendTo('lentTurn', { type: 'serve', id, ...request });
  return request.method === 'session/request_permission'
    ? { context: { permissions: [...context.permissions, id] } }
    : {};
}
