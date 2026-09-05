// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { JsonValue } from '#log/event-types.js';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- Package import map resolves this internal source file.
import type { ModelStreamEvent, ModelStreamRequest, ModelTransport } from '#waist/ports.js';

type ScriptedParityUsage = {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens?: number | undefined;
};

/** One response consumed by both sides of the G2 scripted-model fixture. */
export type ScriptedParityResponse = {
  readonly id: string;
  readonly text?: string | undefined;
  readonly toolCalls?:
    | ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly input: JsonValue;
      }>
    | undefined;
  readonly usage: ScriptedParityUsage;
};

const usage = (inputTokens: number, outputTokens: number): ScriptedParityUsage => ({ inputTokens, outputTokens });

/** Shared AV-7 response corpus: tool turn, steady turn, interrupted tool turn. */
export const scriptedParityResponses: readonly ScriptedParityResponse[] = [
  {
    id: 'fixture-assistant-1',
    toolCalls: [{ id: 'fixture-call-read', name: 'read_file', input: { targetFile: 'main.ts' } }],
    usage: usage(100, 4),
  },
  {
    id: 'fixture-assistant-2',
    text: 'Read main.ts and completed the first turn.',
    usage: usage(120, 9),
  },
  {
    id: 'fixture-assistant-3',
    text: 'Continued from the first turn with its tool history intact.',
    usage: usage(140, 11),
  },
  {
    id: 'fixture-assistant-4',
    toolCalls: [{ id: 'fixture-call-interrupted', name: 'read_file', input: { targetFile: 'interrupted.ts' } }],
    usage: usage(160, 4),
  },
  {
    id: 'fixture-assistant-5',
    text: 'Recovered after the interrupted tool call.',
    usage: usage(180, 8),
  },
];

/** Deterministic W3 transport used by package, API-parity, and worker tests. */
export class ScriptedParityModelTransport implements ModelTransport {
  public readonly requests: ModelStreamRequest[] = [];
  readonly #responses: readonly ScriptedParityResponse[];
  #cursor = 0;

  public constructor(responses: readonly ScriptedParityResponse[] = scriptedParityResponses) {
    this.#responses = responses;
  }

  /**
   * Emit the next deterministic scripted response.
   *
   * @param request - Provider request captured for fixture assertions.
   * @returns An async stream containing one response.
   */
  public async *stream(request: ModelStreamRequest): AsyncGenerator<ModelStreamEvent> {
    this.requests.push(request);
    const response = this.#responses[this.#cursor];
    this.#cursor++;
    if (!response) {
      throw new Error(`Scripted parity model exhausted after ${this.#cursor - 1} calls.`);
    }
    if (response.text !== undefined) {
      yield { type: 'text-delta', text: response.text };
    }
    for (const call of response.toolCalls ?? []) {
      yield {
        type: 'tool-input',
        toolCallId: call.id,
        toolName: call.name,
        input: call.input,
      };
    }
    const { inputTokens: input, outputTokens: output, cacheReadTokens: cacheRead = 0 } = response.usage;
    yield {
      type: 'usage',
      usage: {
        input,
        output,
        cacheRead,
        cacheWrite: 0,
        totalTokens: input + output + cacheRead,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
    };
    yield { type: 'completed', stopReason: response.toolCalls?.length ? 'toolUse' : 'stop' };
  }
}
