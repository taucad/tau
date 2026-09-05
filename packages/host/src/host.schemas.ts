import { z } from 'zod';

export const pairingResponseSchema = z.object({
  deviceCode: z.string().min(16),
  userCode: z.string().min(4),
  verificationUri: z.url(),
  expiresAt: z.iso.datetime(),
  pollInterval: z.number().int().min(250).max(30_000),
});

export const pairingTokenResponseSchema = z.object({
  deviceId: z.string().min(1),
  credential: z.string().min(32),
});

const offerSchema = z.object({
  v: z.literal(1),
  type: z.literal('offer'),
  sessionId: z.string().min(1),
  runtimeVersion: z.string().min(1),
  runtimeUrl: z.url(),
  fileSystemUrl: z.url(),
  runtimeAuthorization: z.string().min(32),
  fileSystemAuthorization: z.string().min(32),
  /* Optional so an API that has not shipped rung 2 — or a daemon started
   * without `--agent-port` — still pairs: the agent route is spliced only when
   * both sides offer it. */
  agentUrl: z.url().optional(),
  agentAuthorization: z.string().min(32).optional(),
  expiresAt: z.iso.datetime(),
});

const revokeSchema = z.object({
  v: z.literal(1),
  type: z.literal('revoke'),
  sessionId: z.string().min(1),
});

export const hostControlInboundSchema = z.discriminatedUnion('type', [offerSchema, revokeSchema]);

/** Relay-to-daemon control message. @internal */
export type HostControlInbound = z.infer<typeof hostControlInboundSchema>;

/**
 * What this daemon can do beyond remote compute.
 *
 * Absent means "compute only": the API mints no agent grant and puts no
 * `agentUrl` on the offer, so an older daemon still pairs unchanged.
 *
 * @internal
 */
export type HostCapabilities = {
  readonly agent?: {
    readonly workspaceRoot: string;
    /**
     * External ACP agents this daemon can start (W4-ACP): only those whose
     * pinned adapter resolved *and* whose CLI answered `--version`. Absent
     * means Tau's own runs only.
     */
    readonly externalAgents?: readonly string[];
  };
};

/**
 * A run's state as the API's run directory records it (PH19 ruling 2).
 *
 * `paused` is the log's word for "an approval is pending"; the directory's is
 * `awaiting-approval`, because that is what a client that lost its page needs to
 * read off a row it can only see the outside of.
 *
 * @public
 */
export type HostRunState = 'admitted' | 'running' | 'awaiting-approval' | 'completed' | 'failed' | 'cancelled';

/** Daemon-to-relay control message. @internal */
export type HostControlOutbound =
  | {
      readonly v: 1;
      readonly type: 'ready';
      readonly deviceId: string;
      readonly runtimeVersion: string;
      readonly capacity: number;
      readonly capabilities?: HostCapabilities;
    }
  | {
      /**
       * One run's identity and state — never its content. The transcript stays
       * in `<workspace>/.tau/chats/<chatId>/events.jsonl`; this frame exists so
       * a client that lost its page can find the run again.
       */
      readonly v: 1;
      readonly type: 'run';
      readonly runId: string;
      readonly chatId: string;
      readonly state: HostRunState;
      readonly updatedAt: string;
    }
  | { readonly v: 1; readonly type: 'accept'; readonly sessionId: string }
  | {
      readonly v: 1;
      readonly type: 'reject';
      readonly sessionId: string;
      readonly code: 'BUSY' | 'CHILD_UNAVAILABLE' | 'VERSION_MISMATCH';
    };
