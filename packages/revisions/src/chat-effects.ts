/**
 * Recording this device's chats onto their own refs, and reading what the
 * remote said about a ref it was offered.
 *
 * Moved out of `createRevisionActors` unchanged (W10.3). The group touches none
 * of the closure's mutable state — no fence, no cut, no capture — so it takes
 * only the port, the records filesystem and the host's identity seams.
 */
import { revisionId } from '#algorithms/index.js';
import { chatRefName, projectChats, replayChatSegment, writeChatRef } from '#chat-ref.js';
import { LfsQuotaError } from '#lfs-client.js';
import type { LfsQuotaRefusal } from '#lfs-client.js';
import { remoteTrackingRef } from '#remotes.js';
import { RevisionPortError } from '#revision-port.js';
import type { RemoteStorageRefusal, RevisionPort, RevisionPushRef, RevisionPushRefResult } from '#revision-port.js';
import type { SyncRefOutcome } from '#sync.types.js';
import type { RevisionActorsOptions, RevisionFileSystem } from '#revision-effects.js';

/**
 * The two numbers a storage refusal carries, or `undefined` when it carried none.
 *
 * `git-lfs.service.ts` answers them and `LfsQuotaRefusal` parses them; until
 * C13 they stopped one hop short, so the only thing that ever reached the Sync
 * region was the file list (D16, EQ7).
 *
 * @param refusal - What the remote said.
 * @returns The numbers, or `undefined`.
 */
export const storageRefusalOf = (refusal: LfsQuotaRefusal): RemoteStorageRefusal | undefined => {
  const storage = {
    ...(refusal.remainingBytes === undefined ? {} : { remainingBytes: refusal.remainingBytes }),
    ...(refusal.shortfallBytes === undefined ? {} : { shortfallBytes: refusal.shortfallBytes }),
  };
  return Object.keys(storage).length === 0 ? undefined : storage;
};

/**
 * Build the chat-ref and push-outcome effects over one project's port.
 *
 * @param dependencies - The port, the records filesystem, this host's identity
 *   seams and its monotonic clock.
 * @returns Every chat-ref and push-outcome effect the Sync region calls.
 */
export const createChatEffects = (
  dependencies: Readonly<{
    port: RevisionPort;
    recordsFileSystem: () => Promise<RevisionFileSystem>;
    deviceId: RevisionActorsOptions['deviceId'];
    actor: RevisionActorsOptions['actor'];
    onChatsProjected: RevisionActorsOptions['onChatsProjected'];
    actorId: string;
    now: () => number;
  }>,
): Readonly<{
  chatContext: () => Promise<
    Readonly<{ port: RevisionPort; filesystem: RevisionFileSystem; deviceId: string }> | undefined
  >;
  offerOf: (name: string, leases: Readonly<Record<string, string>>) => RevisionPushRef;
  outcomeOf: (entry: RevisionPushRefResult, offered?: ReadonlyMap<string, string>) => SyncRefOutcome;
  pushRecordRef: (
    input: Readonly<{
      name: string;
      remote: string;
      leases: Readonly<Record<string, string>>;
      offered: ReadonlyMap<string, string>;
    }>,
  ) => Promise<
    Readonly<{
      outcome: SyncRefOutcome;
      overQuota?: readonly string[];
      quotaMessage?: string;
      quotaStorage?: RemoteStorageRefusal;
    }>
  >;
  recordChats: (syncChats: boolean) => Promise<readonly SyncRefOutcome[]>;
  refusedAll: (
    names: readonly string[],
    why: string,
    offered?: ReadonlyMap<string, string>,
  ) => readonly SyncRefOutcome[];
  replayRejectedChat: (
    input: Readonly<{
      chatId: string;
      name: string;
      remote: string;
      syncChats: boolean;
      refusal: string | undefined;
    }>,
  ) => Promise<SyncRefOutcome>;
  staysPerRef: (error: unknown) => boolean;
}> => {
  const { port, recordsFileSystem, deviceId, actor, onChatsProjected, actorId, now } = dependencies;

  /** What every chat-ref effect needs, or `undefined` on a host with no device id. */
  const chatContext = async (): Promise<
    Readonly<{ port: RevisionPort; filesystem: RevisionFileSystem; deviceId: string }> | undefined
  > => {
    const identity = deviceId?.();
    if (identity === undefined || identity === '') {
      return undefined;
    }
    return { port, filesystem: await recordsFileSystem(), deviceId: identity };
  };

  /**
   * Record every chat this device holds onto its own ref, before they are offered.
   *
   * One commit per chat per debounce, which is exactly S39's "one commit per
   * push debounce": the scheduler's window *is* the batching, so nothing here
   * needs a second one.
   *
   * @param syncChats - The project's own answer; `false` writes nothing at all.
   */
  const recordChats = async (syncChats: boolean): Promise<readonly SyncRefOutcome[]> => {
    const context = await chatContext();
    if (context === undefined || !syncChats) {
      return [];
    }
    const person = actor?.({ runId: undefined, trigger: 'save' });
    const chats = await (async (): Promise<readonly string[]> => {
      try {
        return await context.filesystem.readdir('.tau/chats');
      } catch {
        return [];
      }
    })();
    return Promise.all(
      chats.map(async (chatId): Promise<SyncRefOutcome> => {
        const name = chatRefName(chatId);
        try {
          const result = await writeChatRef({
            ...context,
            chatId,
            syncChats,
            actorId,
            ...(person === undefined ? {} : { actor: person }),
            now: now(),
          });
          return {
            name,
            status: result.status === 'conflicted' ? 'rejected' : 'upToDate',
            head: result.head,
            ...(result.status === 'conflicted' ? { reason: 'The local chat ref moved while it was recorded.' } : {}),
          };
        } catch (error) {
          return {
            name,
            status: 'rejected',
            head: await port.readRef(name).catch(() => undefined),
            reason: error instanceof Error ? error.message : 'This chat could not be recorded.',
          };
        }
      }),
    );
  };

  /**
   * One ref's outcome in the scheduler's own shape.
   *
   * A *refused* ref carries no remote head by contract (`RevisionPushRefResult`),
   * so the head reported for it is the one this host offered — which is the
   * revision the queue entry exists to name (review 2 R8).
   *
   * @param entry - What the port reported for this ref.
   * @param offered - The local heads this push offered, by ref name.
   * @returns The outcome the scheduler records.
   */
  const outcomeOf = (entry: RevisionPushRefResult, offered?: ReadonlyMap<string, string>): SyncRefOutcome => ({
    name: entry.name,
    status: entry.status,
    head: entry.head ?? offered?.get(entry.name),
    ...(entry.reason === undefined ? {} : { reason: entry.reason }),
  });

  /**
   * Whether a throw from a history push is answered per ref, where the records
   * still push beside it: the server's own per-ref refusal, or storage.
   *
   * @param error - What the push threw.
   * @returns `true` to report it per ref; `false` to let the scheduler classify it.
   */
  const staysPerRef = (error: unknown): boolean =>
    error instanceof LfsQuotaError ||
    (error instanceof RevisionPortError && (error.code === 'REMOTE_REJECTED' || error.code === 'REMOTE_REF_CONFLICT'));

  /** Every ref of one push, refused with one reason — a quota, or a throw. */
  const refusedAll = (
    names: readonly string[],
    why: string,
    offered?: ReadonlyMap<string, string>,
  ): readonly SyncRefOutcome[] =>
    names.map((name) => ({ name, status: 'rejected', head: offered?.get(name), reason: why }));

  /**
   * Offer one record ref on its own, so its refusal is its own (A39).
   *
   * Its own function rather than a closure in the loop, because it captures the
   * refusal accumulator the loop also writes — and a function declared in a loop
   * over shared state is exactly what the lint rule is for.
   *
   * @param input - The ref, the remote and the leases this host holds.
   * @returns This ref's outcome, plus any storage refusal it carried.
   */
  const pushRecordRef = async (
    input: Readonly<{
      name: string;
      remote: string;
      leases: Readonly<Record<string, string>>;
      offered: ReadonlyMap<string, string>;
    }>,
  ): Promise<
    Readonly<{
      outcome: SyncRefOutcome;
      overQuota?: readonly string[];
      quotaMessage?: string;
      quotaStorage?: RemoteStorageRefusal;
    }>
  > => {
    try {
      const pushed = await port.push({ remote: input.remote, refs: [offerOf(input.name, input.leases)] });
      const [entry] = pushed.refs;
      return {
        outcome:
          entry === undefined
            ? {
                name: input.name,
                status: 'rejected',
                head: input.offered.get(input.name),
                reason: 'The remote said nothing about this ref.',
              }
            : outcomeOf(entry, input.offered),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'This record could not be backed up.';
      return {
        outcome: {
          name: input.name,
          status: 'rejected',
          head: input.offered.get(input.name),
          reason: error instanceof LfsQuotaError ? error.refusal.message : message,
        },
        ...(error instanceof LfsQuotaError
          ? {
              overQuota: error.refusal.paths,
              quotaMessage: error.refusal.message,
              ...(storageRefusalOf(error.refusal) === undefined
                ? {}
                : { quotaStorage: storageRefusalOf(error.refusal) }),
            }
          : {}),
      };
    }
  };

  /** One offered ref, carrying the lease this host holds for it (P18). */
  const offerOf = (name: string, leases: Readonly<Record<string, string>>): RevisionPushRef => ({
    name,
    ...(leases[name] === undefined ? {} : { expected: revisionId(leases[name]) }),
  });

  /**
   * Put this device's chat segment back onto the head the remote holds, and offer it again.
   *
   * The CAS loser's whole recovery, and the reason a rejected chat ref is not
   * simply re-queued: the refusal is "you did not have what I have", and
   * offering the same commit again would be refused for exactly the same reason
   * forever. One retry, then the queue (S39, P27, W17 contract 1).
   *
   * @param input - The chat, its ref, the remote, the project's own answer, and
   *   what the remote said when it refused the first offer.
   * @returns This ref's outcome, in the scheduler's shape.
   */
  const replayRejectedChat = async (
    input: Readonly<{
      chatId: string;
      name: string;
      remote: string;
      syncChats: boolean;
      refusal: string | undefined;
    }>,
  ): Promise<SyncRefOutcome> => {
    const context = await chatContext();
    if (context === undefined) {
      return { name: input.name, status: 'rejected', head: undefined, reason: 'This host has no device identity.' };
    }
    /* Only what the remote advertises: fetching a ref it does not have is an
     * error on the native leg, and would turn one ref's refusal into a whole
     * transport failure. A refusal on a ref that is not there is the server's
     * own rule (the allow-list, entitlement), not a CAS loss. */
    const advertised = await port.listRemoteRefs(input.remote);
    if (!advertised.some((entry) => entry.name === input.name)) {
      /* Not a CAS loss: the remote has no such ref, so it refused for a reason
       * of its own — the allow-list, entitlement, its `pre-receive` rule — and
       * it said which (N4). Replacing that with a sentence of Tau's is how the
       * Sync row came to read *The remote refused this ref.* for every one of
       * them; the server's words go through unchanged. */
      return {
        name: input.name,
        status: 'rejected',
        head: undefined,
        reason: input.refusal ?? 'The remote refused this ref.',
      };
    }
    const fetched = await port.fetch({ remote: input.remote, refs: [input.name] });
    const projected = await projectChats({ ...context, refs: fetched.refs });
    if (projected.length > 0) {
      onChatsProjected?.(projected);
    }
    const remoteHead = await port.readRef(remoteTrackingRef(input.remote, input.name));
    const person = actor?.({ runId: undefined, trigger: 'save' });
    const replayed = await replayChatSegment({
      ...context,
      chatId: input.chatId,
      syncChats: input.syncChats,
      actorId,
      ...(person === undefined ? {} : { actor: person }),
      now: now(),
      onto: remoteHead,
    });
    if (replayed.head === undefined) {
      return { name: input.name, status: 'rejected', head: undefined, reason: 'This chat could not be replayed.' };
    }
    /* The lease is the head that was just *fetched*, never the local chain's
     * own value: `refs/tau/chats/*` is an orphan chain per host (W17 a2.9/5). */
    const pushed = await port.push({
      remote: input.remote,
      refs: [{ name: chatRefName(input.chatId), ...(remoteHead === undefined ? {} : { expected: remoteHead }) }],
    });
    const [entry] = pushed.refs;
    return entry === undefined
      ? { name: input.name, status: 'rejected', head: undefined, reason: 'The remote said nothing about this ref.' }
      : outcomeOf(entry);
  };

  return {
    chatContext,
    offerOf,
    outcomeOf,
    pushRecordRef,
    recordChats,
    refusedAll,
    replayRejectedChat,
    staysPerRef,
  };
};
