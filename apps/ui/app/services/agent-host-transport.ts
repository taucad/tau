import type { AgentChannelResultOperation, EventLogBatch, HostRunSnapshot } from '@taucad/agent-host';
import type {
  AgentHostWorkerCommandInput,
  AgentHostWorkerEvent,
  AgentHostWorkerLiveEvent,
} from '#workers/agent-host.contract.js';

/**
 * The wire the agent-host client is driven over.
 *
 * Ruling 6 ("one client, N channels"): the browser worker and a paired daemon
 * are two *transports* feeding the same projection, not two clients. Everything
 * a projection needs — the command vocabulary, the durable event stream, the
 * ephemeral delta stream — is expressed here once; only the plumbing under it
 * differs.
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
  /** Issue one command. `close` is answered by whichever half owns teardown. */
  call(request: AgentHostTransportRequest, signal?: AbortSignal): Promise<AgentHostTransportResponse>;
  /** Subscribe to one of the two host streams for as long as `signal` lives. */
  listen<Name extends keyof AgentHostTransportStreams>(
    name: Name,
    signal: AbortSignal,
  ): AsyncIterable<AgentHostTransportStreams[Name]>;
  /**
   * Report the wire's own death — a crashed worker, a dropped socket. Fires at
   * most once. A transport that cannot observe it simply never notifies, and
   * commands then fail on their own deadline instead.
   */
  onClose?(handler: (reason: AgentHostTransportCloseReason) => void): () => void;
  /** Release local resources. Idempotent, and never throws. */
  close(): void;
};

/** Every command the client half issues. @public */
export type AgentHostTransportRequest = AgentHostWorkerCommandInput | { readonly type: 'close' };

/**
 * Every answer a host may return.
 *
 * Deliberately the union of the worker's and the daemon's answers: the daemon
 * additionally answers `interrupt` (it can *raise* an approval, which a browser
 * client never does), and widening the operation here is cheaper than teaching
 * the projection two response shapes.
 *
 * @public
 */
export type AgentHostTransportResponse =
  | { readonly type: 'result'; readonly operation: AgentChannelResultOperation; readonly snapshot: HostRunSnapshot }
  | { readonly type: 'tail'; readonly chatId: string; readonly batch: EventLogBatch }
  | {
      readonly type: 'attach';
      readonly chatId: string;
      readonly batch: EventLogBatch;
      readonly leadership:
        | { readonly role: 'leader'; readonly generation: string }
        | { readonly role: 'follower'; readonly generation?: string | undefined };
      readonly snapshot?: HostRunSnapshot | undefined;
      readonly takeover: boolean;
    }
  | { readonly type: 'closed' };

/** The two host streams, by name. @public */
export type AgentHostTransportStreams = {
  readonly events: AgentHostWorkerEvent;
  readonly liveEvents: AgentHostWorkerLiveEvent;
};

/** Why a transport died, as a typed reason rather than an opaque timeout. @public */
export type AgentHostTransportCloseReason = {
  readonly code: string;
  readonly message: string;
};
