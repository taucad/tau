import { createHash } from 'node:crypto';
import type { Evidence } from '@taucad/agent-observability/contract';
import { contentLimits, evidenceLimits } from '@taucad/agent-observability/contract';
import { retainText } from '@taucad/agent-observability/content-redaction';
import type { ModelProviderWire } from '@taucad/api-llm-gateway';

/** The contract's content payload. */
export type ContentPayload = Extract<Evidence['payload'], { plane: 'content' }>;
/** One recorded section: its messages and how many parts the bounds left out. */
export type ContentSection = NonNullable<ContentPayload['input']>;

/** One part of a message in the one form every wire is normalised to, before redaction and caps. */
export type ContentPart =
  | Readonly<{ kind: 'text' | 'thinking'; text: string }>
  | Readonly<{ kind: 'tool-call'; call: string; name: string; text: string }>
  | Readonly<{ kind: 'tool-result'; call: string; error: boolean; text: string }>
  | Readonly<{ kind: 'media'; mime: string; bytes: number; digest?: string | undefined }>;

/** One role-labelled message in the normalised form. */
export type ContentMessage = Readonly<{
  role: 'system' | 'developer' | 'user' | 'assistant' | 'tool';
  parts: readonly ContentPart[];
}>;

/** What a request body says about one call: what was new in it, what it was given, and its parameters. */
export type RequestContent = Readonly<{
  /** The messages after the last assistant message: the new user message, or the tool results it answers. */
  messages: readonly ContentMessage[];
  context: NonNullable<ContentPayload['context']>;
  parameters: ContentPayload['parameters'];
}>;

/** A binary body is digested only up to this size, so hashing a large attachment never blocks the event loop. */
const digestLimitBytes = 1_048_576;
/** The text a section may keep in total, so input and output together stay inside one 256 KiB envelope. */
export const sectionTextBudget = 98_304;
/** The output text a capture collects before it stops, in characters. */
export const outputCaptureLimit = 262_144;

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const field = (value: unknown, ...path: readonly string[]): unknown => {
  let current = value;
  for (const key of path) {
    current = typeof current === 'object' && current !== null ? Reflect.get(current, key) : undefined;
  }
  return current;
};
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

const callShape = /^[\w:.-]{1,128}$/u;
const nameShape = /^[\w.:-]{1,128}$/u;
const mimeShape = /^[\w.+-]{1,64}\/[\w.+-]{1,64}$/u;
/** A provider's tool call id as the contract can carry it: as it is, or a digest of it. */
const callId = (value: unknown): string => {
  const id = text(value) ?? '';
  return callShape.test(id) ? id : `call-${sha256(id).slice(0, 16)}`;
};
const toolName = (value: unknown): string => {
  const name = text(value) ?? '';
  return nameShape.test(name) ? name : 'unknown-tool';
};

const decodedBytes = (base64: string): number =>
  Math.max(0, Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0));

/** An image or file as its type and size, with a digest when it is at most 1 MiB. Its bytes are never kept. */
const media = (mime: unknown, base64: string | undefined): ContentPart => {
  const type = text(mime) ?? '';
  const bytes = base64 === undefined ? 0 : decodedBytes(base64);
  return {
    kind: 'media',
    mime: mimeShape.test(type) ? type : 'application/octet-stream',
    bytes,
    ...(base64 !== undefined && bytes <= digestLimitBytes ? { digest: sha256(base64) } : {}),
  };
};
const dataUrl = /^data:([^;,]*)(;base64)?,/u;
/** An image or file given as a URL: a data URL's type and size, or nothing of a remote URL. */
const urlMedia = (url: unknown): ContentPart => {
  const value = text(url) ?? '';
  const match = dataUrl.exec(value);
  if (match === null) {
    return media(undefined, undefined);
  }
  const body = value.slice(match[0].length);
  return match[2] === undefined
    ? { kind: 'media', mime: mimeShape.test(match[1] ?? '') ? match[1]! : 'text/plain', bytes: body.length }
    : media(match[1], body);
};

const message = (role: ContentMessage['role'], parts: readonly ContentPart[]): ContentMessage => ({ role, parts });

/* Anthropic Messages. */

const anthropicResult = (block: unknown): ContentPart[] => {
  const content = field(block, 'content');
  const nested = typeof content === 'string' ? [{ type: 'text', text: content }] : list(content);
  const result: ContentPart = {
    kind: 'tool-result',
    call: callId(field(block, 'tool_use_id')),
    error: field(block, 'is_error') === true,
    text: nested
      .flatMap((item) => (field(item, 'type') === 'text' ? [text(field(item, 'text')) ?? ''] : []))
      .join('\n'),
  };
  return [result, ...nested.flatMap((item) => (field(item, 'type') === 'image' ? [anthropicMedia(item)] : []))];
};
const anthropicMedia = (block: unknown): ContentPart => {
  const source = field(block, 'source');
  return field(source, 'type') === 'base64'
    ? media(field(source, 'media_type'), text(field(source, 'data')))
    : media(undefined, undefined);
};
const anthropicPart = (block: unknown): ContentPart[] => {
  switch (field(block, 'type')) {
    case 'text': {
      return [{ kind: 'text', text: text(field(block, 'text')) ?? '' }];
    }
    case 'thinking': {
      return [{ kind: 'thinking', text: text(field(block, 'thinking')) ?? '' }];
    }
    case 'image': {
      return [anthropicMedia(block)];
    }
    case 'document': {
      const source = field(block, 'source');
      return field(source, 'type') === 'text'
        ? [{ kind: 'text', text: text(field(source, 'data')) ?? '' }]
        : [anthropicMedia(block)];
    }
    case 'tool_use':
    case 'server_tool_use': {
      return [
        {
          kind: 'tool-call',
          call: callId(field(block, 'id')),
          name: toolName(field(block, 'name')),
          text: JSON.stringify(field(block, 'input') ?? {}),
        },
      ];
    }
    default: {
      /* Signatures, redacted (encrypted) thinking and server results are never recorded. */
      return [];
    }
  }
};
const anthropicMessages = (body: unknown): ContentMessage[] | undefined => {
  const messages = field(body, 'messages');
  if (!Array.isArray(messages)) {
    return undefined;
  }
  return messages.flatMap((item: unknown): ContentMessage[] => {
    const role = field(item, 'role') === 'assistant' ? 'assistant' : 'user';
    const content = field(item, 'content');
    if (typeof content === 'string') {
      return [message(role, [{ kind: 'text', text: content }])];
    }
    const blocks = list(content);
    const results = blocks.filter((block) => field(block, 'type') === 'tool_result');
    const rest = blocks.filter((block) => field(block, 'type') !== 'tool_result');
    return [
      ...(results.length === 0
        ? []
        : [
            message(
              'tool',
              results.flatMap((block) => anthropicResult(block)),
            ),
          ]),
      ...(rest.length === 0 && results.length > 0
        ? []
        : [
            message(
              role,
              rest.flatMap((block) => anthropicPart(block)),
            ),
          ]),
    ];
  });
};

/* OpenAI chat completions. */

const completionsPart = (part: unknown): ContentPart[] => {
  switch (field(part, 'type')) {
    case 'text': {
      return [{ kind: 'text', text: text(field(part, 'text')) ?? '' }];
    }
    case 'image_url': {
      return [urlMedia(field(part, 'image_url', 'url'))];
    }
    case 'file': {
      return [urlMedia(field(part, 'file', 'file_data'))];
    }
    case 'input_audio': {
      return [
        media(
          `audio/${text(field(part, 'input_audio', 'format')) ?? 'unknown'}`,
          text(field(part, 'input_audio', 'data')),
        ),
      ];
    }
    default: {
      return [];
    }
  }
};
const completionsContent = (content: unknown): ContentPart[] =>
  typeof content === 'string'
    ? content.length === 0
      ? []
      : [{ kind: 'text', text: content }]
    : list(content).flatMap((part) => completionsPart(part));
const completionsMessages = (body: unknown): { messages: ContentMessage[]; system: unknown[] } | undefined => {
  const messages = field(body, 'messages');
  if (!Array.isArray(messages)) {
    return undefined;
  }
  const system: unknown[] = [];
  const normalised = messages.flatMap((item: unknown): ContentMessage[] => {
    const role = field(item, 'role');
    if (role === 'system' || role === 'developer') {
      system.push(item);
      return [];
    }
    if (role === 'tool') {
      const parts = completionsContent(field(item, 'content'));
      return [
        message('tool', [
          {
            kind: 'tool-result',
            call: callId(field(item, 'tool_call_id')),
            error: false,
            text: parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join('\n'),
          },
          ...parts.filter((part) => part.kind === 'media'),
        ]),
      ];
    }
    if (role === 'assistant') {
      const calls = list(field(item, 'tool_calls')).map(
        (call): ContentPart => ({
          kind: 'tool-call',
          call: callId(field(call, 'id')),
          name: toolName(field(call, 'function', 'name')),
          text: text(field(call, 'function', 'arguments')) ?? '',
        }),
      );
      return [message('assistant', [...completionsContent(field(item, 'content')), ...calls])];
    }
    return [message('user', completionsContent(field(item, 'content')))];
  });
  return { messages: normalised, system };
};

/* OpenAI Responses. */

const responsesPart = (part: unknown): ContentPart[] => {
  switch (field(part, 'type')) {
    case 'input_text':
    case 'output_text':
    case 'text': {
      return [{ kind: 'text', text: text(field(part, 'text')) ?? '' }];
    }
    case 'refusal': {
      return [{ kind: 'text', text: text(field(part, 'refusal')) ?? '' }];
    }
    case 'input_image': {
      return [urlMedia(field(part, 'image_url'))];
    }
    case 'input_file': {
      return [urlMedia(field(part, 'file_data'))];
    }
    default: {
      return [];
    }
  }
};
const responsesContent = (content: unknown): ContentPart[] =>
  typeof content === 'string'
    ? [{ kind: 'text', text: content }]
    : list(content).flatMap((part) => responsesPart(part));
/** A reasoning item's readable text: its summary, or its plain reasoning text. Encrypted content is never read. */
const readableReasoning = (item: unknown): ContentPart[] => {
  const readable = [...list(field(item, 'summary')), ...list(field(item, 'content'))].flatMap((part) => {
    const type = field(part, 'type');
    return type === 'summary_text' || type === 'reasoning_text' ? [text(field(part, 'text')) ?? ''] : [];
  });
  return readable.length === 0 ? [] : [{ kind: 'thinking', text: readable.join('\n\n') }];
};
const responsesItem = (item: unknown, system: unknown[]): ContentMessage[] => {
  const type = field(item, 'type');
  if (type === 'function_call' || type === 'custom_tool_call') {
    return [
      message('assistant', [
        {
          kind: 'tool-call',
          call: callId(field(item, 'call_id')),
          name: toolName(field(item, 'name')),
          text: text(field(item, 'arguments')) ?? text(field(item, 'input')) ?? '',
        },
      ]),
    ];
  }
  if (type === 'function_call_output' || type === 'custom_tool_call_output') {
    const parts = responsesContent(field(item, 'output'));
    return [
      message('tool', [
        {
          kind: 'tool-result',
          call: callId(field(item, 'call_id')),
          error: false,
          text: parts.flatMap((part) => (part.kind === 'text' ? [part.text] : [])).join('\n'),
        },
        ...parts.filter((part) => part.kind === 'media'),
      ]),
    ];
  }
  if (type === 'reasoning') {
    return [message('assistant', readableReasoning(item))];
  }
  if (type !== undefined && type !== 'message') {
    return [];
  }
  const role = field(item, 'role');
  if (role === 'system' || role === 'developer') {
    system.push(item);
    return [];
  }
  return [message(role === 'assistant' ? 'assistant' : 'user', responsesContent(field(item, 'content')))];
};
const responsesMessages = (body: unknown): { messages: ContentMessage[]; system: unknown[] } | undefined => {
  const input = field(body, 'input');
  const instructions = field(body, 'instructions');
  const system: unknown[] = instructions === undefined ? [] : [instructions];
  if (typeof input === 'string') {
    return { messages: [message('user', [{ kind: 'text', text: input }])], system };
  }
  if (!Array.isArray(input)) {
    return undefined;
  }
  return { messages: input.flatMap((item: unknown) => responsesItem(item, system)), system };
};

/* Parameters. */

const parameterFields: Readonly<Record<ModelProviderWire, readonly string[]>> = {
  anthropic: [
    'max_tokens',
    'temperature',
    'top_p',
    'top_k',
    'thinking',
    'output_config',
    'tool_choice',
    'service_tier',
  ],
  'openai-completions': [
    'max_tokens',
    'max_completion_tokens',
    'temperature',
    'top_p',
    'reasoning_effort',
    'tool_choice',
    'service_tier',
    'parallel_tool_calls',
  ],
  'openai-responses': [
    'max_output_tokens',
    'temperature',
    'top_p',
    'reasoning',
    'tool_choice',
    'service_tier',
    'parallel_tool_calls',
  ],
};
const parameterKey = /^[a-z_]{1,32}$/u;
const parameterValue = (value: unknown): string | number | boolean | undefined => {
  if (typeof value === 'string') {
    return value.length <= 64 ? value : undefined;
  }
  return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : undefined;
};
/** Allowlisted request parameters, one level deep; anything else in the body (metadata, user ids) is not read. */
const parametersOf = (wire: ModelProviderWire, body: unknown): ContentPayload['parameters'] => {
  const entries: Array<readonly [string, string | number | boolean]> = [];
  for (const name of parameterFields[wire]) {
    const value = field(body, name);
    const scalar = parameterValue(value);
    if (scalar !== undefined) {
      entries.push([name, scalar]);
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [key, nested] of Object.entries(value)) {
        const inner = parameterValue(nested);
        if (parameterKey.test(key) && inner !== undefined) {
          entries.push([`${name}.${key}`, inner]);
        }
      }
    }
  }
  return Object.fromEntries(entries.slice(0, contentLimits.parameters));
};

const digestOf = (value: unknown): NonNullable<ContentPayload['context']>['system'] => {
  if (value === undefined || (Array.isArray(value) && value.length === 0)) {
    return null;
  }
  return sha256(JSON.stringify(value));
};

/**
 * What a request body holds for one call, under LQ4(b): the messages after the last assistant message (the user's new
 * message, or the tool results that answer the previous call), and digests and a count of everything else. Images
 * and files become their type and size; nothing written by an earlier call is recorded again.
 *
 * @param wire - The provider wire the body was sent on.
 * @param body - The request body the supplier received.
 * @returns The call's new messages, context and parameters, or `undefined` for a body this wire cannot read.
 */
export const requestContent = (wire: ModelProviderWire, body: unknown): RequestContent | undefined => {
  const parsed = ((): { messages: ContentMessage[]; system: unknown[] } | undefined => {
    switch (wire) {
      case 'anthropic': {
        const messages = anthropicMessages(body);
        const system = field(body, 'system');
        return messages === undefined ? undefined : { messages, system: system === undefined ? [] : [system] };
      }
      case 'openai-completions': {
        return completionsMessages(body);
      }
      case 'openai-responses': {
        return responsesMessages(body);
      }
    }
  })();
  if (parsed === undefined) {
    return undefined;
  }
  const cut = parsed.messages.findLastIndex((item) => item.role === 'assistant') + 1;
  const history = parsed.messages.slice(0, cut);
  return {
    messages: parsed.messages.slice(cut).filter((item) => item.parts.length > 0),
    context: {
      historyMessages: history.length,
      history: history.length === 0 ? null : digestOf(history),
      system: digestOf(parsed.system),
      tools: digestOf(field(body, 'tools')),
    },
    parameters: parametersOf(wire, body),
  };
};

type MutablePart = { kind: 'text' | 'thinking' | 'tool-call'; text: string; call?: string; name?: string };

/**
 * Assembles the assistant message a provider streamed, one parsed SSE frame at a time: readable thinking, text and
 * tool calls in the order they began. Signatures and encrypted reasoning are never read. It holds at most `limit`
 * characters and then stops, saying so; nothing it does can throw into the relay.
 */
export class ProviderOutputCapture {
  /** Whether output past the bound was dropped. */
  public truncated = false;
  private remaining: number;
  private readonly parts: MutablePart[] = [];
  private readonly open = new Map<string, MutablePart>();

  public constructor(
    private readonly wire: ModelProviderWire,
    limit: number = outputCaptureLimit,
  ) {
    this.remaining = limit;
  }

  /** @param frame - One parsed SSE data frame. */
  public accept(frame: unknown): void {
    try {
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
    } catch {
      // Observation never affects the relay.
    }
  }

  /** @returns The assistant message so far, or none when the stream produced nothing readable. */
  public messages(): ContentMessage[] {
    const parts = this.parts.flatMap((part): ContentPart[] => {
      if (part.kind === 'tool-call') {
        return [
          {
            kind: 'tool-call',
            call: part.call ?? callId(''),
            name: part.name ?? 'unknown-tool',
            text: part.text || '{}',
          },
        ];
      }
      return part.text.length === 0 ? [] : [{ kind: part.kind, text: part.text }];
    });
    return parts.length === 0 ? [] : [message('assistant', parts)];
  }

  private start(key: string, part: MutablePart): MutablePart {
    this.parts.push(part);
    this.open.set(key, part);
    return part;
  }

  private append(part: MutablePart | undefined, value: unknown): void {
    if (part === undefined || typeof value !== 'string' || value.length === 0) {
      return;
    }
    if (value.length > this.remaining) {
      this.truncated = true;
    }
    part.text += value.slice(0, Math.max(0, this.remaining));
    this.remaining = Math.max(0, this.remaining - value.length);
  }

  private anthropic(frame: unknown): void {
    const type = field(frame, 'type');
    const key = String(field(frame, 'index'));
    if (type === 'content_block_start') {
      const block = field(frame, 'content_block');
      switch (field(block, 'type')) {
        case 'text': {
          this.append(this.start(key, { kind: 'text', text: '' }), field(block, 'text'));
          break;
        }
        case 'thinking': {
          this.append(this.start(key, { kind: 'thinking', text: '' }), field(block, 'thinking'));
          break;
        }
        case 'tool_use':
        case 'server_tool_use': {
          this.start(key, {
            kind: 'tool-call',
            text: '',
            call: callId(field(block, 'id')),
            name: toolName(field(block, 'name')),
          });
          break;
        }
        default: {
          break;
        }
      }
    } else if (type === 'content_block_delta') {
      const delta = field(frame, 'delta');
      switch (field(delta, 'type')) {
        case 'text_delta': {
          this.append(this.open.get(key), field(delta, 'text'));
          break;
        }
        case 'thinking_delta': {
          this.append(this.open.get(key), field(delta, 'thinking'));
          break;
        }
        case 'input_json_delta': {
          this.append(this.open.get(key), field(delta, 'partial_json'));
          break;
        }
        default: {
          /* A signature delta is never recorded. */
          break;
        }
      }
    }
  }

  private responses(frame: unknown): void {
    if (field(frame, 'type') !== 'response.output_item.done') {
      return;
    }
    const item = field(frame, 'item');
    const key = `item:${this.parts.length}`;
    for (const part of responsesItem(item, []).flatMap((entry) => (entry.role === 'assistant' ? entry.parts : []))) {
      if (part.kind === 'tool-call') {
        this.append(this.start(key, { kind: 'tool-call', text: '', call: part.call, name: part.name }), part.text);
      } else if (part.kind === 'text' || part.kind === 'thinking') {
        this.append(this.start(key, { kind: part.kind, text: '' }), part.text);
      }
    }
  }

  private completions(frame: unknown): void {
    const delta = field(frame, 'choices', '0', 'delta');
    const reasoning = field(delta, 'reasoning_content') ?? field(delta, 'reasoning');
    if (typeof reasoning === 'string' && reasoning.length > 0) {
      this.append(this.open.get('thinking') ?? this.start('thinking', { kind: 'thinking', text: '' }), reasoning);
    }
    const content = field(delta, 'content');
    if (typeof content === 'string' && content.length > 0) {
      this.append(this.open.get('text') ?? this.start('text', { kind: 'text', text: '' }), content);
    }
    for (const call of list(field(delta, 'tool_calls'))) {
      const key = `call:${String(field(call, 'index'))}`;
      const part = this.open.get(key) ?? this.start(key, { kind: 'tool-call', text: '' });
      const id = field(call, 'id');
      const name = field(call, 'function', 'name');
      if (typeof id === 'string') {
        part.call = callId(id);
      }
      if (typeof name === 'string') {
        part.name = toolName(name);
      }
      this.append(part, field(call, 'function', 'arguments'));
    }
  }
}

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;

/**
 * One section as the contract carries it: source-redacted, each part capped at 64 KiB, one text budget spent across
 * the section in order, and at most 32 messages of 32 parts. A tool result over the cap keeps only its size and digest.
 *
 * @param messages - Normalised messages.
 * @param budget - The section's total text budget in bytes.
 * @returns The section, with the count of parts the bounds left out.
 */
export const contentSection = (
  messages: readonly ContentMessage[],
  budget: number = sectionTextBudget,
): ContentSection => {
  let remaining = budget;
  let omitted = 0;
  const kept = messages.slice(0, contentLimits.messages).map((item) => {
    omitted += Math.max(0, item.parts.length - contentLimits.parts);
    const parts = item.parts
      .slice(0, contentLimits.parts)
      .map((part): ContentSection['messages'][number]['parts'][number] => {
        if (part.kind === 'media') {
          return { kind: 'media', mime: part.mime, bytes: part.bytes, digest: part.digest ?? null };
        }
        if (part.kind === 'tool-result' && utf8Bytes(part.text) > evidenceLimits.text) {
          return {
            kind: 'tool-result',
            call: part.call,
            error: part.error,
            digest: sha256(part.text),
            text: '',
            originalBytes: utf8Bytes(part.text),
            retainedBytes: 0,
            redaction: 'truncated',
          };
        }
        const retained = retainText(part.text, Math.min(evidenceLimits.text, remaining));
        remaining -= retained.retainedBytes;
        switch (part.kind) {
          case 'tool-result': {
            return { kind: 'tool-result', call: part.call, error: part.error, digest: null, ...retained };
          }
          case 'tool-call': {
            return { kind: 'tool-call', call: part.call, name: part.name, ...retained };
          }
          default: {
            return { kind: part.kind, ...retained };
          }
        }
      });
    return { role: item.role, parts };
  });
  for (const item of messages.slice(contentLimits.messages)) {
    omitted += item.parts.length;
  }
  return { messages: kept, omitted };
};
