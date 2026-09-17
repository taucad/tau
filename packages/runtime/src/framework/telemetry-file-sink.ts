/**
 * Append-only JSONL span sink.
 *
 * Spans are produced in every realm but readable in none: the browser has no
 * host-visible file, and until now only `tau export --telemetry` wrote spans to
 * disk at all. This sink gives every realm that has a filesystem one appendable
 * file per producer, so a whole session's spans — desktop utility, CLI, Node
 * worker — reconcile on one clock in one directory.
 *
 * It is deliberately an *enqueue-and-return* exporter. The dispatcher flushes
 * telemetry inside the render response turn (before `geometryComputed`), so any
 * synchronous filesystem work here would land on the render path; a
 * `WriteStream` buffers the line and returns. It also never throws: a stream
 * reports disk-full or `EACCES` as an `'error'` event, which Node rethrows out
 * of the event loop when nothing listens, and telemetry must not be able to
 * take a kernel process down.
 */

import { isNode } from '#framework/environment.js';
import type { TelemetryBatch, TelemetrySpanRecord } from '#types/runtime-protocol.types.js';

/** A sink that accepts batches without blocking the emitting thread. */
export type TelemetryExporter = {
  /** Enqueue one batch. Never throws, never performs synchronous I/O. */
  write(batch: TelemetryBatch): void;
  /** Stop accepting batches and flush what is already queued. */
  close(): void;
};

/** Rotate a trace file once it passes this size. */
const defaultMaxBytes = 5 * 1024 * 1024;

/** Drop spans rather than let an unflushed stream buffer grow past this. */
const maxBufferedBytes = 1024 * 1024;

/**
 * Resolve the directory this realm writes span JSONL into.
 *
 * `TAU_DESKTOP_LOG_DIR` is honoured because the desktop already exports it to
 * every utility it forks, which is what makes the desktop trace sink on by
 * default with no extra wire hop and no new spawn-time environment. Set
 * `TAU_TELEMETRY_DIR` to redirect it, or `TAU_TELEMETRY=0` to turn it off.
 *
 * @returns The traces directory, or `undefined` when this realm writes no files.
 */
export function telemetryDirectory(): string | undefined {
  if (!isNode()) {
    return undefined;
  }
  // oxlint-disable-next-line n/prefer-global/process -- `process` is the environment this branch just asserted
  const environment = process.env;
  if (/^(0|false|off)$/iu.test(environment['TAU_TELEMETRY'] ?? '')) {
    return undefined;
  }
  const base = environment['TAU_TELEMETRY_DIR'] ?? environment['TAU_DESKTOP_LOG_DIR'];
  return base ? `${base}/traces` : undefined;
}

/**
 * Open a rotating JSONL span sink.
 *
 * @param options - Target directory, file name, and rotation threshold.
 * @returns The exporter, or `undefined` when the directory cannot be opened.
 */
export async function openTelemetryFileSink(options: {
  /** Directory that receives the file; created when absent. */
  readonly directory: string;
  /** File name within {@link options.directory}, including the `.jsonl` suffix. */
  readonly fileName: string;
  /** Rotate once the file passes this size. Defaults to 5 MiB. */
  readonly maxBytes?: number;
}): Promise<TelemetryExporter | undefined> {
  const [{ createWriteStream, mkdirSync, renameSync }, { join }] = await Promise.all([
    import('node:fs'),
    import('node:path'),
  ]);

  const maxBytes = options.maxBytes ?? defaultMaxBytes;
  const filePath = join(options.directory, options.fileName);
  const previousPath = `${filePath}.1`;
  let stream: ReturnType<typeof createWriteStream> | undefined;
  let bytes = 0;
  let disabled = false;

  const open = (): void => {
    const opened = createWriteStream(filePath, { flags: 'a' });
    opened.on('error', () => {
      disabled = true;
      stream = undefined;
    });
    stream = opened;
  };

  try {
    mkdirSync(options.directory, { recursive: true });
    open();
  } catch {
    return undefined;
  }

  /* Rename only once the outgoing stream has flushed, so no line is written to a
   * file that is about to move. Spans emitted inside that window are dropped —
   * telemetry is observational, and a queue that grows under backpressure is the
   * failure this sink exists to avoid. */
  const rotate = (): void => {
    const previous = stream;
    stream = undefined;
    bytes = 0;
    previous?.end(() => {
      try {
        renameSync(filePath, previousPath);
        open();
      } catch {
        disabled = true;
      }
    });
  };

  return {
    write(batch) {
      if (disabled || batch.entries.length === 0) {
        return;
      }
      let lines = '';
      for (const entry of batch.entries) {
        const record: TelemetrySpanRecord = { ...entry, origin: batch.origin, epoch: batch.epoch };
        lines += `${JSON.stringify(record)}\n`;
      }
      if (!stream || stream.writableLength > maxBufferedBytes) {
        return;
      }
      /* Span JSON is ASCII, so length is the byte count; the only consumer of
       * this total is a rotation threshold. */
      bytes += lines.length;
      stream.write(lines);
      if (bytes > maxBytes) {
        rotate();
      }
    },
    close() {
      disabled = true;
      stream?.end();
      stream = undefined;
    },
  };
}
