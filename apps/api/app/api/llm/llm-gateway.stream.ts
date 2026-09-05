import type { ServerResponse } from 'node:http';

export type SseEvent = {
  readonly event?: string;
  readonly data: unknown;
};

const utf8Bytes = (character: string): number => {
  const codePoint = character.codePointAt(0)!;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
};

const parseEvent = (lines: readonly string[]): SseEvent | undefined => {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const rawValue = colon < 0 ? '' : line.slice(colon + 1);
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue;
    if (field === 'event') event = value;
    if (field === 'data') data.push(value);
  }
  const dataText = data.join('\n');
  if (dataText === '' || dataText.trim() === '[DONE]') return undefined;
  try {
    return { ...(event === undefined ? {} : { event }), data: JSON.parse(dataText) as unknown };
  } catch {
    return { ...(event === undefined ? {} : { event }), data: dataText };
  }
};

export const createSseDecoder = (input: {
  readonly onEvent: (event: SseEvent) => void;
  readonly maxEventBytes?: number;
}) => {
  const maxEventBytes = input.maxEventBytes ?? 256 * 1024;
  const decoder = new TextDecoder();
  let currentBytes = 0;
  let line = '';
  let lines: string[] = [];
  let swallowLf = false;

  const finishLine = (): void => {
    if (line !== '') {
      lines.push(line);
      line = '';
      return;
    }
    const event = parseEvent(lines);
    lines = [];
    currentBytes = 0;
    if (event !== undefined) input.onEvent(event);
  };

  const processText = (text: string): void => {
    for (const character of text) {
      if (swallowLf) {
        swallowLf = false;
        if (character === '\n') continue;
      }
      currentBytes += utf8Bytes(character);
      if (currentBytes > maxEventBytes) {
        throw new Error(`SSE event exceeds ${String(maxEventBytes)} bytes`);
      }
      if (character === '\r') {
        finishLine();
        swallowLf = true;
      } else if (character === '\n') {
        finishLine();
      } else {
        line += character;
      }
    }
  };

  return {
    write(chunk: Uint8Array<ArrayBuffer>): void {
      processText(decoder.decode(chunk, { stream: true }));
    },
    end(): void {
      processText(decoder.decode());
      if (line !== '') lines.push(line);
      line = '';
      const event = parseEvent(lines);
      lines = [];
      currentBytes = 0;
      if (event !== undefined) input.onEvent(event);
    },
  };
};

export const consumeSseBody = async (input: {
  readonly body: ReadableStream<Uint8Array<ArrayBuffer>>;
  readonly signal?: AbortSignal;
  readonly maxEventBytes?: number;
  readonly onChunk?: (chunk: Uint8Array<ArrayBuffer>) => void | Promise<void>;
  readonly onEvent?: (event: SseEvent) => void;
}): Promise<number> => {
  const parser = createSseDecoder({
    onEvent: input.onEvent ?? (() => undefined),
    ...(input.maxEventBytes === undefined ? {} : { maxEventBytes: input.maxEventBytes }),
  });
  const reader = input.body.getReader();
  let bytes = 0;
  let completed = false;
  let cancellationStarted = false;
  const cancel = (): void => {
    if (cancellationStarted) return;
    cancellationStarted = true;
    void reader.cancel(input.signal?.reason).catch(() => undefined);
  };
  input.signal?.addEventListener('abort', cancel, { once: true });
  try {
    for (;;) {
      if (input.signal?.aborted) throw input.signal.reason;
      // oxlint-disable-next-line no-await-in-loop -- streams are intentionally read serially and pause here for downstream backpressure.
      const { done, value } = await reader.read();
      if (input.signal?.aborted) throw input.signal.reason;
      if (done) {
        parser.end();
        completed = true;
        return bytes;
      }
      bytes += value.byteLength;
      // oxlint-disable-next-line no-await-in-loop -- awaiting the writer is the backpressure contract.
      await input.onChunk?.(value);
      parser.write(value);
    }
  } finally {
    input.signal?.removeEventListener('abort', cancel);
    if (!completed) cancel();
    reader.releaseLock();
  }
};

export type DownstreamTerminationCause = 'client_abort' | 'finished' | 'gateway_destroy';

export class GatewayDownstreamLifecycle {
  public cause: DownstreamTerminationCause | undefined;
  private readonly onFinish: () => void;
  private readonly onClose: () => void;

  public constructor(
    private readonly response: Pick<ServerResponse, 'once' | 'removeListener'> &
      Partial<Pick<ServerResponse, 'closed' | 'destroyed' | 'writableEnded' | 'writableFinished'>>,
    private readonly onClientAbort: () => void,
  ) {
    this.onFinish = () => this.finish();
    this.onClose = () => this.close();
    response.once('finish', this.onFinish);
    response.once('close', this.onClose);
    this.isTerminated();
  }

  public isTerminated(): boolean {
    if (this.cause !== undefined) return true;
    if (this.response.writableEnded === true || this.response.writableFinished === true) {
      this.finish();
      return true;
    }
    if (this.response.destroyed === true || this.response.closed === true) {
      this.close();
      return true;
    }
    return false;
  }

  public markGatewayDestroy(): void {
    this.cause ??= 'gateway_destroy';
  }

  public dispose(): void {
    this.response.removeListener('finish', this.onFinish);
    this.response.removeListener('close', this.onClose);
  }

  private finish(): void {
    this.cause ??= 'finished';
  }

  private close(): void {
    if (this.cause !== undefined) return;
    this.cause = 'client_abort';
    this.onClientAbort();
  }
}

export type GatewayAbortReason = 'downstream_drain' | 'settlement_deadline' | 'upstream_idle';

export class GatewayAbortScope {
  public readonly controller = new AbortController();
  public abortReason: GatewayAbortReason | undefined;
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private downstreamDrainTimer: ReturnType<typeof setTimeout> | undefined;
  private settlementTimer: ReturnType<typeof setTimeout> | undefined;
  private settlementDeadlineAt: number | undefined;

  public constructor(
    private readonly idleTimeoutMs: number,
    private readonly settlementTimeoutMs: number,
  ) {}

  public touch(): void {
    if (this.controller.signal.aborted) return;
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = undefined;
      this.abort('upstream_idle');
    }, this.idleTimeoutMs);
    this.idleTimer.unref();
  }

  public startDownstreamDrain(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    this.idleTimer = undefined;
    if (this.controller.signal.aborted) return;
    if (this.downstreamDrainTimer !== undefined) clearTimeout(this.downstreamDrainTimer);
    this.downstreamDrainTimer = setTimeout(() => {
      this.downstreamDrainTimer = undefined;
      this.abort('downstream_drain');
    }, this.idleTimeoutMs);
    this.downstreamDrainTimer.unref();
  }

  public finishDownstreamDrain(): void {
    if (this.downstreamDrainTimer !== undefined) clearTimeout(this.downstreamDrainTimer);
    this.downstreamDrainTimer = undefined;
    this.touch();
  }

  public startPostAbortDrain(): void {
    this.ensureSettlementDeadline();
  }

  public settlementDeadline(): number {
    this.ensureSettlementDeadline();
    return this.settlementDeadlineAt!;
  }

  public finishUpstream(): void {
    if (this.idleTimer !== undefined) clearTimeout(this.idleTimer);
    if (this.downstreamDrainTimer !== undefined) clearTimeout(this.downstreamDrainTimer);
    this.idleTimer = undefined;
    this.downstreamDrainTimer = undefined;
  }

  public cancel(error: unknown): void {
    if (!this.controller.signal.aborted) this.controller.abort(error);
    this.finishUpstream();
  }

  public complete(): void {
    this.finishUpstream();
    if (this.settlementTimer !== undefined) clearTimeout(this.settlementTimer);
    this.settlementTimer = undefined;
    this.settlementDeadlineAt = undefined;
  }

  private ensureSettlementDeadline(): void {
    if (this.settlementDeadlineAt !== undefined) return;
    this.settlementDeadlineAt = Date.now() + this.settlementTimeoutMs;
    if (this.controller.signal.aborted) return;
    this.settlementTimer = setTimeout(() => {
      this.settlementTimer = undefined;
      this.abort('settlement_deadline');
    }, this.settlementTimeoutMs);
    this.settlementTimer.unref();
  }

  private abort(reason: GatewayAbortReason): void {
    if (this.controller.signal.aborted) return;
    this.abortReason = reason;
    this.controller.abort(new Error(`Gateway ${reason.replaceAll('_', ' ')}`));
    this.finishUpstream();
  }
}
