import type { SourceLiveEvent } from '@taucad/agent-host';
import type {
  CatchUpFrame,
  CatchUpInput,
  CommandAnswer,
  HostCommand,
  ReadAnswer,
  ReadInput,
} from '@taucad/agent-host/wire';

/**
 * The wire the agent-host client is driven over: the keyed seam vocabulary (`@taucad/agent-host/wire`).
 *
 * Ruling 6 ("one client, N channels"): the browser worker and a paired daemon
 * are two *transports* feeding the same projection, not two clients. Commands
 * are answered by key, durable rows are pulled with `read`, and live deltas are
 * pushed per chat; only the plumbing under them differs.
 *
 * @public
 */
export type AgentHostTransport = {
  /**
   * Resolves once this transport can carry commands, and rejects if it never
   * will. The worker leg initializes over the wire (ports, storage, model); a
   * daemon is configured from its own CLI and is ready as soon as it is dialed.
   */
  readonly ready: Promise<void>;
  /**
   * The worker-only calls, in today's shape. Absent on a daemon, whose teardown
   * is local. Every host appends its own settlement rows (W8 TS-S6).
   * ponytail: W6 makes `close` the channel's own.
   */
  readonly worker?: {
    close(signal: AbortSignal): Promise<void>;
  };
  /**
   * Send one keyed command and await its answer. A transport that heals re-sends
   * it with the same key on the replacement, so the owner answers it once.
   */
  execute(command: HostCommand, signal?: AbortSignal): Promise<CommandAnswer>;
  /** One long-poll read of a chat's durable rows: a batch, or a refusal the reader resets on. */
  read(input: ReadInput): Promise<ReadAnswer>;
  /** Capture bounded provisional pages and validate their exact source before publication. */
  catchUp(input: CatchUpInput): AsyncIterable<CatchUpFrame>;
  /** Ephemeral model deltas for one chat, for as long as `signal` lives. */
  liveEvents(chatId: string, signal: AbortSignal): AsyncIterable<SourceLiveEvent>;
  /**
   * Report the wire's final death — a worker that could not be replaced, a
   * daemon that could not be redialled. Fires at most once. A transport that
   * cannot observe it simply never notifies, and commands then reject on their
   * own.
   */
  onClose?(handler: (reason: AgentHostTransportCloseReason) => void): () => void;
  /** Release local resources. Idempotent, and never throws. */
  close(): void;
};

/** Why a transport died, as a typed reason rather than an opaque timeout. @public */
export type AgentHostTransportCloseReason = {
  readonly code: string;
  readonly message: string;
};
