/* eslint-disable @typescript-eslint/naming-convention -- Vertex's OpenAI-compatible wire uses snake_case keys throughout this module. */
import type { Context } from '@earendil-works/pi-ai';
import { util as zodUtility } from 'zod';

/**
 * Vertex AI's OpenAI-compatible Gemini wire carries two fields no OpenAI codec
 * reads: thought deltas marked by `extra_content.google.thought` and wrapped in
 * the `<think>` marker Tau asks for, and `extra_content.google.thought_signature`
 * on tool calls, which Gemini 3 requires back on the tool-result continuation or
 * rejects the turn with HTTP 400.
 *
 * Both were carried by a pnpm patch on `@earendil-works/pi-ai`. They now live
 * here, on Tau's own seams: this response shim rewrites the SSE bytes before
 * pi's SDK reads them, and {@link echoThoughtSignatures} puts the signature back
 * on the outbound request through pi's `onPayload` hook.
 */

const thinkClose = '</think>';

interface ToolCallDelta {
  index?: number;
  id?: string;
  extra_content?: { google?: { thought_signature?: string } };
}

interface ChoiceDelta {
  content?: string | null;
  reasoning_content?: string;
  tool_calls?: ToolCallDelta[];
  extra_content?: { google?: { thought?: boolean } };
}

/**
 * Rewrite Vertex AI Gemini SSE bytes into the OpenAI-compatible shape pi's
 * unpatched completions codec already understands.
 *
 * Thought content moves to `reasoning_content` with its `<think>` markers
 * stripped — the codec maps that field onto a thinking block for every
 * OpenAI-compatible endpoint. Tool-call thought signatures are recorded into
 * `signatures` by call id and stripped from the wire.
 *
 * @param signatures - Per-request map filled with `toolCallId -> thoughtSignature`.
 * @returns A transform stream to pipe a Vertex response body through.
 * @public
 */
export const createVertexResponseShim = (signatures: Map<string, string>): TransformStream<Uint8Array, Uint8Array> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // A JSON object can be split across chunk boundaries, so only whole lines are
  // ever parsed; the remainder carries into the next chunk.
  let carry = '';
  let thinking = false;
  // Streamed argument deltas repeat a tool call by index without its id, so the
  // id first seen at an index names every later delta at that index.
  const idByIndex = new Map<number, string>();

  const rewriteThought = (delta: ChoiceDelta): boolean => {
    if (typeof delta.content !== 'string') {
      return false;
    }
    const marked = delta.extra_content?.google?.thought === true;
    if (!marked && !thinking) {
      return false;
    }
    const content = marked ? delta.content.replace(/^\s*<think>\s*/u, '') : delta.content;
    const close = content.indexOf(thinkClose);
    // Without the marked flag this is the closing half of a thought that has
    // already started; text before any close marker stays text.
    if (!marked && close === -1) {
      return false;
    }
    const thought = close === -1 ? content : content.slice(0, close);
    thinking = close === -1;
    delta.content = close === -1 ? '' : content.slice(close + thinkClose.length).trimStart();
    if (thought.length > 0) {
      delta.reasoning_content = thought;
    }
    delete delta.extra_content;
    return true;
  };

  const captureSignatures = (delta: ChoiceDelta): boolean => {
    let changed = false;
    for (const call of delta.tool_calls ?? []) {
      const index = call.index ?? 0;
      if (typeof call.id === 'string' && call.id.length > 0) {
        idByIndex.set(index, call.id);
      }
      const signature = call.extra_content?.google?.thought_signature;
      const id = idByIndex.get(index);
      if (typeof signature === 'string' && id !== undefined) {
        signatures.set(id, signature);
      }
      if (call.extra_content !== undefined) {
        delete call.extra_content;
        changed = true;
      }
    }
    return changed;
  };

  const rewriteLine = (line: string): string => {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') {
      return line;
    }
    let chunk: unknown;
    try {
      chunk = JSON.parse(line.slice('data: '.length));
    } catch {
      return line;
    }
    if (!zodUtility.isObject(chunk) || !Array.isArray(chunk['choices'])) {
      return line;
    }
    let changed = false;
    for (const choice of chunk['choices']) {
      if (!zodUtility.isObject(choice) || !zodUtility.isObject(choice['delta'])) {
        continue;
      }
      const delta = choice['delta'] as ChoiceDelta;
      // Both run: a single delta can carry a thought and a tool call.
      changed = rewriteThought(delta) || changed;
      changed = captureSignatures(delta) || changed;
    }
    // A line the shim did not touch is forwarded byte-for-byte rather than
    // re-serialised, so every non-Gemini field keeps its exact wire form.
    return changed ? `data: ${JSON.stringify(chunk)}` : line;
  };

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(bytes, controller) {
      carry += decoder.decode(bytes, { stream: true });
      const lines = carry.split('\n');
      carry = lines.pop() ?? '';
      // A chunk that closed no line adds nothing to the wire; enqueueing here
      // would inject a newline the upstream never sent.
      if (lines.length > 0) {
        controller.enqueue(encoder.encode(`${lines.map(rewriteLine).join('\n')}\n`));
      }
    },
    flush(controller) {
      if (carry.length > 0) {
        controller.enqueue(encoder.encode(rewriteLine(carry)));
      }
    },
  });
};

/**
 * Echo captured Gemini thought signatures onto the outbound tool calls.
 *
 * Gemini 3 rejects a tool-result continuation whose assistant tool calls lost
 * their `thought_signature`, so the value Tau persisted on the durable row and
 * re-materialised onto the pi `ToolCall` is put back on the wire here.
 *
 * @param context - The pi context this request was built from.
 * @returns A pi `onPayload` step, returning `undefined` when nothing to echo.
 * @public
 */
export const echoThoughtSignatures =
  (context: Context) =>
  (payload: unknown): unknown => {
    const byId = new Map<string, string>();
    for (const message of context.messages) {
      if (message.role !== 'assistant') {
        continue;
      }
      for (const block of message.content) {
        if (block.type === 'toolCall' && typeof block.thoughtSignature === 'string') {
          byId.set(block.id, block.thoughtSignature);
        }
      }
    }
    if (byId.size === 0 || !zodUtility.isObject(payload) || !Array.isArray(payload['messages'])) {
      return undefined;
    }
    for (const message of payload['messages']) {
      if (!zodUtility.isObject(message) || !Array.isArray(message['tool_calls'])) {
        continue;
      }
      for (const call of message['tool_calls']) {
        if (!zodUtility.isObject(call) || typeof call['id'] !== 'string') {
          continue;
        }
        const signature = byId.get(call['id']);
        if (signature !== undefined) {
          call['extra_content'] = { google: { thought_signature: signature } };
        }
      }
    }
    return payload;
  };
