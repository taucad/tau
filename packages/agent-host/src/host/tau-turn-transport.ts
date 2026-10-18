import type { AgentRunOutcome } from '#harness/session.js';
import type { LogRowBody } from '#log/chat-ledger.js';
import type { UserProviderMessage } from '#log/event-types.js';
import type { AgentLiveEvent } from '#waist/ports.js';

/** Read-only projections of the sole admitted Tau execution. @public */
export type TauTurnProjection = Readonly<{
  live: (event: AgentLiveEvent) => Promise<void>;
  durable: (event: LogRowBody) => Promise<void>;
  /** Project native approval before the execution owner pauses this attempt. */
  needsInput?:
    | ((request: Readonly<{ toolCallId: string; toolName: string; prompt: string }>) => Promise<void>)
    | undefined;
}>;

/** A transport wraps execution after admission and placement, without acquiring another turn. @public */
export type TauTurnTransportInput = Readonly<{
  chatId: string;
  runId: string;
  attempt: number;
  root?: string | undefined;
  message?: UserProviderMessage | undefined;
  signal: AbortSignal;
  /** Execute the existing Pi driver once, projecting its canonical rows and live output. */
  execute: (projection: TauTurnProjection) => Promise<AgentRunOutcome>;
  /** Abort that same Pi session. */
  abort: () => void;
}>;

/** Optional protocol boundary around the host's existing Tau execution. @public */
export type TauTurnTransport = Readonly<{
  run: (input: TauTurnTransportInput) => Promise<AgentRunOutcome>;
}>;
