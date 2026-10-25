import { Readable } from 'node:stream';

/**
 * The start of a request body, kept so the request can be sent once more to
 * another tau-storage member (DC2 spill). tau-storage decides admission before
 * it reads a byte of the body, so what reached the refusing member is only
 * what the hop had in flight; when that fits in the bound, the body is
 * replayable, and a body past the bound is not, which only means that refusal
 * is relayed to the client as before DC2.
 *
 * Chunks are taken from the source with synchronous `read()` calls and
 * recorded in the same step as they are handed on, so no chunk can be taken
 * from the source without being recorded, whatever the hop had buffered when
 * the refusal arrived.
 */

/** Room for a fetch's negotiation and a typical Tau push; past it, a refusal is relayed rather than spilled. */
export const replayLimitBytes = 512 * 1024;

/**
 * A readable that hands on `source`'s chunks after `prefix`, pulling from the
 * source only when it is read.
 *
 * @param source - The body.
 * @param prefix - Chunks already taken from it, sent first.
 * @param taken - Called with each chunk taken from the source, before it is handed on.
 * @returns The stream and a function that detaches it from the source.
 */
const pull = (
  source: Readable,
  prefix: ReadonlyArray<Uint8Array<ArrayBuffer>>,
  taken: (chunk: Uint8Array<ArrayBuffer>) => void,
): { readonly stream: Readable; readonly detach: () => void } => {
  let detached = false;
  const pump = (): void => {
    if (detached) {
      return;
    }
    for (;;) {
      /* `read()` answers null when nothing is buffered. */
      const read: unknown = source.read();
      if (read === null) {
        if (source.readableEnded) {
          stream.push(null);
        }
        return;
      }
      const chunk = read as Uint8Array<ArrayBuffer>;
      taken(chunk);
      if (!stream.push(chunk)) {
        return;
      }
    }
  };
  const ended = (): void => {
    if (!detached) {
      stream.push(null);
    }
  };
  const failed = (error: Error): void => {
    if (!detached) {
      stream.destroy(error);
    }
  };
  const stream: Readable = new Readable({ read: pump });
  for (const chunk of prefix) {
    stream.push(chunk);
  }
  source.on('readable', pump);
  source.once('end', ended);
  source.once('error', failed);
  if (source.readableEnded) {
    stream.push(null);
  }
  return {
    stream,
    detach: () => {
      detached = true;
      source.off('readable', pump);
      source.off('end', ended);
      source.off('error', failed);
    },
  };
};

export class ReplayableBody {
  /** What the first attempt sends. */
  public readonly stream: Readable;
  readonly #source: Readable;
  readonly #chunks: Array<Uint8Array<ArrayBuffer>> = [];
  readonly #detach: () => void;
  #bytes = 0;
  #overflowed = false;

  /**
   * @param source - The client's request body.
   * @param limit - The most bytes kept for a replay.
   */
  public constructor(source: Readable, limit: number = replayLimitBytes) {
    this.#source = source;
    const first = pull(source, [], (chunk) => {
      if (this.#overflowed) {
        return;
      }
      this.#bytes += chunk.byteLength;
      if (this.#bytes > limit) {
        this.#overflowed = true;
        this.#chunks.length = 0;
      } else {
        this.#chunks.push(chunk);
      }
    });
    this.stream = first.stream;
    this.#detach = first.detach;
  }

  /**
   * Detaches the first attempt from the source and returns the whole body
   * again: every chunk taken so far, then the rest of the source.
   *
   * @returns The replay, or `undefined` when the body passed the bound.
   */
  public replay(): Readable | undefined {
    if (this.#overflowed) {
      return undefined;
    }
    this.#detach();
    const recorded = [...this.#chunks];
    this.#chunks.length = 0;
    return pull(this.#source, recorded, () => undefined).stream;
  }
}
