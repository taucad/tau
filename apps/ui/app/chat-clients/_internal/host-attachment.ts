import { createCallbackLogic } from 'xstate';
import type { EventObject } from 'xstate';
import type { SourceLiveEvent } from '@taucad/agent-host';
import { agentWireLimits } from '@taucad/agent-host/wire';
import type { AgentHostClient } from '#services/agent-host-client.js';
import {
  initialChatProjection,
  reduceChatProjection,
  selectCaughtUp,
  selectPosition,
} from '#machines/chat-projection.logic.js';
import type { ChatProjection, ChatProjectionEvent } from '#machines/chat-projection.logic.js';

/** A read-only connection into one chat's projection. @public */
export type HostAttachmentInput = Readonly<{
  chatId: string;
  connect: () => Promise<
    Pick<AgentHostClient, 'read' | 'catchUp' | 'subscribe' | 'close'> & Partial<Pick<AgentHostClient, 'subscribeLive'>>
  >;
  projection: Readonly<{
    getSnapshot: () => Readonly<{ context: ChatProjection }>;
    send: (event: Extract<ChatProjectionEvent, { type: 'batch' | 'catch-up' | 'live' | 'clear-live' }>) => void;
  }>;
  onStatus?: (event: {
    type: 'attachment.attached' | 'attachment.lost' | 'attachment.refused';
    reason?: string;
  }) => void;
}>;

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
  const report = (event: {
    type: 'attachment.attached' | 'attachment.lost' | 'attachment.refused';
    reason?: string;
  }): void => {
    if (!closed) {
      sendBack(event);
      input.onStatus?.(event);
    }
  };

  const onAnswer: NonNullable<Parameters<AgentHostClient['subscribe']>[3]> = (answer) => {
    if (closed) {
      return;
    }
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

  const connectLive = async (): Promise<void> => {
    try {
      client = await input.connect();
      if (closed) {
        await client.close();
        return;
      }
      unsubscribeLive = client.subscribeLive?.(
        input.chatId,
        (_chatId, event) => {
          if (closed || liveUnavailable || _chatId !== input.chatId || event.chatId !== input.chatId) {
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
        () => {
          if (!closed && !terminalRefusal) {
            pending = undefined;
            liveUnavailable = true;
            clearLive();
            report({ type: 'attachment.lost', reason: 'live subscriber ended' });
          }
        },
      );
    } catch (error) {
      report({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error) });
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
        () => {
          if (readerClosed() || readerFenced) {
            return;
          }
          pending = undefined;
          liveUnavailable = true;
          clearLive();
          if (!terminalRefusal) {
            report({ type: 'attachment.lost', reason: 'subscriber ended' });
          }
        },
        (answer) => {
          if (readerClosed()) {
            return;
          }
          if (answer.status === 'refused' && answer.reason === 'owner-fenced') {
            readerFenced = true;
          }
          return onAnswer(answer);
        },
      );
    } catch (error) {
      if (!readerClosed()) {
        report({ type: 'attachment.lost', reason: error instanceof Error ? error.message : String(error) });
      }
    }
  };
  receive((event) => {
    if (event.type === 'retry-read' && readerFenced && !closed && !liveUnavailable) {
      void beginRead();
    }
  });
  const begin = async (): Promise<void> => {
    await connectLive();
    await beginRead();
  };
  void begin();
  return () => {
    closed = true;
    capture.abort();
    pending = undefined;
    clearLive();
    unsubscribe?.();
    unsubscribeLive?.();
    if (client !== undefined) {
      void client.close();
    }
  };
});
