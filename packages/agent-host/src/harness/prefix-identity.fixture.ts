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

/** One scripted assistant reply: a tool call or a closing text. */
export type ScriptedReply =
  | Readonly<{ tool: string; input: Readonly<Record<string, unknown>> }>
  | Readonly<{ text: string }>;

/**
 * The Anthropic SSE frames for one scripted reply.
 *
 * @param reply - The reply to script.
 * @param index - A per-stream counter, so ids differ between steps.
 * @returns The event-stream body.
 */
export const anthropicReply = (reply: ScriptedReply, index: number): string => {
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
      usage: { input_tokens: 3, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  })}\n\n`;
  const body =
    'tool' in reply
      ? `event: content_block_start\ndata: ${JSON.stringify({
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'tool_use', id: `call-${String(index)}`, name: reply.tool, input: {} },
        })}\n\n` +
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: JSON.stringify(reply.input) },
        })}\n\n` +
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n' +
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":4}}\n\n'
      : 'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n' +
        `event: content_block_delta\ndata: ${JSON.stringify({
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: reply.text },
        })}\n\n` +
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n' +
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n';
  return `${head}${body}event: message_stop\ndata: {"type":"message_stop"}\n\n`;
};

/** One captured request body. */
export type CapturedBody = Readonly<Record<string, unknown>>;

/**
 * A `fetch` that records every request body and answers each with the next scripted reply.
 *
 * @param replies - The replies, consumed in order; a request past the end fails the stream.
 * @param captured - Receives each parsed request body.
 * @returns The fetch.
 */
export const recordingFetch = (
  replies: readonly ScriptedReply[],
  captured: CapturedBody[],
): typeof globalThis.fetch => {
  const queue = [...replies];
  let index = 0;
  return (async (_input: unknown, init?: RequestInit) => {
    const raw = typeof init?.body === 'string' ? init.body : '';
    captured.push(JSON.parse(raw) as CapturedBody);
    const reply = queue.shift();
    if (reply === undefined) {
      throw new Error('scripted replies exhausted');
    }
    index += 1;
    return new Response(anthropicReply(reply, index), {
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
