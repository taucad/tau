/* eslint-disable @typescript-eslint/naming-convention -- The scripted Anthropic wire uses snake_case keys. */
/**
 * Prompt-prefix identity fixtures (chat latency and prompt cache program, W1.4).
 *
 * A provider's prompt cache hashes the request prefix in the order tools → system → messages and reads back at each
 * `cache_control` breakpoint. The wire JSON pi-ai emits orders its keys differently (model, messages, max_tokens, …),
 * so a byte diff of the raw body reports the wrong divergence. `canonicalize` lays an Anthropic body out in cache
 * order, one unit per line, and `classifyBoundary` finds the first byte at which a later request leaves the earlier
 * one. The scripted Anthropic SSE replies and the recording fetch drive the real session, middleware stack, gateway
 * transport and pi-ai codec with nothing faked below `fetch`.
 *
 * @module
 */
import { util as zodUtility } from 'zod';
import type { HostToolDefinition } from '#waist/ports.js';

/** One unit of a request body in cache order and its UTF-8 byte span. */
export type CanonicalUnit = Readonly<{ label: string; start: number; end: number; breakpoint: boolean }>;

/** A request body laid out in cache order, with its unit boundaries and breakpoints. */
export type CanonicalRequest = Readonly<{
  bytes: Uint8Array<ArrayBuffer>;
  units: readonly CanonicalUnit[];
  breakpoints: ReadonlyArray<Readonly<{ label: string; end: number }>>;
  toolsEnd: number;
  systemEnd: number;
  messagesEnd: number;
}>;

const encoder = new TextEncoder();

/* The marker is a cache instruction, not prompt content: pi moves it to whichever message is last, so it is kept as
 * a breakpoint mark and removed from the compared bytes. */
const withoutCacheMarkers = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (key, child: unknown) => (key === 'cache_control' ? undefined : child));

const hasCacheMarker = (value: unknown): boolean => zodUtility.isObject(value) && value['cache_control'] !== undefined;

/**
 * Lay an Anthropic Messages body out in cache order.
 *
 * @param body - The parsed request body.
 * @returns The canonical view.
 */
export const canonicalize = (body: Readonly<Record<string, unknown>>): CanonicalRequest => {
  const units: CanonicalUnit[] = [];
  const pieces: string[] = [];
  let offset = 0;
  const push = (label: string, value: unknown, breakpoint: boolean): void => {
    const text = `${JSON.stringify(withoutCacheMarkers(value))}\n`;
    const start = offset;
    offset += encoder.encode(text).byteLength;
    units.push({ label, start, end: offset, breakpoint });
    pieces.push(text);
  };
  const tools: unknown[] = Array.isArray(body['tools']) ? body['tools'] : [];
  for (const [index, tool] of tools.entries()) {
    push(`tools[${String(index)}]`, tool, hasCacheMarker(tool));
  }
  const toolsEnd = offset;
  const rawSystem = body['system'];
  const system: unknown[] = Array.isArray(rawSystem)
    ? rawSystem
    : typeof rawSystem === 'string'
      ? [{ type: 'text', text: rawSystem }]
      : [];
  for (const [index, block] of system.entries()) {
    push(`system[${String(index)}]`, block, hasCacheMarker(block));
  }
  const systemEnd = offset;
  const messages: unknown[] = Array.isArray(body['messages']) ? body['messages'] : [];
  for (const [index, message] of messages.entries()) {
    if (!zodUtility.isObject(message)) {
      continue;
    }
    /* The codec serialises a string-content message as a one-block array only when it carries the marker; the API
     * tokenises both forms identically, so compare the block form throughout. */
    const blocks: unknown[] = Array.isArray(message['content'])
      ? message['content']
      : [{ type: 'text', text: message['content'] }];
    push(
      `messages[${String(index)}]:${String(message['role'])}`,
      { ...message, content: blocks },
      blocks.some((block) => hasCacheMarker(block)),
    );
  }
  const messagesEnd = offset;
  return {
    bytes: encoder.encode(pieces.join('')),
    units,
    breakpoints: units.filter((unit) => unit.breakpoint).map((unit) => ({ label: unit.label, end: unit.end })),
    toolsEnd,
    systemEnd,
    messagesEnd,
  };
};

const commonPrefix = (left: Uint8Array<ArrayBuffer>, right: Uint8Array<ArrayBuffer>): number => {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) {
    index += 1;
  }
  return index;
};

const unitAt = (canon: CanonicalRequest, offset: number): CanonicalUnit | undefined =>
  canon.units.find((unit) => offset >= unit.start && offset < unit.end);

/** How a later request relates to the earlier one whose prefixes the cache holds. */
export type BoundaryVerdict = Readonly<{
  /** The longest common byte prefix. */
  lcp: number;
  /** Whether the later request reproduces every byte of the earlier one through its last message (I1). */
  identicalThroughHistory: boolean;
  /** The earlier request's unit at which the later one diverges, when it does. */
  divergence: Readonly<{ label: string; offsetInUnit: number }> | undefined;
  /** History bytes after the last reusable breakpoint, which a provider re-prefills. */
  bytesLost: number;
}>;

/**
 * Classify the boundary from request P (the last request before a boundary) to request Q (the first after it).
 *
 * `lcp >= P.messagesEnd` means Q reproduces every byte of P through P's last message: the cached history is reusable
 * and any miss is time-based. Otherwise the reusable prefix is the largest breakpoint of P at or before the
 * divergence, and everything after it is rewritten.
 *
 * @param previous - The earlier request.
 * @param next - The later request.
 * @returns The verdict.
 */
export const classifyBoundary = (previous: CanonicalRequest, next: CanonicalRequest): BoundaryVerdict => {
  const lcp = commonPrefix(previous.bytes, next.bytes);
  const reusable = previous.breakpoints.findLast((breakpoint) => breakpoint.end <= lcp);
  const divergence = lcp >= previous.bytes.length ? undefined : (unitAt(previous, lcp) ?? unitAt(next, lcp));
  const identicalThroughHistory = lcp >= previous.messagesEnd;
  return {
    lcp,
    identicalThroughHistory,
    divergence: divergence ? { label: divergence.label, offsetInUnit: lcp - divergence.start } : undefined,
    bytesLost: identicalThroughHistory ? 0 : previous.messagesEnd - (reusable?.end ?? 0),
  };
};

/** One scripted assistant reply: a tool call or a closing text, with the input tokens the provider reports for it. */
export type ScriptedReply = Readonly<{ inputTokens?: number | undefined }> &
  (Readonly<{ tool: string; input: Readonly<Record<string, unknown>> }> | Readonly<{ text: string }>);

/**
 * The Anthropic SSE frames for one scripted reply.
 *
 * @param reply - The reply to script.
 * @param index - A per-stream counter, so ids differ between steps.
 * @param signature - When given, the reply thinks first: a signed thinking block the next request has to replay.
 * @returns The event-stream body.
 */
export const anthropicReply = (reply: ScriptedReply, index: number, signature?: string): string => {
  const frame = (event: string, data: unknown): string => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  /* The reply's own block follows the thinking block when there is one. */
  const at = signature === undefined ? 0 : 1;
  const thinking =
    signature === undefined
      ? ''
      : frame('content_block_start', {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        }) +
        frame('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: `reasoning ${signature}` },
        }) +
        frame('content_block_delta', {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature },
        }) +
        frame('content_block_stop', { type: 'content_block_stop', index: 0 });
  const head = `event: message_start\ndata: ${JSON.stringify({
    type: 'message_start',
    message: {
      id: `msg-${String(index)}`,
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'fixture',
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: reply.inputTokens ?? 3,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
  })}\n\n`;
  const body =
    'tool' in reply
      ? frame('content_block_start', {
          type: 'content_block_start',
          index: at,
          content_block: { type: 'tool_use', id: `call-${String(index)}`, name: reply.tool, input: {} },
        }) +
        frame('content_block_delta', {
          type: 'content_block_delta',
          index: at,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) },
        }) +
        frame('content_block_stop', { type: 'content_block_stop', index: at }) +
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":4}}\n\n'
      : frame('content_block_start', {
          type: 'content_block_start',
          index: at,
          content_block: { type: 'text', text: '' },
        }) +
        frame('content_block_delta', {
          type: 'content_block_delta',
          index: at,
          delta: { type: 'text_delta', text: reply.text },
        }) +
        frame('content_block_stop', { type: 'content_block_stop', index: at }) +
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n';
  return `${head}${thinking}${body}event: message_stop\ndata: {"type":"message_stop"}\n\n`;
};

/** One captured request body. */
export type CapturedBody = Readonly<Record<string, unknown>>;

/** One request of a chat, and the signature of the thinking block its reply minted. */
export type SentRequest = Readonly<{ body: CapturedBody; minted: string }>;

/**
 * A `fetch` that records every request body and answers each with the next scripted reply.
 *
 * @param replies - The replies, consumed in order; a request past the end fails the stream.
 * @param captured - Receives each parsed request body.
 * @param chat - When given, every reply thinks first under a signature unique in the chat, and each request is
 * recorded here with the signature its reply minted, for {@link bindingViolations}.
 * @returns The fetch.
 */
export const recordingFetch = (
  replies: readonly ScriptedReply[],
  captured: CapturedBody[],
  chat?: SentRequest[],
): typeof globalThis.fetch => {
  const queue = [...replies];
  let index = 0;
  return (async (_input: unknown, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '';
    const body = JSON.parse(raw) as CapturedBody;
    captured.push(body);
    const reply = queue.shift();
    if (reply === undefined) {
      throw new Error('scripted replies exhausted');
    }
    index += 1;
    const signature = chat === undefined ? undefined : `sig-${String(chat.length + 1)}`;
    if (signature !== undefined) {
      chat?.push({ body, minted: signature });
    }
    return new Response(anthropicReply(reply, index, signature), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    });
  }) as typeof globalThis.fetch;
};

/** The tools these fixtures advertise: enough for a tool breakpoint and for screenshot and read steps. */
export const fixtureTools: readonly HostToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read one project file.',
    inputSchema: {
      type: 'object',
      properties: { targetFile: { type: 'string' } },
      required: ['targetFile'],
      additionalProperties: false,
    },
  },
  {
    name: 'screenshot',
    description: 'Capture the rendered model.',
    inputSchema: { type: 'object', properties: { view: { type: 'string' } }, additionalProperties: false },
  },
  {
    name: 'edit_file',
    description: 'Edit one project file.',
    inputSchema: {
      type: 'object',
      properties: { targetFile: { type: 'string' }, oldString: { type: 'string' }, newString: { type: 'string' } },
      required: ['targetFile', 'oldString', 'newString'],
      additionalProperties: false,
    },
  },
];

/**
 * The step-by-step boundaries of one sequence of captured bodies.
 *
 * @param bodies - The bodies in request order.
 * @returns One verdict per consecutive pair.
 */
export const stepBoundaries = (bodies: readonly CapturedBody[]): BoundaryVerdict[] => {
  const canon = bodies.map((body) => canonicalize(body));
  return canon.slice(1).map((next, index) => classifyBoundary(canon[index]!, next));
};

type WireBlock = Readonly<Record<string, unknown>>;
const blocksOf = (message: WireBlock): WireBlock[] =>
  (Array.isArray(message['content'])
    ? message['content']
    : [{ type: 'text', text: message['content'] }]) as WireBlock[];
const isThinking = (block: WireBlock): boolean => block['type'] === 'thinking' || block['type'] === 'redacted_thinking';
const messagesOf = (body: CapturedBody): WireBlock[] => (body['messages'] ?? []) as WireBlock[];

/**
 * What a provider binds a reasoning block to: the tools by name, the system text and the messages before it, with
 * reasoning itself left out.
 *
 * @param body - A request body.
 * @param messageCount - How many messages the prefix holds; all of them when absent.
 * @param blockCount - How many blocks of the last of those messages it holds; all of them when absent.
 * @returns The bound prefix, serialised.
 */
const boundPrefix = (body: CapturedBody, messageCount?: number, blockCount?: number): string => {
  const messages = messagesOf(body).slice(0, messageCount);
  const rendered = messages.map((message, index) => ({
    role: message['role'],
    content: blocksOf(message)
      .slice(0, messageCount !== undefined && index === messages.length - 1 ? blockCount : undefined)
      .filter((block) => !isThinking(block)),
  }));
  const tools = ((body['tools'] ?? []) as WireBlock[]).toSorted((left, right) =>
    String(left['name']).localeCompare(String(right['name'])),
  );
  const system = Array.isArray(body['system'])
    ? (body['system'] as WireBlock[]).map((block) => block['text']).join('\u0000')
    : body['system'];
  return JSON.stringify(withoutCacheMarkers({ tools, system, rendered }));
};

/** The thinking blocks a request replays, by signature. */
export const replayedSignatures = (body: CapturedBody): string[] =>
  messagesOf(body).flatMap((message) =>
    blocksOf(message)
      .filter((block) => isThinking(block))
      .map((block) => String(block['signature'])),
  );

/**
 * The reasoning binding oracle (P2): the hermetic twin of Anthropic's `prefix_mismatch_behavior: "error"`. A replayed
 * thinking block must follow exactly the tools, system text and messages the request that minted it sent, and the
 * same thinking blocks.
 *
 * @param sent - Every request of one chat in send order, from {@link recordingFetch}.
 * @returns One line per replayed block whose prefix is not the one it was minted under.
 */
export const bindingViolations = (sent: readonly SentRequest[]): string[] =>
  sent.flatMap((request, index) =>
    messagesOf(request.body).flatMap((message, messageIndex) =>
      blocksOf(message).flatMap((block, blockIndex) => {
        if (!isThinking(block)) {
          return [];
        }
        const at = `request ${String(index + 1)}: messages.${String(messageIndex)}.content.${String(blockIndex)}`;
        const origin = sent.find((candidate) => candidate.minted === block['signature']);
        if (origin === undefined) {
          return [`${at} has an unknown signature`];
        }
        /* Everything before the block: the earlier messages, then the blocks before it in its own message. */
        const minted = JSON.parse(boundPrefix(origin.body)) as { tools: unknown; system: unknown; rendered: unknown[] };
        const expected = JSON.stringify({
          ...minted,
          rendered: [...minted.rendered, { role: 'assistant', content: [] }],
        });
        /* A block is linked to the reasoning before it too: the same blocks must precede it as when it was minted. */
        const earlier = replayedSignatures({ messages: messagesOf(request.body).slice(0, messageIndex) });
        return boundPrefix(request.body, messageIndex + 1, blockIndex) === expected &&
          JSON.stringify(earlier) === JSON.stringify(replayedSignatures(origin.body))
          ? []
          : [`${at} (${String(block['signature'])}) is replayed after an edited prefix`];
      }),
    ),
  );

/** The request parameters a provider's prompt cache keys on besides the prefix. */
const cacheParameters = (body: CapturedBody): string =>
  JSON.stringify({ model: body['model'], thinking: body['thinking'], output_config: body['output_config'] });

/**
 * The prefix contract (P1): a request reproduces the previous one's prefix and cache parameters exactly when its reply
 * records no typed break, and a break is recorded only when one of them changed.
 *
 * @param sent - Every request of one chat in send order.
 * @param breaks - The typed break each request's reply recorded, by request; `undefined` where none.
 * @returns One line per request whose recorded break disagrees with what it sent.
 */
export const prefixContractViolations = (
  sent: readonly SentRequest[],
  breaks: ReadonlyArray<string | undefined>,
): string[] =>
  sent.slice(1).flatMap((next, index) => {
    const previous = sent[index]!;
    const verdict = classifyBoundary(canonicalize(previous.body), canonicalize(next.body));
    const changed = !verdict.identicalThroughHistory || cacheParameters(previous.body) !== cacheParameters(next.body);
    const recorded = breaks[index + 1];
    if (changed === (recorded !== undefined)) {
      return [];
    }
    return [
      changed
        ? `request ${String(index + 2)}: the prefix or its cache parameters changed (${verdict.divergence?.label ?? 'parameters'}) with no typed break`
        : `request ${String(index + 2)}: a ${String(recorded)} break is recorded and nothing changed`,
    ];
  });
