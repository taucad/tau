import process from 'node:process';
import type { LoggerService } from '@nestjs/common';

/**
 * The log sink of tau-storage (DC1): one JSON line per entry on stdout, in the
 * shape Fly's log shipper forwards, with no logging library in the worker's
 * module graph.
 *
 * It scrubs before it writes, whatever the caller passed: a field whose name
 * says grant, receipt, signature, token or authorization is replaced, and a
 * presigned URL's `X-Amz-Signature` (or any `X-Amz-Credential`) is cut out of
 * every string, so a captured log sample can be checked for none of the three
 * (`scripts/check-storage-log-sample.mts`).
 */

const censor = '**REDACTED**';

const sensitiveKey = /grant|receipt|signature|token|authorization|secret|private.?key/iu;

const presignedParameter = /(X-Amz-(?:Signature|Credential|Security-Token)=)[^&\s"']*/giu;

/** A storage-signed token's shape: `v.kid.payload.signature`. */
const signedToken = /\b\d+\.[\w-]{1,64}\.[\w-]{40,}\.[\w-]{40,}\b/gu;

/**
 * Removes credentials from one value, deeply.
 *
 * @param value - A log field.
 * @param depth - How deep the walk already is.
 * @returns The value, safe to write.
 */
export const scrub = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') {
    return value.replaceAll(presignedParameter, `$1${censor}`).replaceAll(signedToken, censor);
  }
  if (value instanceof Error) {
    return { type: value.name, message: scrub(value.message), stack: scrub(value.stack ?? '') };
  }
  if (value === null || typeof value !== 'object' || depth > 6) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrub(item, depth + 1));
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sensitiveKey.test(key) ? censor : scrub(item, depth + 1)]),
  );
};

const levels = { verbose: 10, debug: 20, log: 30, warn: 40, error: 50, fatal: 60 } as const;

type Level = keyof typeof levels;

/**
 * A Nest `LoggerService` writing scrubbed JSON lines.
 *
 * Nest's `Logger` calls `log(fields, message, context)` when the code reads
 * `this.logger.log({ … }, 'message')`, so an object first argument is fields
 * and the next string is the message; the last string is the context.
 */
export class JsonLineLogger implements LoggerService {
  public constructor(
    private readonly service: string,
    private readonly write: (line: string) => void = (line) => {
      process.stdout.write(`${line}\n`);
    },
    private readonly minimum: Level = 'log',
  ) {}

  public log(message: unknown, ...parameters: unknown[]): void {
    this.emit('log', message, parameters);
  }

  public warn(message: unknown, ...parameters: unknown[]): void {
    this.emit('warn', message, parameters);
  }

  public error(message: unknown, ...parameters: unknown[]): void {
    this.emit('error', message, parameters);
  }

  public fatal(message: unknown, ...parameters: unknown[]): void {
    this.emit('fatal', message, parameters);
  }

  public debug(message: unknown, ...parameters: unknown[]): void {
    this.emit('debug', message, parameters);
  }

  public verbose(message: unknown, ...parameters: unknown[]): void {
    this.emit('verbose', message, parameters);
  }

  private emit(level: Level, first: unknown, parameters: readonly unknown[]): void {
    if (levels[level] < levels[this.minimum]) {
      return;
    }
    const strings = parameters.filter((parameter): parameter is string => typeof parameter === 'string');
    const fields = typeof first === 'object' && first !== null ? first : {};
    const message = typeof first === 'string' ? first : (strings[0] ?? '');
    const context = strings.length > (typeof first === 'string' ? 0 : 1) ? strings.at(-1) : undefined;
    this.write(
      JSON.stringify({
        level: levels[level],
        time: Date.now(),
        service: this.service,
        ...(context === undefined ? {} : { context }),
        ...(scrub(fields) as Record<string, unknown>),
        msg: scrub(message),
      }),
    );
  }
}
