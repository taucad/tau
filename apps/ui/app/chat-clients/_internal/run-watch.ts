import type { UIMessageChunk } from 'ai';
import type { ChatProjection } from '#machines/chat-projection.logic.js';

/** The projection is the sole source of a watched run's durable chunks. @public */
export type RunWatchSource = Readonly<{
  runId: string;
  getProjection: () => ChatProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

/** A detachable SDK stream; closing it never sends a host command. @public */
export type RunWatch = Readonly<{ stream: ReadableStream<UIMessageChunk>; detach: () => void }>;

/**
 * Replay one run's already-projected chunks, follow later folds, and close at
 * the attempt's terminal or paused row. A settlement is not a stream event.
 * @public
 */
export const openRunWatch = (source: RunWatchSource): RunWatch => {
  let sent = 0;
  let closed = false;
  let controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;
  let unsubscribe: (() => void) | undefined;
  const close = (cancelled = false): void => {
    if (closed) {
      return;
    }
    closed = true;
    unsubscribe?.();
    if (!cancelled) {
      controller?.close();
    }
  };
  const drain = (): void => {
    if (closed || controller === undefined) {
      return;
    }
    const projection = source.getProjection();
    const chunks = projection?.views[source.runId]?.chunks ?? [];
    /* A projection reset invalidates this stream; the attachment rereads and
     * the session can open a fresh watch after it has rebuilt the transcript. */
    if (chunks.length < sent) {
      close();
      return;
    }
    for (let at = sent; at < chunks.length; at++) {
      controller.enqueue(chunks[at]);
    }
    sent = chunks.length;
    const lifecycle = projection?.ledger.runs[source.runId]?.lifecycle;
    if (lifecycle === 'paused' || lifecycle === 'completed' || lifecycle === 'failed' || lifecycle === 'cancelled') {
      close();
    }
  };
  const stream = new ReadableStream<UIMessageChunk>({
    start(active) {
      controller = active;
      unsubscribe = source.subscribe(drain);
      if (closed) {
        unsubscribe();
      } else {
        drain();
      }
    },
    cancel() {
      close(true);
    },
  });
  return {
    stream,
    detach: () => {
      close();
    },
  };
};
