import type { UIMessageChunk } from 'ai';
import type { ChatProjection } from '#machines/chat-projection.logic.js';
import { chunksSince } from '#machines/chat-projection.logic.js';

/** The projection is the sole source of a watched run's durable chunks. @public */
export type RunWatchSource = Readonly<{
  runId: string;
  getProjection: () => ChatProjection | undefined;
  subscribe: (listener: () => void) => () => void;
}>;

/** A detachable SDK stream; closing it never sends a host command. @public */
export type RunWatch = Readonly<{ stream: ReadableStream<UIMessageChunk>; detach: () => void }>;

/** The text a plain delta chunk appends, and the block it appends to; `undefined` for any other chunk. */
const deltaOf = (chunk: UIMessageChunk): { key: string; text: string } | undefined => {
  /* Only the bare shape merges: a delta carrying provider metadata keeps its own chunk. */
  if (chunk.type === 'tool-input-delta' && Object.keys(chunk).length === 3) {
    return { key: `tool:${chunk.toolCallId}`, text: chunk.inputTextDelta };
  }
  if ((chunk.type === 'text-delta' || chunk.type === 'reasoning-delta') && Object.keys(chunk).length === 3) {
    return { key: `${chunk.type}:${chunk.id}`, text: chunk.delta };
  }
  return undefined;
};

/**
 * Merge adjacent deltas of one block into one chunk (D-UI-10).
 *
 * The SDK re-parses a tool call's whole accumulated input on every
 * `tool-input-delta`, so the deltas one drain carries cost one parse rather
 * than one each; text and reasoning deltas cost one message snapshot each. The
 * concatenated text is exactly what the SDK would have accumulated.
 */
const coalesceDeltas = (chunks: Iterable<UIMessageChunk>): UIMessageChunk[] => {
  const merged: UIMessageChunk[] = [];
  let open: { key: string; chunk: UIMessageChunk; parts: string[] } | undefined;
  const flush = (): void => {
    if (open !== undefined) {
      const text = open.parts.join('');
      merged.push(
        open.chunk.type === 'tool-input-delta'
          ? { ...open.chunk, inputTextDelta: text }
          : open.chunk.type === 'text-delta' || open.chunk.type === 'reasoning-delta'
            ? { ...open.chunk, delta: text }
            : open.chunk,
      );
      open = undefined;
    }
  };
  for (const chunk of chunks) {
    const delta = deltaOf(chunk);
    if (delta === undefined) {
      flush();
      merged.push(chunk);
      continue;
    }
    if (open?.key === delta.key) {
      open.parts.push(delta.text);
      continue;
    }
    flush();
    open = { key: delta.key, chunk, parts: [delta.text] };
  }
  flush();
  return merged;
};

/**
 * Replay one run's already-projected chunks, follow later folds, and close at
 * the attempt's terminal or paused row. A settlement is not a stream event.
 * @public
 */
export const openRunWatch = (source: RunWatchSource): RunWatch => {
  let sent = 0;
  const initialStreamVersion = source.getProjection()?.views[source.runId]?.streamVersion ?? 0;
  const initialSegmentId = source.getProjection()?.views[source.runId]?.segmentId;
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
    const chunks =
      projection?.live?.runId === source.runId
        ? projection.live.chunks
        : (projection?.views[source.runId]?.chunks ?? []);
    /* A projection reset invalidates this stream; the attachment rereads and
     * the session can open a fresh watch after it has rebuilt the transcript. */
    if (
      chunks.length < sent ||
      projection?.views[source.runId]?.segmentId !== initialSegmentId ||
      (projection?.views[source.runId]?.streamVersion ?? 0) !== initialStreamVersion
    ) {
      close();
      return;
    }
    for (const chunk of coalesceDeltas(chunksSince(chunks, sent))) {
      controller.enqueue(chunk);
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
