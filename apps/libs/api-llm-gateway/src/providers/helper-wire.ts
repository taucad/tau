/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields use snake_case. */
import type { ModelMessage } from 'ai';
import { reasoningLevels } from '@taucad/chat/constants';
import type { ReasoningLevel } from '@taucad/chat/constants';
import type { Model } from '@taucad/chat/model-catalog';
import type { ModelProviderWire } from '#model-invocation.types.js';
import { upstreamModelId } from '#providers/provider-gateway.js';
import type { HelperModelRoute } from '#providers/provider-gateway.js';

/**
 * The self-host helper codec: one request builder and one stream reader per
 * provider wire, beside the transport in `provider-gateway.ts`. A helper sends a
 * server-owned system prompt and text or image messages, never tools, and reads
 * back only text and usage.
 */

/** What a helper surface asks the model. */
export type HelperPrompt = {
  readonly system: string;
  readonly messages: readonly ModelMessage[];
  readonly maximumOutputTokens: number;
};

/**
 * Token counts in Responses terms: `input` includes cached input, `output`
 * includes reasoning. `cacheWrite` is reported separately where the provider
 * states it and is already inside `input`.
 */
export type HelperUsage = {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheWrite: number;
  readonly reasoning: number;
};

export type HelperStreamEvent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'usage'; readonly usage: HelperUsage };

/**
 * A failure frame inside a provider stream that had already answered 200.
 *
 * `body` is the frame's error object, for provider-account recognition; the
 * message names only its code, because the provider's sentence can quote the
 * request.
 */
export class HelperStreamFailure extends Error {
  public constructor(
    public readonly code: string | undefined,
    public readonly body: unknown,
  ) {
    super(`Provider stream failed (${code ?? 'no code'})`);
    this.name = 'HelperStreamFailure';
  }
}

/** The parts of a catalog row a helper request reads. */
export type HelperModelRow = Pick<Model, 'configuration'> & Partial<Pick<Model, 'support' | 'details'>>;

type RequestOptions = Model['configuration'];
type JsonRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const base64Of = (data: ArrayBuffer | ArrayBufferView): string =>
  (ArrayBuffer.isView(data) ? Buffer.from(data.buffer, data.byteOffset, data.byteLength) : Buffer.from(data)).toString(
    'base64',
  );

/**
 * An image part as one URL: `http(s)` and `data:` pass through, raw base64 or
 * bytes become a data URL. The same projection the previous helper path made.
 */
const imageUrl = (data: unknown, mediaType: string | undefined): string | undefined => {
  if (data instanceof URL) {
    return data.toString();
  }
  if (typeof data === 'string') {
    return /^(?:https?:|data:)/u.test(data) ? data : `data:${mediaType ?? 'image/png'};base64,${data}`;
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return `data:${mediaType ?? 'image/png'};base64,${base64Of(data)}`;
  }
  return undefined;
};

type HelperPart = { readonly kind: 'text'; readonly text: string } | { readonly kind: 'image'; readonly url: string };
type HelperMessage = { readonly role: 'user' | 'assistant'; readonly parts: readonly HelperPart[] };

/**
 * The prompt as wire-neutral messages. System messages join the system prompt;
 * tool traffic, reasoning and non-image files are dropped, as a helper sends none.
 */
const neutralPrompt = (prompt: HelperPrompt): { system: string; messages: HelperMessage[] } => {
  const system = [prompt.system];
  const messages: HelperMessage[] = [];
  for (const message of prompt.messages) {
    if (message.role === 'system') {
      system.push(message.content);
      continue;
    }
    if (message.role === 'tool') {
      continue;
    }
    const content: Exclude<typeof message.content, string> =
      typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
    const parts: HelperPart[] = [];
    for (const part of content) {
      if (part.type === 'text' && part.text.length > 0) {
        parts.push({ kind: 'text', text: part.text });
      } else if (part.type === 'image' || (part.type === 'file' && part.mediaType.startsWith('image/'))) {
        const url = part.type === 'image' ? imageUrl(part.image, part.mediaType) : imageUrl(part.data, part.mediaType);
        if (url !== undefined) {
          parts.push({ kind: 'image', url });
        }
      }
    }
    if (parts.length > 0) {
      messages.push({ role: message.role, parts });
    }
  }
  return { system: system.filter((text) => text.length > 0).join('\n\n'), messages };
};

const dataUrl = /^data:([^;,]+);base64,(.*)$/su;

const anthropicImage = (url: string): JsonRecord => {
  const match = dataUrl.exec(url);
  return match
    ? { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
    : { type: 'image', source: { type: 'url', url } };
};

/** `temperature`, when the catalog row sets one. */
const sampling = (options: RequestOptions): JsonRecord =>
  options.temperature === undefined ? {} : { temperature: options.temperature };

/*
 * A helper answers a two-word name inside a 64-token ceiling, and a reasoning
 * model spends that ceiling thinking before it writes a word. So a helper asks
 * every row for the least reasoning it accepts, never the row's default:
 *
 * - The Responses wire takes OpenAI's `none`, the effort the funded helper
 *   sends; xAI has no off switch, so it takes the row's lowest level.
 * - Anthropic gets no `thinking` and no `output_config` effort.
 * - Vertex gets the row's lowest Gemini thinking level. Tau's levels start at
 *   `low`, the floor every Gemini row accepts; `minimal` is not one of them.
 * - Moonshot's Kimi gets its lowest `reasoning_effort`.
 * - Together's Kimi and GLM take no effort; they turn thinking off with
 *   `reasoning.enabled: false`, the switch pi-ai's Together codec sends for
 *   these models.
 */

/** Providers with an effort that turns reasoning off, as the funded helper sends it. */
const reasoningOffEffort: Partial<Record<HelperModelRoute['providerId'], string>> = { openai: 'none' };

/** Together families that take `reasoning.enabled` instead of an effort. */
const togetherThinkingFamilies = new Set<string>(['kimi', 'glm']);

/** The row's lowest reasoning level: its first declared level, else the floor every Tau level starts at. */
const lowestLevel = (row: HelperModelRow): ReasoningLevel => row.support?.reasoning?.levels[0] ?? reasoningLevels[0];

const responsesBody = (route: HelperModelRoute, row: HelperModelRow, prompt: HelperPrompt): JsonRecord => {
  const { system, messages } = neutralPrompt(prompt);
  const options = row.configuration;
  return {
    model: upstreamModelId(route),
    stream: true,
    max_output_tokens: prompt.maximumOutputTokens,
    ...sampling(options),
    ...(options.reasoning === undefined
      ? {}
      : { reasoning: { effort: reasoningOffEffort[route.providerId] ?? lowestLevel(row) } }),
    input: [
      ...(system.length > 0 ? [{ role: 'system', content: system }] : []),
      ...messages.map((message) =>
        message.role === 'assistant'
          ? {
              role: 'assistant',
              content: message.parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join(''),
            }
          : {
              role: 'user',
              content: message.parts.map((part) =>
                part.kind === 'text'
                  ? { type: 'input_text', text: part.text }
                  : { type: 'input_image', image_url: part.url, detail: 'auto' },
              ),
            },
      ),
    ],
  };
};

const anthropicBody = (model: string, options: RequestOptions, prompt: HelperPrompt): JsonRecord => {
  const { system, messages } = neutralPrompt(prompt);
  return {
    model,
    stream: true,
    max_tokens: prompt.maximumOutputTokens,
    ...sampling(options),
    ...(system.length > 0 ? { system } : {}),
    messages: messages.map((message) => ({
      role: message.role,
      content: message.parts.map((part) =>
        part.kind === 'text' ? { type: 'text', text: part.text } : anthropicImage(part.url),
      ),
    })),
  };
};

/**
 * How one completions provider takes the request options, where it differs
 * from the OpenAI default (`max_tokens`, `temperature`, no reasoning field).
 *
 * - Moonshot's Kimi fixes its sampling and output ceiling and takes
 *   `reasoning_effort`, so neither limit nor temperature is sent.
 * - Vertex takes Gemini's thinking level under `extra_body.google`, upper-cased
 *   as the portable host sends it. Thoughts are not requested: a helper reads
 *   only the answer.
 * - Together's Kimi and GLM take `reasoning.enabled`.
 */
const completionsOptions = (route: HelperModelRoute, row: HelperModelRow, prompt: HelperPrompt): JsonRecord => {
  const options = row.configuration;
  if (route.providerId === 'moonshot') {
    return options.reasoning?.effort === undefined ? {} : { reasoning_effort: lowestLevel(row) };
  }
  const thinks =
    route.providerId === 'vertexai' &&
    options.thinkingLevel !== undefined &&
    options.thinkingLevel !== 'THINKING_LEVEL_UNSPECIFIED';
  const togetherThinks = route.providerId === 'together' && togetherThinkingFamilies.has(row.details?.family ?? '');
  return {
    max_tokens: prompt.maximumOutputTokens,
    ...sampling(options),
    ...(thinks
      ? { extra_body: { google: { thinking_config: { thinking_level: lowestLevel(row).toUpperCase() } } } }
      : {}),
    ...(togetherThinks ? { reasoning: { enabled: false } } : {}),
  };
};

const completionsBody = (route: HelperModelRoute, row: HelperModelRow, prompt: HelperPrompt): JsonRecord => {
  const { system, messages } = neutralPrompt(prompt);
  return {
    model: upstreamModelId(route),
    stream: true,
    stream_options: { include_usage: true },
    ...completionsOptions(route, row, prompt),
    messages: [
      ...(system.length > 0 ? [{ role: 'system', content: system }] : []),
      ...messages.map((message) => ({
        role: message.role,
        content: message.parts.every((part) => part.kind === 'text')
          ? message.parts.map((part) => part.text).join('')
          : message.parts.map((part) =>
              part.kind === 'text'
                ? { type: 'text', text: part.text }
                : { type: 'image_url', image_url: { url: part.url } },
            ),
      })),
    ],
  };
};

/**
 * The native streaming request a helper sends on its route's wire.
 *
 * The row's temperature and the helper's own output ceiling reach the
 * provider. Reasoning does not run at the row's default: each wire asks for the
 * least reasoning the row accepts, so the answer fits the ceiling.
 *
 * @param route - The helper's resolved route.
 * @param row - The catalog row: its `configuration`, reasoning `support` and family.
 * @param prompt - The helper prompt.
 * @returns The JSON body for `executeGatewayProviderRequest`.
 */
export const helperRequestBody = (route: HelperModelRoute, row: HelperModelRow, prompt: HelperPrompt): JsonRecord => {
  switch (route.wire) {
    case 'openai-responses': {
      return responsesBody(route, row, prompt);
    }
    case 'anthropic': {
      return anthropicBody(upstreamModelId(route), row.configuration, prompt);
    }
    case 'openai-completions': {
      return completionsBody(route, row, prompt);
    }
  }
};

/** Each SSE event's `data` payload; `[DONE]` and comments are skipped. */
async function* sseData(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator {
  const decoder = new TextDecoder();
  let buffer = '';
  const parse = (block: string): unknown => {
    const data = block
      .split(/\r?\n/u)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(line.startsWith('data: ') ? 6 : 5))
      .join('\n');
    if (data.length === 0 || data === '[DONE]') {
      return undefined;
    }
    try {
      return JSON.parse(data) as unknown;
    } catch {
      return undefined;
    }
  };
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/u);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      const event = parse(block);
      if (event !== undefined) {
        yield event;
      }
    }
  }
  buffer += decoder.decode();
  const last = parse(buffer);
  if (last !== undefined) {
    yield last;
  }
}

/** A provider token count, or `undefined` when it is absent or not a non-negative safe integer. */
const count = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;

const field = (value: unknown, ...path: string[]): unknown => {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
};

const failure = (error: unknown): HelperStreamFailure => {
  const code = field(error, 'code') ?? field(error, 'type') ?? field(error, 'status');
  return new HelperStreamFailure(typeof code === 'string' || typeof code === 'number' ? String(code) : undefined, {
    error,
  });
};

type MutableUsage = { -readonly [K in keyof HelperUsage]: HelperUsage[K] };

const emptyUsage = (): MutableUsage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0 });

async function* readResponses(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<HelperStreamEvent> {
  const usage = emptyUsage();
  for await (const event of sseData(body)) {
    switch (field(event, 'type')) {
      case 'response.output_text.delta': {
        const delta = field(event, 'delta');
        if (typeof delta === 'string' && delta.length > 0) {
          yield { type: 'text', text: delta };
        }
        break;
      }
      case 'response.completed':
      case 'response.incomplete': {
        const reported = field(event, 'response', 'usage');
        usage.input = count(field(reported, 'input_tokens')) ?? usage.input;
        usage.output = count(field(reported, 'output_tokens')) ?? usage.output;
        usage.cacheRead = count(field(reported, 'input_tokens_details', 'cached_tokens')) ?? usage.cacheRead;
        usage.reasoning = count(field(reported, 'output_tokens_details', 'reasoning_tokens')) ?? usage.reasoning;
        break;
      }
      case 'response.failed': {
        throw failure(field(event, 'response', 'error'));
      }
      case 'error': {
        throw failure(field(event, 'error') ?? event);
      }
    }
  }
  yield { type: 'usage', usage };
}

async function* readAnthropic(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<HelperStreamEvent> {
  // Anthropic's `input_tokens` excludes cache reads and writes; the Responses total includes them.
  let uncached = 0;
  const usage = emptyUsage();
  const absorb = (reported: unknown): void => {
    uncached = count(field(reported, 'input_tokens')) ?? uncached;
    usage.cacheRead = count(field(reported, 'cache_read_input_tokens')) ?? usage.cacheRead;
    usage.cacheWrite = count(field(reported, 'cache_creation_input_tokens')) ?? usage.cacheWrite;
    usage.output = count(field(reported, 'output_tokens')) ?? usage.output;
  };
  for await (const event of sseData(body)) {
    switch (field(event, 'type')) {
      case 'content_block_delta': {
        // Thinking and signature deltas are not the answer.
        const text = field(event, 'delta', 'type') === 'text_delta' ? field(event, 'delta', 'text') : undefined;
        if (typeof text === 'string' && text.length > 0) {
          yield { type: 'text', text };
        }
        break;
      }
      case 'message_start': {
        absorb(field(event, 'message', 'usage'));
        break;
      }
      case 'message_delta': {
        absorb(field(event, 'usage'));
        break;
      }
      case 'error': {
        throw failure(field(event, 'error') ?? event);
      }
    }
  }
  usage.input = uncached + usage.cacheRead + usage.cacheWrite;
  yield { type: 'usage', usage };
}

async function* readCompletions(body: ReadableStream<Uint8Array<ArrayBuffer>>): AsyncGenerator<HelperStreamEvent> {
  const usage = emptyUsage();
  for await (const event of sseData(body)) {
    // Vertex wraps a stream error in a one-element array.
    const frame = Array.isArray(event) ? (event[0] as unknown) : event;
    const error = field(frame, 'error');
    if (error !== undefined && error !== null) {
      throw failure(error);
    }
    const choices = field(frame, 'choices');
    const delta = Array.isArray(choices) ? field(choices[0], 'delta', 'content') : undefined;
    // Reasoning (`reasoning`, `reasoning_content`) and tool frames are not the answer.
    if (typeof delta === 'string' && delta.length > 0) {
      yield { type: 'text', text: delta };
    }
    const reported = field(frame, 'usage');
    if (isRecord(reported)) {
      usage.input = count(reported['prompt_tokens']) ?? usage.input;
      usage.output = count(reported['completion_tokens']) ?? usage.output;
      // Moonshot reports cache hits at the top level of `usage`, everyone else under `prompt_tokens_details`.
      usage.cacheRead =
        count(field(reported, 'prompt_tokens_details', 'cached_tokens')) ??
        count(reported['cached_tokens']) ??
        usage.cacheRead;
      usage.reasoning = count(field(reported, 'completion_tokens_details', 'reasoning_tokens')) ?? usage.reasoning;
    }
  }
  yield { type: 'usage', usage };
}

/**
 * The answer text and final usage of one provider stream.
 *
 * Text arrives as it streams; usage arrives once, last. Reasoning, thinking and
 * tool frames are skipped. A failure frame throws {@link HelperStreamFailure}.
 *
 * @param wire - The route's provider wire.
 * @param body - The provider's SSE body.
 * @returns The helper's events.
 */
export const readHelperStream = (
  wire: ModelProviderWire,
  body: ReadableStream<Uint8Array<ArrayBuffer>>,
): AsyncGenerator<HelperStreamEvent> => {
  switch (wire) {
    case 'openai-responses': {
      return readResponses(body);
    }
    case 'anthropic': {
      return readAnthropic(body);
    }
    case 'openai-completions': {
      return readCompletions(body);
    }
  }
};
