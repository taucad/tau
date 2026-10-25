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
 * telemetry in the turn that posts an operation's terminal reply, so any
 * synchronous filesystem work here would delay the next operation; a
 * `WriteStream` buffers the line and returns. It also never throws: a stream
 * reports disk-full or `EACCES` as an `'error'` event, which Node rethrows out
 * of the event loop when nothing listens, and telemetry must not be able to
 * take a kernel process down. Every span it accepts and does not write is
 * counted in `dropped`; one bad record never turns the sink off.
 */

import { isNode } from '#framework/environment.js';
import { toOtlpJson } from '#framework/telemetry-otlp.js';
import type { TelemetryBatch, TelemetrySpanRecord } from '#types/runtime-wire.types.js';

/** A sink that accepts batches without blocking the emitting thread. @public */
export type TelemetryExporter = {
  /**
   * Spans this sink has accepted but not written: a record that would not serialize, a batch refused
   * while the stream buffer was full or a rotation was in flight, or anything after the file failed.
   */
  readonly dropped: number;
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
 * @public
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

/** The line shape a sink writes. @public */
export type TelemetryFileFormat = 'jsonl' | 'otlp';

/**
 * Resolve the line shape this realm writes.
 *
 * Tau's own readers — the trace pane, the runtime-e2e comparator — read the
 * native span shape, so it stays the default; `TAU_TELEMETRY_FORMAT=otlp`
 * hands the same spans to an external collector instead (D8).
 *
 * @returns The configured format, `jsonl` unless OTLP was asked for.
 * @public
 */
export function telemetryFormat(): TelemetryFileFormat {
  // oxlint-disable-next-line n/prefer-global/process -- same environment `telemetryDirectory` reads
  return /^otlp$/iu.test(process.env['TAU_TELEMETRY_FORMAT'] ?? '') ? 'otlp' : 'jsonl';
}

/**
 * Open a rotating JSONL span sink.
 *
 * @param options - Target directory, file name, and rotation threshold.
 * @returns The exporter, or `undefined` when the directory cannot be opened.
 * @public
 *
 * @example <caption>Write a Node host's span batches to its traces directory</caption>
 * ```typescript
 * import { openTelemetryFileSink, telemetryDirectory, telemetryFormat } from '@taucad/runtime/node';
 * import type { TelemetryBatch } from '@taucad/runtime/types';
 *
 * declare const batch: TelemetryBatch;
 * const directory = telemetryDirectory();
 * const sink =
 *   directory === undefined
 *     ? undefined
 *     : await openTelemetryFileSink({ directory, fileName: `cli-${process.pid}.jsonl`, format: telemetryFormat() });
 * sink?.write(batch);
 * sink?.close();
 * ```
 */
export async function openTelemetryFileSink(options: {
  /** Directory that receives the file; created when absent. */
  readonly directory: string;
  /** File name within {@link options.directory}, including the `.jsonl` suffix. */
  readonly fileName: string;
  /** Rotate once the file passes this size. Defaults to 5 MiB. */
  readonly maxBytes?: number;
  /** Line shape. Defaults to Tau's own span records. */
  readonly format?: TelemetryFileFormat;
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
  let closed = false;
  let dropped = 0;

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
   * file that is about to move. Spans emitted inside that window are dropped and
   * counted — telemetry is observational, and a queue that grows under
   * backpressure is the failure this sink exists to avoid. */
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

  /* One record that will not serialize (a BigInt attribute, a cycle) costs that record, never
   * the sink: the rest of the batch and every later batch are still written. */
  const serialize = (batch: TelemetryBatch): string => {
    if (options.format === 'otlp') {
      try {
        return `${toOtlpJson(batch)}\n`;
      } catch {
        dropped += batch.entries.length;
        return '';
      }
    }
    let lines = '';
    for (const entry of batch.entries) {
      try {
        const record: TelemetrySpanRecord = { ...entry, origin: batch.origin, epoch: batch.epoch };
        lines += `${JSON.stringify(record)}\n`;
      } catch {
        dropped++;
      }
    }
    return lines;
  };

  return {
    get dropped() {
      return dropped;
    },
    write(batch) {
      if (closed || batch.entries.length === 0) {
        return;
      }
      if (disabled || !stream || stream.writableLength > maxBufferedBytes) {
        dropped += batch.entries.length;
        return;
      }
      const lines = serialize(batch);
      if (lines === '') {
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
      closed = true;
      disabled = true;
      stream?.end();
      stream = undefined;
    },
  };
}
