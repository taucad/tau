/**
 * The contracts an external runner implements and the admission a client sends. They sit apart from the host
 * module so the external driver and run history can name them without importing the host they serve.
 */

import type { ClientContext } from '#harness/cad-middleware.js';
import type { AgentSessionModel, CreateAgentSessionOptions } from '#harness/session.js';
import type { LogRowBody } from '#log/chat-ledger.js';
import type { AgentLogEvent, AgentToolChoice, JsonObject, JsonValue, UserProviderMessage } from '#log/event-types.js';
import type { AgentLiveEventPayload, InterruptResolution } from '#waist/ports.js';

/**
 * Which agent runs the turn.
 *
 * Absent, the host composes a Tau admission and runs its own loop. Present, the
 * host routes the turn to the runner registered for `kind` — an ACP adapter on
 * a daemon, say — *before* composing any Tau admission, so an external turn
 * carries no Tau model, prompt or tool grant.
 *
 * Extra fields are the runner's own selection state. They ride the marker on
 * the turn's user message and come back on resume.
 *
 * @public
 */
export type ExternalRunKind = Readonly<Record<string, JsonValue | undefined>> & {
  readonly kind: string;
  readonly id: string;
};

/**
 * One durable event body. The host fills every {@link LogEventBase} field —
 * leader epoch, sequence, timestamp, run id — so an external runner cannot
 * break the log's ordering discipline by getting them wrong.
 *
 * @public
 */
export type ExternalAgentLogEvent = LogRowBody;

/**
 * One external-agent turn, and everything it may do to the chat's durable log.
 *
 * The host owns `run.lifecycle` and the approval inbox; a runner appends
 * *messages* — the thin projection of whatever its protocol reports (OQ-X2) —
 * and asks for approvals. That split is what keeps one client projection
 * rendering a Tau run and an external run identically (PH19).
 *
 * @public
 */
export type ExternalAgentTurn = {
  /** Agent id the client selected, e.g. `claude` or `codex`. */
  readonly agentId: string;
  /** The full selection, including any runner-specific fields. */
  readonly agent: ExternalRunKind;
  readonly chatId: string;
  readonly runId: string;
  /** The run's attempt, from 1; a resumed turn has the next one (W10 EA-S8). */
  readonly attempt: number;
  /**
   * Where the attempt's placement rooted its files in this host's namespace: the agent's working directory (W8).
   * Absent on a host without placement, where the runner keeps its own root.
   */
  readonly root?: string | undefined;
  /** The new user turn; absent when resuming one a restart left unanswered. */
  readonly message?: UserProviderMessage | undefined;
  /**
   * The admission the client sent, for the context an external agent can use.
   *
   * Nothing a Tau turn *negotiates* applies here — the agent brings its own
   * model, tools and login (X6) — but what the client **composed** does: the
   * CAD system prompt, the skill index and the editor snapshot are the same
   * facts a Tau turn works from, and an external agent that never receives them
   * is answering CAD questions with no kernel knowledge at all (V12). Absent on
   * a resumed turn, which sends no prompt.
   */
  readonly config?: TauAgentAdmissionConfig | undefined;
  /** Durable state a previous attempt remembered — a session id, a cursor, a branch. */
  readonly state?: JsonObject | undefined;
  /** Every durable event recorded for this chat so far. */
  readonly history: readonly AgentLogEvent[];
  /** Aborted by `cancel`, or by the host closing. */
  readonly signal: AbortSignal;
  /** Publish one non-durable text/reasoning delta before its durable envelope settles. */
  readonly publishLive?: ((event: AgentLiveEventPayload) => Promise<void>) | undefined;
  /**
   * Append replaceable session state after this turn settles.
   *
   * Unlike {@link append}, this capability may be retained by a session-scoped
   * external runner. The host still owns chat fencing, ordering and event
   * identity; the runner may use it only for state that ACP reports outside a
   * prompt, such as commands, plans and configuration.
   */
  readonly appendSession?: ((events: readonly ExternalAgentLogEvent[]) => Promise<void>) | undefined;
  /** Append durable events; each publishes on the host's event stream. */
  append(events: readonly ExternalAgentLogEvent[]): Promise<void>;
  /** Persist state that must survive a restart. Merges into what is there. */
  remember(state: JsonObject): Promise<void>;
  /**
   * Durably pause for an approval and await the decision (PH13 / OQ-X4).
   *
   * The whole resolution, not just its outcome: a request that offered a list
   * of options is answered by *one* of them, and a runner that has to
   * re-derive the choice from `approved` substitutes its own guess for the
   * human's decision.
   */
  approve(request: { readonly prompt: string; readonly payload?: JsonValue | undefined }): Promise<InterruptResolution>;
};

/**
 * What one external turn reported beyond the messages it appended.
 *
 * The runner never writes `run.lifecycle` itself — the host owns it — so a turn
 * that ended short has to be able to *say* so, or the host records the only
 * thing it can see (the promise resolved) as `completed` (V6).
 *
 * @public
 */
export type ExternalTurnOutcome = {
  /** Why the agent stopped, in its own protocol's vocabulary (ACP's `max_tokens`, …). */
  readonly stopReason?: string | undefined;
};
/** Runs external agents of one kind. @public */
export type ExternalAgentPort = {
  /**
   * Agent ids this port can start; anything else is refused at admission.
   *
   * Optional, because not every runner can enumerate. A daemon's ACP adapters
   * are resolved locally and known up front, so listing them buys a cheap
   * refusal before any durable event is written. A runner that can only find
   * out by opening its session omits this and refuses inside `run`, where it
   * genuinely knows.
   */
  list?(): readonly string[];
  /** Execute one turn; resolve when the agent's turn ends, throw to fail the run. */
  run(turn: ExternalAgentTurn): Promise<ExternalTurnOutcome | undefined>;
  /**
   * End whatever this chat holds open — a live protocol session, a process.
   *
   * Called when leadership is relinquished, when the host closes, and before a
   * rewound turn, whose new history the agent's own session must not carry.
   * Optional, because a runner that keeps nothing between turns has nothing to
   * close.
   */
  closeChat?(chatId: string): Promise<void>;
};

/**
 * The chat-scoped record one external session is resumed from (VSC3).
 *
 * It rides the marker on the chat's most recent external user message, so it
 * needs no event type of its own, and it is read per *agent*: switching agents
 * inside a chat must open the new agent's own session rather than hand it a
 * session id another vendor minted.
 *
 * @public
 */
export type ExternalSessionState = {
  readonly agentId: string;
  /** The vendor session a later turn resumes; absent until one has been remembered. */
  readonly acpSessionId?: string | undefined;
  /** Model the session was last set to. */
  readonly model?: string | undefined;
  /**
   * Revision mode the session was opened in (`direct` or `candidate`).
   *
   * The *host's* record of how it prepared that turn, never the agent's claim:
   * VI11 keeps the revision authority with the host, and this field is what a
   * later turn reads back to know which tree the vendor session was rooted in.
   */
  readonly mode?: string | undefined;
  /** Revision this session's working tree is based on. */
  readonly baseRevisionId?: string | undefined;
  /**
   * Absolute directory the session was opened against (V19).
   *
   * A candidate turn runs in a checkout of its own, so a session remembered
   * against a directory this turn does not run in cannot be resumed — the
   * conversation would be about files the new session cannot see.
   */
  readonly cwd?: string | undefined;
};

/** Exact per-admission model, prompt, tool, and client context. @public */
export type TauAgentAdmissionConfig = {
  readonly systemPrompt: string;
  readonly systemPromptBlocks?: CreateAgentSessionOptions['systemPromptBlocks'];
  /** Absent, the host's own default row runs the turn; a host with neither refuses it. */
  readonly model?: AgentSessionModel | undefined;
  readonly toolChoice: AgentToolChoice;
  readonly allowedTools?: readonly string[] | undefined;
  readonly snapshot?: JsonValue | undefined;
  readonly clientContext?: ClientContext | undefined;
  readonly contextMessages?: readonly UserProviderMessage[] | undefined;
  /** Present = an external runner owns this turn; see {@link ExternalRunKind}. */
  readonly agent?: ExternalRunKind | undefined;
};
