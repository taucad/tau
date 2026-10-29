/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import type { Evidence } from '@taucad/agent-observability/contract';
import type { ModelProviderWire } from '#api/llm/model-invocation.types.js';

/** The contract's provider summary fact. */
export type ProviderFact = Extract<Evidence['payload'], { plane: 'summary' }>['fact'] & { kind: 'provider' };

/** What the relayed bytes said about the attempt. No generated text is kept. */
export type ProviderStreamSummary = Readonly<{
  stop: ProviderFact['stop'] | undefined;
  usage: ProviderFact['usage'];
  resolvedModel: string | undefined;
  response: string | undefined;
  /** Milliseconds from the start to the first relayed byte and to the first output text. */
  firstChunk: number | undefined;
  firstText: number | undefined;
}>;

/** A frame larger than this is not parsed; its usage, if any, is reported as partial. */
const maximumFrameCharacters = 1_048_576;
/** Only frames that can carry a stop reason, usage or the first text are parsed at all. */
const interesting = /"(?:usage|stop_reason|finish_reason|type":"response\.|delta)"?/u;

const count = (value: unknown): ProviderFact['usage']['input'] =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
const field = (value: unknown, ...path: readonly string[]): unknown => {
  let current = value;
  for (const key of path) {
    current = typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined;
  }
  return current;
};
const identifier = (value: unknown): string | undefined =>
  typeof value === 'string' && /^[\w:.-]{1,128}$/u.test(value) ? value : undefined;

const anthropicStop: Readonly<Record<string, ProviderFact['stop']>> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  tool_use: 'toolUse',
  max_tokens: 'length',
  refusal: 'error',
  pause_turn: 'stop',
};
const completionStop: Readonly<Record<string, ProviderFact['stop']>> = {
  stop: 'stop',
  tool_calls: 'toolUse',
  function_call: 'toolUse',
  length: 'length',
  content_filter: 'error',
};

/**
 * Reads stop reason, usage and first-output timing from a provider's SSE
 * stream as it is relayed, one frame at a time. It never buffers the stream
 * and never retains output text; a frame it cannot parse is skipped, and
 * nothing it does can throw into the relay.
 */
export class ProviderStreamFacts {
  private readonly decoder = new TextDecoder();
  private pending = '';
  private stop: ProviderFact['stop'] | undefined;
  private readonly usage: { -readonly [Key in keyof ProviderFact['usage']]: ProviderFact['usage'][Key] } = {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
    reasoning: null,
    missing: 'unreported',
  };

  private resolvedModel: string | undefined;
  private response: string | undefined;
  private firstChunk: number | undefined;
  private firstText: number | undefined;
  private oversized = false;

  public constructor(
    private readonly wire: ModelProviderWire,
    private readonly startedAt: number,
    private readonly clock: () => number = performance.now.bind(performance),
  ) {}

  /** @param chunk - Relayed bytes, already forwarded to the client. */
  public accept(chunk: Uint8Array<ArrayBuffer>): void {
    try {
      this.firstChunk ??= this.clock() - this.startedAt;
      this.pending += this.decoder.decode(chunk, { stream: true });
      let newline = this.pending.indexOf('\n');
      while (newline !== -1) {
        this.line(this.pending.slice(0, newline).trimEnd());
        this.pending = this.pending.slice(newline + 1);
        newline = this.pending.indexOf('\n');
      }
      if (this.pending.length > maximumFrameCharacters) {
        this.pending = '';
        this.oversized = true;
      }
    } catch {
      // Observation never affects the relay.
    }
  }

  /** @returns What the stream reported, after its last byte. */
  public summary(): ProviderStreamSummary {
    try {
      this.pending += this.decoder.decode();
    } catch {
      // Observation never affects the relay.
    }
    if (this.pending.length > 0) {
      this.line(this.pending.trimEnd());
      this.pending = '';
    }
    const reported = [this.usage.input, this.usage.output].every((value) => value !== null);
    return {
      stop: this.stop,
      usage: {
        ...this.usage,
        missing: reported
          ? this.oversized
            ? 'partial'
            : 'none'
          : this.usage.input === null && this.usage.output === null
            ? 'unreported'
            : 'partial',
      },
      resolvedModel: this.resolvedModel,
      response: this.response,
      firstChunk: this.firstChunk,
      firstText: this.firstText,
    };
  }

  private line(line: string): void {
    if (!line.startsWith('data:') || line.length > maximumFrameCharacters) {
      this.oversized ||= line.length > maximumFrameCharacters;
      return;
    }
    const data = line.slice(5).trim();
    if (data === '[DONE]' || !interesting.test(data)) {
      return;
    }
    let frame: unknown;
    try {
      frame = JSON.parse(data) as unknown;
    } catch {
      return;
    }
    switch (this.wire) {
      case 'anthropic': {
        this.anthropic(frame);
        break;
      }
      case 'openai-responses': {
        this.responses(frame);
        break;
      }
      case 'openai-completions': {
        this.completions(frame);
        break;
      }
    }
  }

  private text(): void {
    this.firstText ??= this.clock() - this.startedAt;
  }

  private anthropic(frame: unknown): void {
    const type = field(frame, 'type');
    if (type === 'message_start') {
      this.resolvedModel ??= identifier(field(frame, 'message', 'model'));
      this.response ??= identifier(field(frame, 'message', 'id'));
      const usage = field(frame, 'message', 'usage');
      this.usage.input = count(field(usage, 'input_tokens')) ?? this.usage.input;
      this.usage.cacheRead = count(field(usage, 'cache_read_input_tokens')) ?? this.usage.cacheRead;
      this.usage.cacheWrite = count(field(usage, 'cache_creation_input_tokens')) ?? this.usage.cacheWrite;
    } else if (type === 'content_block_delta' && field(frame, 'delta', 'type') === 'text_delta') {
      this.text();
    } else if (type === 'message_delta') {
      const reason = field(frame, 'delta', 'stop_reason');
      this.stop = (typeof reason === 'string' ? anthropicStop[reason] : undefined) ?? this.stop;
      this.usage.output = count(field(frame, 'usage', 'output_tokens')) ?? this.usage.output;
    } else if (type === 'error') {
      this.stop = 'error';
    }
  }

  private responses(frame: unknown): void {
    const type = field(frame, 'type');
    if (type === 'response.output_text.delta') {
      this.text();
      return;
    }
    if (type !== 'response.completed' && type !== 'response.incomplete' && type !== 'response.failed') {
      if (type === 'response.created') {
        this.resolvedModel ??= identifier(field(frame, 'response', 'model'));
        this.response ??= identifier(field(frame, 'response', 'id'));
      } else if (type === 'error') {
        this.stop = 'error';
      }
      return;
    }
    const response = field(frame, 'response');
    this.resolvedModel = identifier(field(response, 'model')) ?? this.resolvedModel;
    this.response = identifier(field(response, 'id')) ?? this.response;
    const output = field(response, 'output');
    if (type === 'response.failed') {
      this.stop = 'error';
    } else if (type === 'response.incomplete') {
      this.stop = field(response, 'incomplete_details', 'reason') === 'max_output_tokens' ? 'length' : 'error';
    } else {
      this.stop =
        Array.isArray(output) && output.some((item: unknown) => field(item, 'type') === 'function_call')
          ? 'toolUse'
          : 'stop';
    }
    const usage = field(response, 'usage');
    const input = count(field(usage, 'input_tokens'));
    const cached = count(field(usage, 'input_tokens_details', 'cached_tokens'));
    this.usage.input = input;
    this.usage.cacheRead = cached;
    this.usage.output = count(field(usage, 'output_tokens'));
    this.usage.reasoning = count(field(usage, 'output_tokens_details', 'reasoning_tokens'));
  }

  private completions(frame: unknown): void {
    this.resolvedModel ??= identifier(field(frame, 'model'));
    this.response ??= identifier(field(frame, 'id'));
    const choice = field(frame, 'choices', '0');
    const content = field(choice, 'delta', 'content');
    if (typeof content === 'string' && content.length > 0) {
      this.text();
    }
    const reason = field(choice, 'finish_reason');
    if (typeof reason === 'string') {
      this.stop = completionStop[reason] ?? 'stop';
    }
    const usage = field(frame, 'usage');
    if (usage !== undefined && usage !== null) {
      this.usage.input = count(field(usage, 'prompt_tokens'));
      this.usage.output = count(field(usage, 'completion_tokens'));
      this.usage.cacheRead = count(field(usage, 'prompt_tokens_details', 'cached_tokens'));
      this.usage.reasoning = count(field(usage, 'completion_tokens_details', 'reasoning_tokens'));
    }
  }
}
