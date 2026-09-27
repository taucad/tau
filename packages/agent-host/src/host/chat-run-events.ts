/**
 * M1's alphabet (W7): the command events, framed `{ commandId, payload }` over the wire's payload schemas (MC-R30),
 * and the correlated outcomes its effects and drivers deliver (RA-R7). Also the JSON-safe argument shapes of every
 * effect M1 enqueues (RA-A11).
 *
 * The frame is M1's own, not the wire's: alpha.59 makes a directly reused schema's optional top-level keys required,
 * so the payload rides one level down, where its optional keys stay optional (run-actor guide, frame-generation).
 */

import { z } from 'zod';

import type { ChatLedger, LogRowBody } from '#log/chat-ledger.js';
import type { JsonValue, RunFailureDetail, TurnPlacement } from '#log/event-types.js';
import type { TurnAttemptKey, TurnSettlementRow } from '#waist/ports.js';
import { commandPayloads } from '#wire/commands.schema.js';
import type { CommandAnswer } from '#wire/commands.schema.js';

/**
 * M1's frame over one wire payload schema.
 *
 * @param payload - The wire's strict payload schema for the verb.
 * @returns The event payload schema: the command's key and its payload.
 */
const hostFrame = <Payload extends z.ZodType>(payload: Payload) =>
  z.strictObject({ commandId: z.string().min(1), payload });

/** The command events M1 serves, keyed by the wire's verbs (SC names; `resolve-interrupt` refines `resolveInterrupt`). */
export const chatRunCommandSchemas = {
  start: hostFrame(commandPayloads.start),
  resume: hostFrame(commandPayloads.resume),
  cancel: hostFrame(commandPayloads.cancel),
  steer: hostFrame(commandPayloads.steer),
  interrupt: hostFrame(commandPayloads.interrupt),
  'resolve-interrupt': hostFrame(commandPayloads['resolve-interrupt']),
} as const;

/** One command verb M1 serves: every wire verb but `attach`, which is a read (RH-R1). */
export type ChatRunVerb = keyof typeof chatRunCommandSchemas;

/** One row M1 or reconciliation writes, with the command id it carries (RA-R2). */
export type ChatRunRow = Readonly<{ runId: string; body: LogRowBody; commandId?: string }>;

/** The turn an attempt runs: a Tau loop, or an external agent (W10). */
export type ChatRunKind = 'tau' | 'external';

/**
 * What `prepareAdmission` hands back once nothing refuses the start (RA-R3): the intent rows, then the rows attempt 1
 * writes when it starts.
 */
export type PreparedAdmission = Readonly<{
  kind: ChatRunKind;
  turnId: string;
  /** `[admitted{admission}]`, then `history.rewound` when the start rewinds. */
  intent: readonly LogRowBody[];
  /** Attempt 1's start rows before `running`: the external marker message, or nothing. */
  start: readonly LogRowBody[];
  /** The checkout the person chose, for placement (W8 TS-R12). */
  checkoutId?: string;
}>;

/** What `prepareResume` hands back: how the next attempt runs, and its intent rows (`running{selection}`, recovery). */
export type PreparedResume = Readonly<{
  kind: ChatRunKind;
  turnId: string;
  /** `start` replays the journaled payload; `continue` runs from history; `complete` ends with no call (tail answered). */
  mode: 'start' | 'continue' | 'complete';
  intent: readonly LogRowBody[];
}>;

/** A request an external agent asked a person to decide (W10). */
export type ApprovalRequest = Readonly<{ prompt: string; payload?: JsonValue; agentId?: string }>;

/** A person's decision on one pending request. */
export type ApprovalResolution = Readonly<{
  interruptId: string;
  outcome: 'approved' | 'denied' | 'cancelled';
  optionId?: string;
  payload?: JsonValue;
}>;

/** How a driver's attempt ended (RA-S4): the session's and the external driver's one report. */
export type DriverOutcome = 'completed' | 'failed' | 'aborted';

/** The outcomes M1's effects, drivers and host deliver. Each carries the correlation M1 checks first (MC-R18). */
export type ChatRunOutcomeEvent =
  | Readonly<{
      type: 'logOpened';
      ledger: ChatLedger;
      repair: readonly ChatRunRow[];
      /** The chat's lease records opening left held, each keyed as the ledger reads it (TS-Q5); none without placement. */
      held?: readonly TurnAttemptKey[];
    }>
  | Readonly<{ type: 'logOpenFailed'; code: string; message: string }>
  /** `key` names M1's own append; a driver's rows arrive without one, carrying their message ids. */
  | Readonly<{ type: 'rowsCommitted'; key?: string; ledger: ChatLedger; messageIds: readonly string[] }>
  | Readonly<{ type: 'appendRefused'; key: string; code: string; message: string; effect: 'not-applied' | 'unknown' }>
  | Readonly<{ type: 'admissionPrepared'; commandId: string; prepared: PreparedAdmission }>
  | Readonly<{ type: 'admissionRefused'; commandId: string; code: string; message: string; details?: JsonValue }>
  | Readonly<{ type: 'resumePrepared'; commandId: string; prepared: PreparedResume }>
  | Readonly<{ type: 'resumeRefused'; commandId: string; code: string; message: string; details?: JsonValue }>
  | Readonly<{ type: 'placed'; key: TurnAttemptKey; placement: TurnPlacement }>
  | Readonly<{
      type: 'placementRefused';
      key: TurnAttemptKey;
      code: string;
      message: string;
      effect: 'not-applied' | 'unknown';
      /** A base the attempt minted before the root released it, which its row names (W8.r1 L2). */
      revisionId?: string;
    }>
  | Readonly<{
      type: 'completeAnswered';
      key: TurnAttemptKey;
      status: 'applied' | 'refused' | 'unknown';
      code?: string;
    }>
  | Readonly<{ type: 'settlementPublished'; key: TurnAttemptKey; row: TurnSettlementRow }>
  /** `unknown`: the port call failed, so its effect is unknown. */
  | Readonly<{ type: 'acknowledged'; key: TurnAttemptKey; unknown?: true }>
  | Readonly<{ type: 'abandoned'; key: TurnAttemptKey; unknown?: true }>
  | Readonly<{
      type: 'agentEnded';
      key: TurnAttemptKey;
      outcome: DriverOutcome;
      failure?: RunFailureDetail;
      stopReason?: string;
    }>
  | Readonly<{ type: 'approvalRequested'; key: TurnAttemptKey; interruptId: string; request: ApprovalRequest }>
  | Readonly<{ type: 'logClosed' }>;

/** Host signals: `close` stops with writes allowed; `relinquish` stops with none (W6). */
export type ChatRunHostEvent = Readonly<{ type: 'close' }> | Readonly<{ type: 'relinquish' }>;

// ── effect arguments: JSON-safe, keyed by domain identity (MC-R9, RA-A11) ───────────────────────────

/** `appendRows`: one batch through the chat's append chain. `ends` closes the driver gate for that attempt first. */
export type AppendRowsArgs = Readonly<{ key: string; rows: readonly ChatRunRow[]; ends?: TurnAttemptKey }>;

/** `startDriver`: run one attempt. */
export type StartDriverArgs = Readonly<{
  key: TurnAttemptKey;
  kind: ChatRunKind;
  mode: 'start' | 'continue';
  placement?: TurnPlacement;
}>;

/** Every argument shape M1 enqueues, by effect name. */
export type ChatRunEffectArgs = {
  openLog: Readonly<{ chatId: string }>;
  appendRows: AppendRowsArgs;
  prepareAdmission: Readonly<{ commandId: string; payload: JsonValue }>;
  prepareResume: Readonly<{ commandId: string; runId: string; payload: JsonValue }>;
  startDriver: StartDriverArgs;
  steerDriver: Readonly<{ key: TurnAttemptKey; commandId: string; message: string }>;
  abortDriver: Readonly<{ key: TurnAttemptKey; reason: 'cancel' | 'interrupt' | 'close' | 'relinquish' }>;
  decideApproval: Readonly<{ key: TurnAttemptKey; resolution: ApprovalResolution }>;
  admitPlacement: Readonly<{ key: TurnAttemptKey; checkoutId?: string }>;
  completePlacement: Readonly<{ key: TurnAttemptKey; cut: boolean }>;
  abandonPlacement: Readonly<{ key: TurnAttemptKey }>;
  acknowledgePlacement: Readonly<{ key: TurnAttemptKey }>;
  closeLog: Readonly<{ chatId: string }>;
  answer: Readonly<{ answer: CommandAnswer }>;
  redeliver: Readonly<{ commands: readonly HeldCommand[] }>;
};

/** A command held in the slot while it reserves or ends (the totality matrix's `Q`), re-delivered when it can act. */
export type HeldCommand = Readonly<{ type: ChatRunVerb; commandId: string; payload: JsonValue }>;
