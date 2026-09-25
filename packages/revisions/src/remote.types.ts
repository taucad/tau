import type { RemoteKind } from '#remotes.js';
import type { RemoteStorageRefusal } from '#revision-port.js';
import type { SyncFailureReason } from '#sync.types.js';

/** Which remote a project is connected to, and what it costs. @public */
export type RemoteFacet = Readonly<{
  kind: RemoteKind | 'none';
  url: string | undefined;
  /** Where the connection is, for the Sync row's own copy. */
  phase: 'none' | 'connecting' | 'connected' | 'failed' | 'disconnecting' | 'reconnectRequired';
  /** Bytes stored and allowed, when the remote reports them (S35). */
  storage: Readonly<{ used: number; quota: number }> | undefined;
  /** Files a refused push named as over the plan (D16, AC16). */
  overQuota: readonly string[];
  /**
   * The numbers that came with that refusal, when the remote sent them (C13).
   *
   * Distinct from {@link RemoteFacet.storage}, which is a `{ used, quota }`
   * pair no host has ever filled in: these are what the Tau API's LFS batch
   * refusal actually carries, and they were parsed and then dropped one hop
   * before the Sync region could render them.
   */
  quota: RemoteStorageRefusal | undefined;
  /** The last failure, already safe to render. */
  error: string | undefined;
  /**
   * What class of failure that was, from `sync.machine`'s own classifier.
   *
   * Rule 19 asks every surface showing a remote failure for exactly one action
   * matching its class. Without this the *connect* path had only a sentence, so
   * the `403 GIT_SYNC_NOT_ENTITLED` that opened this closeout could offer only
   * *Retry* on connect where the identical refusal on a push offered *Upgrade*.
   * `undefined` whenever {@link RemoteFacet.error} is, so a surface never shows
   * a class with no sentence beside it.
   */
  reason: SyncFailureReason | undefined;
  /** True when this project may fetch but must never push to the remote. */
  fetchOnly: boolean;
  provider: 'github' | undefined;
  repositoryId: string | undefined;
}>;

/** Events accepted by remoteMachine. @public */
export type RemoteMachineEvent =
  /** The user picked a kind. `'none'` disconnects whatever is connected. */
  | Readonly<{
      type: 'connect';
      kind: RemoteKind | 'none';
      url?: string;
      provider?: 'github';
      repositoryId?: string;
      fetchOnly?: boolean;
    }>
  /**
   * A host whose authorization finished out of band says so (P22).
   *
   * The browser does not send it: it takes consent in a pop-up *before* it
   * sends `connect`, because a SharedWorker with no clients is terminable and
   * the actor tree cannot be relied on to survive a redirect. The senders this
   * seam exists for are the ones the architecture names — the desktop keychain
   * actor and the CLI credential helper, whose `authorize` actor resolves out
   * of band — and W13's Node remote wiring. It is also how
   * `reconnectRequired` is retried without rewriting the remote.
   */
  | Readonly<{ type: 'authorized' }>
  /** A host that validated the remote itself says so. */
  | Readonly<{ type: 'validated'; storage?: Readonly<{ used: number; quota: number }> }>
  | Readonly<{ type: 'disconnect' }>
  | Readonly<{ type: 'cancel' }>
  /**
   * A push the remote refused for storage (D16).
   *
   * Not in the architecture's event list, and needed by it: the Sync region
   * renders the over-quota file list, and the refusal happens during a push
   * (`sync.machine`, W13), not during a connection.
   */
  | Readonly<{
      type: 'quotaRefused';
      paths: readonly string[];
      used?: number;
      quota?: number;
      /** What the remote said about room, when it said anything (C13). */
      storage?: RemoteStorageRefusal;
    }>;
