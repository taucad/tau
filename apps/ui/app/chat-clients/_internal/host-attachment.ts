import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import type { SourceLiveEvent } from '@taucad/agent-host';
import { agentWireLimits } from '@taucad/agent-host/wire';
import { getErrno } from '@taucad/utils/error';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  initialChatProjection,
  reduceChatProjection,
  selectCaughtUp,
  selectPosition,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent } from '#machines/chat-projection.logic.js';

/**
 * Where the attachment stands. A loss carries the error that ended the read when one did, so the chat can tell a host
 * this page can never load (FP10: past the page's worker bound) from a connection it will dial again.
 *
 * @public
 */
export type HostAttachmentStatus = Readonly<{
  type: 'attachment.attached' | 'attachment.lost' | 'attachment.refused';
  reason?: string;
  error?: unknown;
  /** The loss is residual R6: the computer was revoked or is no longer paired, so only pairing it again helps. */
  residual?: 'R6';
}>;

/** How one remote connection closed: a WebSocket close code and reason, or a channel's `CloseInfo`. */
export type RemoteCloseInfo = Readonly<{ code: number | string; reason?: string }>;

/**
 * D17 (HA3): a remote read that is lost is dialled again after a fully jittered delay (a random part of 250 ms,
 * doubling to 30 s), with no give-up, so the tabs a deploy restart (1012) dropped do not redial together. A wake
 * (`online`, `visibilitychange` to visible, `pageshow`) retries at once. A read that attaches starts the curve over
 * once it has held `held`, as the local overlay's subscription must, so a host that attaches and drops at once still
 * backs off.
 *
 * @public
 */
export const remoteReadRetryMilliseconds = { first: 250, longest: 30_000, held: 2000 } as const;

/**
 * Residual R6's close code (AR3-8): 4003 is the device's revocation. Every other close is transient. A browser
 * route's 1008 refusals (`session unavailable`, `route already consumed`) come from one dial's session, which the next
 * dial mints afresh; the daemon-side grant refusals never reach the browser; the peerless reap is the daemon not
 * connecting; and 4401 (`browser session required`) asks for a sign-in, not a pairing.
 *
 * @param info - How the remote connection closed.
 * @returns `revoked` when the close is R6's, else `undefined`.
 * @public
 */
export const remoteCloseRefusal = (info: RemoteCloseInfo): 'revoked' | undefined =>
  info.code === 4003 ? 'revoked' : undefined;

/** Close a retired connection; its close failing changes nothing for the read that replaces it. */
const closeQuietly = async (client: Readonly<{ close: () => Promise<void> }>): Promise<void> => {
  try {
    await client.close();
  } catch {
    /* The connection is gone either way. */
  }
};

/** A read-only connection into one chat's projection. @public */
export type HostAttachmentInput = Readonly<{
  chatId: string;
  connect: () => Promise<
    Pick<AgentHostClient, 'read' | 'catchUp' | 'subscribe' | 'close'> &
      Partial<Pick<AgentHostClient, 'subscribeLive'>> & {
        /** Every close of the connection underneath, with its code (R6 is told from it). Returns an unsubscribe. */
        onClose?: (handler: (info: RemoteCloseInfo) => void) => () => void;
      }
  >;
  projection: Readonly<{
    getSnapshot: () => Readonly<{ context: ChatProjection }>;
    send: (event: Extract<ChatProjectionEvent, { type: 'batch' | 'catch-up' | 'live' | 'clear-live' }>) => void;
  }>;
  onStatus?: (event: HostAttachmentStatus) => void;
  /**
   * Whether this device reads the chat's own segment from the file (HA1, HA-I1). Then the host read path is bypassed:
   * the attachment carries only the live overlay, and the own source feeds the ledger.
   */
  local?: () => Promise<boolean>;
  /** The live overlay (re)subscribed on a local placement: the store's settler sends `attach` if a run is open (HA-I5). */
  onSubscribed?: () => void;
  /** A live event arrived on a local placement: the own source reads again. */
  onLive?: () => void;
}>;

/** A local attachment's held deltas are bounded as early staging was (UTF-8 bytes). */
const heldLiveBytes = 65_536;
const isEnded = (lifecycle: string | undefined): boolean =>
  lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled';

/** Follow the host's one log reader; an idle chat attaches without waiting on an empty read. @public */
export const hostAttachment = createCallbackLogic<EventObject, HostAttachmentInput>(({ input, sendBack, receive }) => {
  let closed = false;
  const capture = new AbortController();
  const isClosed = (): boolean => closed || capture.signal.aborted;
  let terminalRefusal = false;
  let attached = false;
  let readerFenced = false;
  let readerVersion = 0;
  let liveUnavailable = false;
  let pending: { sourceGeneration: string; runId: string; bytes: number; events: SourceLiveEvent[] } | undefined;
  let observedSource = input.projection.getSnapshot().context.ledger.position.sourceGeneration;
  let unsubscribe: (() => void) | undefined;
  let unsubscribeLive: (() => void) | undefined;
  let offClose: (() => void) | undefined;
  let client: Awaited<ReturnType<HostAttachmentInput['connect']>> | undefined;
  const clearLive = (): void => {
    const runId = input.projection.getSnapshot().context.live?.runId;
    if (runId !== undefined) {
      input.projection.send({ type: 'clear-live', runId });
    }
  };
  const publishLive = (event: SourceLiveEvent): void => {
    const { sourceGeneration: _sourceGeneration, ...modelEvent } = event;
    input.projection.send({ type: 'live', event: modelEvent });
  };
  /* The remote read loop (HA3, D17): a lost remote read is read again on the backoff or a wake, never given up. */
  let remote = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retryRedial = false;
  let retries = 0;
  let attachedAt: number | undefined;
  let scheduleRetry = (_again: boolean): void => undefined;
  const report = (status: HostAttachmentStatus): void => {
    if (closed) {
      return;
    }
    /* A dial the API refused because the computer is no longer paired (`HOST_NOT_PAIRED`, `reauth`) is R6 too; only a
     * relayed placement is refused so, so this holds before the read is known to be remote. */
    const event: HostAttachmentStatus =
      status.residual === undefined && getErrno(status.error) === 'HOST_NOT_PAIRED'
        ? { ...status, residual: 'R6' }
        : status;
    sendBack(event);
    input.onStatus?.(event);
    if (event.type === 'attachment.attached') {
      attachedAt = performance.now();
    } else if (remote && event.type === 'attachment.lost') {
      if (attachedAt !== undefined && performance.now() - attachedAt >= remoteReadRetryMilliseconds.held) {
        retries = 0;
      }
      attachedAt = undefined;
      scheduleRetry(event.reason !== 'owner-fenced');
    }
  };

  const onAnswer: NonNullable<Parameters<AgentHostClient['subscribe']>[3]> = (answer) => {
    if (closed) {
      return;
    }
    const previousResetVersion = input.projection.getSnapshot().context.resetVersion;
    const previousSource = input.projection.getSnapshot().context.ledger.position.sourceGeneration;
    if (previousSource !== observedSource) {
      pending = undefined;
    }
    input.projection.send({ type: 'batch', answer });
    observedSource = input.projection.getSnapshot().context.ledger.position.sourceGeneration;
    if (answer.status === 'batch') {
      const projection = input.projection.getSnapshot().context;
      const source = projection.ledger.position.sourceGeneration;
      if (pending !== undefined) {
        const run = projection.ledger.runs[pending.runId];
        // A matching new writer first resets the retired durable owner. Keep its
        // bounded preview staged until the fresh read admits that writer's run.
        const awaitingMatchingSource = source === undefined && answer.sourceGeneration === pending.sourceGeneration;
        if (source !== previousSource && source !== pending.sourceGeneration && !awaitingMatchingSource) {
          pending = undefined;
        } else if (source === pending.sourceGeneration && run !== undefined) {
          const staged = pending;
          pending = undefined;
          if (
            !liveUnavailable &&
            run.lifecycle !== 'completed' &&
            run.lifecycle !== 'failed' &&
            run.lifecycle !== 'cancelled'
          ) {
            for (const event of staged.events) {
              publishLive(event);
            }
          }
        }
      }
      const runId = projection.live?.runId;
      const retiringLive = projection.live;
      const lifecycle = runId === undefined ? undefined : projection.ledger.runs[runId]?.lifecycle;
      if (runId !== undefined && (lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled')) {
        queueMicrotask(() => {
          if (!closed && input.projection.getSnapshot().context.live === retiringLive) {
            input.projection.send({ type: 'clear-live', runId });
          }
        });
      }
    }
    if (answer.status === 'refused') {
      if (pending?.sourceGeneration === previousSource) {
        pending = undefined;
      }
      if (answer.reason === 'unreadable') {
        pending = undefined;
        liveUnavailable = true;
        clearLive();
        terminalRefusal = true;
        report({ type: 'attachment.refused', reason: answer.reason });
      } else if (answer.reason === 'owner-fenced') {
        report({ type: 'attachment.lost', reason: answer.reason });
      }
    } else if (input.projection.getSnapshot().context.resetVersion !== previousResetVersion) {
      // A canonical reset asks for a fresh capture; it neither made progress nor proved an empty current log.
      return selectPosition(input.projection.getSnapshot().context).last;
    } else if (
      answer.events.length > 0 &&
      selectPosition(input.projection.getSnapshot().context).cursor < answer.nextCursor
    ) {
      report({ type: 'attachment.lost', reason: 'read made no progress' });
    } else if (!attached && selectCaughtUp(input.projection.getSnapshot().context)) {
      attached = true;
      report({ type: 'attachment.attached' });
    }
    return selectPosition(input.projection.getSnapshot().context).last;
  };

  /*
   * Local placements (HA1): no generation gate. A run's deltas are dropped once a newer writer's generation for it has
   * been seen on this subscription (generations are opaque and unordered: newer means seen later), and deltas for a
   * run the ledger does not hold yet are held by run until the next own read admits it (AR3-7).
   */
  let local = false;
  let liveConnected = false;
  const latestGeneration = new Map<string, string>();
  const superseded = new Set<string>();
  let held = new Map<string, { current: string | undefined; events: SourceLiveEvent[] }>();
  let heldBytes = 0;
  const receiveLocalLive = (event: SourceLiveEvent): void => {
    input.onLive?.();
    if (superseded.has(event.sourceGeneration)) {
      return;
    }
    const latest = latestGeneration.get(event.runId);
    if (latest !== undefined && latest !== event.sourceGeneration) {
      superseded.add(latest);
    }
    latestGeneration.set(event.runId, event.sourceGeneration);
    const { ledger } = input.projection.getSnapshot().context;
    const run = ledger.runs[event.runId];
    if (run !== undefined) {
      if (!isEnded(run.lifecycle)) {
        publishLive(event);
      }
      return;
    }
    const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
    if (heldBytes + bytes > heldLiveBytes) {
      return; // ponytail: past the bound a delta is dropped; the durable rows still carry the run.
    }
    heldBytes += bytes;
    const hold = held.get(event.runId) ?? { current: ledger.currentRunId, events: [] };
    hold.events.push(event);
    held.set(event.runId, hold);
  };
  /** After an own read: release holds the read admitted, drop those it ended or passed, retire an ended overlay. */
  const releaseHeld = (): void => {
    const { ledger, live } = input.projection.getSnapshot().context;
    const kept = new Map<string, { current: string | undefined; events: SourceLiveEvent[] }>();
    heldBytes = 0;
    for (const [runId, hold] of held) {
      const run = ledger.runs[runId];
      if (run !== undefined) {
        if (!isEnded(run.lifecycle)) {
          for (const event of hold.events) {
            if (!superseded.has(event.sourceGeneration)) {
              publishLive(event);
            }
          }
        }
      } else if (ledger.currentRunId === hold.current) {
        kept.set(runId, hold);
        heldBytes += new TextEncoder().encode(JSON.stringify(hold.events)).byteLength;
      }
    }
    held = kept;
    const lifecycle = live === undefined ? undefined : ledger.runs[live.runId]?.lifecycle;
    if (live !== undefined && (lifecycle === undefined || isEnded(lifecycle))) {
      input.projection.send({ type: 'clear-live', runId: live.runId });
    }
  };

  let connections = 0;
  const connectLive = async (): Promise<void> => {
    const connection = ++connections;
    try {
      const connected = await input.connect();
      if (closed || connection !== connections) {
        await connected.close();
        return;
      }
      client = connected;
      offClose = client.onClose?.((info) => {
        const refusal = remoteCloseRefusal(info);
        if (refusal !== undefined && !local && connection === connections) {
          report({ type: 'attachment.lost', reason: refusal, residual: 'R6' });
        }
      });
      unsubscribeLive = client.subscribeLive?.(
        input.chatId,
        (_chatId, event) => {
          if (closed || liveUnavailable || _chatId !== input.chatId || event.chatId !== input.chatId) {
            return;
          }
          if (local) {
            receiveLocalLive(event);
            return;
          }
          const projection = input.projection.getSnapshot().context;
          if (projection.ledger.position.sourceGeneration !== observedSource) {
            pending = undefined;
            observedSource = projection.ledger.position.sourceGeneration;
          }
          const run = projection.ledger.runs[event.runId];
          if (projection.ledger.position.sourceGeneration === event.sourceGeneration && run !== undefined) {
            if (run.lifecycle !== 'completed' && run.lifecycle !== 'failed' && run.lifecycle !== 'cancelled') {
              publishLive(event);
            }
            return;
          }
          if (
            pending !== undefined &&
            (pending.sourceGeneration !== event.sourceGeneration || pending.runId !== event.runId)
          ) {
            pending = undefined;
            liveUnavailable = true;
            report({ type: 'attachment.lost', reason: 'early live staging identity changed' });
            return;
          }
          const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
          if ((pending?.bytes ?? 0) + bytes > 65_536) {
            pending = undefined;
            liveUnavailable = true;
            clearLive();
            report({ type: 'attachment.lost', reason: 'early live staging exceeded 65536 bytes' });
            return;
          }
          pending ??= { sourceGeneration: event.sourceGeneration, runId: event.runId, bytes: 0, events: [] };
          pending.bytes += bytes;
          pending.events.push(event);
        },
        (error) => {
          if (!closed && !terminalRefusal && connection === connections) {
            pending = undefined;
            liveUnavailable = true;
            clearLive();
            report({ type: 'attachment.lost', reason: 'live subscriber ended', error });
          }
        },
      );
      liveConnected = true;
    } catch (error) {
      if (connection === connections) {
        report({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error), error });
      }
    }
  };

  const beginRead = async (): Promise<void> => {
    if (client === undefined || closed) {
      return;
    }
    const version = ++readerVersion;
    readerFenced = false;
    attached = false;
    unsubscribe?.();
    unsubscribe = undefined;
    const readerClosed = (): boolean => isClosed() || readerVersion !== version;
    try {
      const base = input.projection.getSnapshot().context;
      let validated = false;
      let followCurrent = false;
      const { position: basePosition } = base.ledger;
      if (
        basePosition.sourceGeneration !== undefined &&
        base.sourceHealth &&
        selectCaughtUp(base) &&
        base.fault === undefined
      ) {
        // Omit the health echo once: even an unchanged empty suffix must prove its current source before attaching.
        const answer = await client.read({ chatId: input.chatId, ...basePosition });
        if (readerClosed()) {
          return;
        }
        const current = input.projection.getSnapshot().context;
        if (current.ledger !== base.ledger || current.resetVersion !== base.resetVersion) {
          throw new Error('Read owner changed before validation.');
        }
        if (answer.chatId === input.chatId) {
          if (answer.status === 'refused' && (answer.reason === 'owner-fenced' || answer.reason === 'unreadable')) {
            readerFenced = answer.reason === 'owner-fenced';
            onAnswer(answer);
            return;
          }
          if (
            answer.status === 'batch' &&
            answer.sourceGeneration === basePosition.sourceGeneration &&
            answer.cursor === basePosition.cursor &&
            answer.nextCursor === basePosition.cursor + answer.events.length &&
            answer.endCursor >= answer.nextCursor
          ) {
            onAnswer(answer);
            const observed = input.projection.getSnapshot().context.ledger.position;
            if (observed.sourceGeneration !== answer.sourceGeneration || observed.cursor !== answer.nextCursor) {
              throw new Error('Read owner refused the observed suffix.');
            }
            validated = true;
          }
        }
      }
      for (let attempt = 0; !validated && attempt < 2; attempt += 1) {
        let staged = initialChatProjection;
        let sourceGeneration: string | undefined;
        let capturedEnd: number | undefined;
        let recapture = false;
        // oxlint-disable-next-line no-await-in-loop -- the second capture follows a refused first capture and must validate its newer source serially.
        for await (const frame of client.catchUp({
          chatId: input.chatId,
          limit: agentWireLimits.batchRows,
          maxBytes: agentWireLimits.batchBytes,
          signal: capture.signal,
        })) {
          if (readerClosed()) {
            return;
          }
          const current = input.projection.getSnapshot().context;
          if (current.ledger !== base.ledger || current.resetVersion !== base.resetVersion) {
            throw new Error('Catch-up owner changed before validation.');
          }
          if (frame.type === 'refused') {
            if (frame.answer.reason === 'identity-mismatch' && frame.answer.chatId === input.chatId) {
              if (attempt !== 0) {
                throw new Error('Catch-up source changed repeatedly before validation.');
              }
              recapture = true;
              break;
            }
            if (
              frame.answer.reason === 'writer-owned' &&
              frame.answer.chatId === input.chatId &&
              capturedEnd === undefined
            ) {
              followCurrent = true;
              break;
            }
            if (frame.answer.reason === 'unreadable') {
              terminalRefusal = true;
              liveUnavailable = true;
              pending = undefined;
              report({ type: 'attachment.refused', reason: frame.answer.reason });
              return;
            }
            throw new Error(`Catch-up refused: ${frame.answer.reason}.`);
          }
          if (frame.type === 'page') {
            const { answer } = frame;
            const { cursor } = staged.ledger.position;
            if (
              answer.chatId !== input.chatId ||
              answer.cursor !== cursor ||
              answer.nextCursor !== cursor + answer.facts.length ||
              answer.endCursor < answer.nextCursor ||
              (sourceGeneration !== undefined && sourceGeneration !== answer.sourceGeneration) ||
              (capturedEnd !== undefined && capturedEnd !== answer.endCursor)
            ) {
              throw new Error('Catch-up page does not match its captured source and position.');
            }
            sourceGeneration = answer.sourceGeneration;
            capturedEnd = answer.endCursor;
            staged = reduceChatProjection(staged, { type: 'facts', answer }).state;
            if (staged.ledger.position.cursor !== answer.nextCursor) {
              throw new Error('Catch-up page made no authoritative progress.');
            }
            continue;
          }
          const { position } = staged.ledger;
          if (capturedEnd === undefined) {
            if (frame.position.cursor !== 0 || frame.position.last !== undefined || position.cursor !== 0) {
              throw new Error('Catch-up validation omitted its nonempty captured pages.');
            }
            capturedEnd = 0;
            sourceGeneration = frame.position.sourceGeneration;
          }
          if (
            sourceGeneration !== frame.position.sourceGeneration ||
            frame.position.cursor !== capturedEnd ||
            position.cursor !== capturedEnd ||
            position.last?.leaderEpoch !== frame.position.last?.leaderEpoch ||
            position.last?.sequence !== frame.position.last?.sequence ||
            frame.observedEndCursor < capturedEnd
          ) {
            throw new Error('Catch-up validation does not match its captured end.');
          }
          // Empty batches carry no ledger rows, so only the validated marker establishes their source identity.
          const projection = {
            ...staged,
            sourceHealth: frame.health,
            ledger: {
              ...staged.ledger,
              historyIntact: staged.ledger.historyIntact && frame.health.historyIntact,
              newerHistory: staged.ledger.newerHistory || frame.health.newerHistory,
              position: { ...position, sourceGeneration },
            },
            endCursor: frame.observedEndCursor,
          };
          input.projection.send({ type: 'catch-up', base, projection });
          if (input.projection.getSnapshot().context.ledger !== projection.ledger) {
            throw new Error('Catch-up owner refused the validated projection.');
          }
          if (pending !== undefined && pending.sourceGeneration !== sourceGeneration) {
            pending = undefined;
          }
          observedSource = sourceGeneration;
          onAnswer({
            status: 'batch',
            chatId: input.chatId,
            sourceGeneration,
            sourceHealth: frame.health,
            cursor: capturedEnd,
            nextCursor: capturedEnd,
            endCursor: frame.observedEndCursor,
            events: [],
          });
          validated = true;
          break;
        }
        if (!recapture) {
          break;
        }
      }
      if (readerClosed()) {
        return;
      }
      if (!validated && !followCurrent) {
        throw new Error('Catch-up ended before validation.');
      }
      unsubscribe = client.subscribe(
        { chatId: input.chatId, ...selectPosition(input.projection.getSnapshot().context) },
        () => undefined,
        (error) => {
          if (readerClosed() || readerFenced) {
            return;
          }
          pending = undefined;
          liveUnavailable = true;
          clearLive();
          if (!terminalRefusal) {
            report({ type: 'attachment.lost', reason: 'subscriber ended', error });
          }
        },
        (answer) => {
          if (readerClosed()) {
            return;
          }
          if (answer.status === 'refused' && answer.reason === 'owner-fenced') {
            readerFenced = true;
          }
          const { resetVersion } = input.projection.getSnapshot().context;
          const last = onAnswer(answer);
          if (input.projection.getSnapshot().context.resetVersion !== resetVersion) {
            // Retire this ordinary reader before it can replay the replacement one raw page at a time.
            void beginRead();
          }
          return last;
        },
      );
    } catch (error) {
      if (!readerClosed()) {
        report({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error), error });
      }
    }
  };
  /** Retire this connection's reader, live overlay and client, then dial again from the folded position. */
  const redial = async (): Promise<void> => {
    readerVersion += 1;
    unsubscribe?.();
    unsubscribe = undefined;
    unsubscribeLive?.();
    unsubscribeLive = undefined;
    offClose?.();
    offClose = undefined;
    const retired = client;
    client = undefined;
    if (retired !== undefined) {
      void closeQuietly(retired);
    }
    pending = undefined;
    liveUnavailable = false;
    readerFenced = false;
    clearLive();
    await connectLive();
    await beginRead();
  };
  const retryNow = (): void => {
    clearTimeout(retryTimer);
    retryTimer = undefined;
    const again = retryRedial || liveUnavailable || client === undefined;
    retryRedial = false;
    if (!isClosed() && !terminalRefusal) {
      void (again ? redial() : beginRead());
    }
  };
  /* One retry pending at a time; a fenced reader alone reads again, any other loss dials a new connection. */
  scheduleRetry = (again: boolean): void => {
    retryRedial ||= again;
    if (retryTimer !== undefined || isClosed() || terminalRefusal) {
      return;
    }
    const retryDelayMilliseconds = Math.min(
      remoteReadRetryMilliseconds.first * 2 ** retries,
      remoteReadRetryMilliseconds.longest,
    );
    retries += 1;
    retryTimer = setTimeout(retryNow, Math.random() * retryDelayMilliseconds); // Bound: remoteReadRetryMilliseconds.
  };
  const onWake = (event: Event): void => {
    if (retryTimer !== undefined && (event.type !== 'visibilitychange' || document.visibilityState === 'visible')) {
      retryNow();
    }
  };
  /* `visibilitychange` fires on the document; `pageshow` and `online` on the window. Absent outside a page. */
  const wakes: ReadonlyArray<readonly [EventTarget | undefined, string]> = [
    [
      typeof document !== 'undefined' && typeof document.addEventListener === 'function' ? document : undefined,
      'visibilitychange',
    ],
    [typeof globalThis.addEventListener === 'function' ? globalThis : undefined, 'pageshow'],
    [typeof globalThis.addEventListener === 'function' ? globalThis : undefined, 'online'],
  ];
  for (const [target, type] of wakes) {
    target?.addEventListener(type, onWake);
  }
  receive((event) => {
    if (event.type === 'own-read' && local && !closed) {
      releaseHeld();
    }
  });
  const begin = async (): Promise<void> => {
    /* Decided beside the connect, so a local decision never delays it. */
    const decide = async (): Promise<boolean> => {
      try {
        return (await input.local?.()) ?? false;
      } catch {
        return false;
      }
    };
    const deciding = decide();
    await connectLive();
    local = await deciding;
    if (closed) {
      return;
    }
    if (!local) {
      remote = true;
      if (client === undefined) {
        /* The connect failed before the read was known to be remote: its loss is retried now that it is. */
        scheduleRetry(true);
        return;
      }
      await beginRead();
    } else if (liveConnected) {
      attached = true;
      report({ type: 'attachment.attached' });
      input.onSubscribed?.();
    }
  };
  void begin();
  return () => {
    closed = true;
    clearTimeout(retryTimer);
    for (const [target, type] of wakes) {
      target?.removeEventListener(type, onWake);
    }
    offClose?.();
    capture.abort();
    pending = undefined;
    held.clear();
    clearLive();
    unsubscribe?.();
    unsubscribeLive?.();
    if (client !== undefined) {
      void closeQuietly(client);
    }
  };
});
