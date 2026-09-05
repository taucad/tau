import { setImmediate as waitForImmediate } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { consumeSseBody } from '#api/llm/llm-gateway.service.js';
import type { SseEvent } from '#api/llm/llm-gateway.service.js';

const encoder = new TextEncoder();

const streamFrom = (chunks: readonly Uint8Array<ArrayBuffer>[]): ReadableStream<Uint8Array<ArrayBuffer>> => {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[index++];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
    },
  });
};

const collectEvents = async (chunks: readonly Uint8Array<ArrayBuffer>[]): Promise<SseEvent[]> => {
  const events: SseEvent[] = [];
  await consumeSseBody({ body: streamFrom(chunks), onEvent: (event) => events.push(event) });
  return events;
};

describe('gateway provider stream', () => {
  it('does not read the next upstream chunk while a slow downstream writer is blocked', async () => {
    let unblock!: () => void;
    let firstWriteStarted!: () => void;
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const started = new Promise<void>((resolve) => {
      firstWriteStarted = resolve;
    });
    const writes: string[] = [];
    const consuming = consumeSseBody({
      body: streamFrom([encoder.encode('data: {"n":1}\n\n'), encoder.encode('data: {"n":2}\n\n')]),
      async onChunk(chunk) {
        writes.push(new TextDecoder().decode(chunk));
        if (writes.length === 1) {
          firstWriteStarted();
          await blocked;
        }
      },
    });

    await started;
    await waitForImmediate();
    expect(writes).toHaveLength(1);

    unblock();
    await consuming;
    expect(writes).toHaveLength(2);
  });

  it.each(['event start', 'one byte before cap', 'at cap'] as const)(
    'forwards identical bytes when a side-parser failure is partitioned at %s',
    async (_name) => {
      const terminal = 'data: {"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n';
      const oversized = `data: ${'x'.repeat(100)}\n\n`;
      const bytes = encoder.encode(terminal + oversized);
      const eventStart = encoder.encode(terminal).byteLength;
      const splitByName = {
        'event start': eventStart,
        'one byte before cap': eventStart + 79,
        'at cap': eventStart + 80,
      } as const;
      const splitAt = splitByName[_name];
      const writes: Uint8Array<ArrayBuffer>[] = [];
      const events: SseEvent[] = [];

      await expect(
        consumeSseBody({
          body: streamFrom([bytes.slice(0, splitAt), bytes.slice(splitAt)]),
          maxEventBytes: 80,
          onChunk: (chunk) => {
            writes.push(chunk);
          },
          onEvent: (event) => events.push(event),
        }),
      ).rejects.toThrow('SSE event exceeds 80 bytes');

      expect(Buffer.concat(writes.map((chunk) => Buffer.from(chunk)))).toEqual(Buffer.from(bytes));
      expect(events).toEqual([{ data: { usage: { prompt_tokens: 2, completion_tokens: 1 } } }]);
    },
  );
});

describe('gateway SSE decoder', () => {
  it.each([
    ['LF', ['data: {"n":1}\n\ndata: {"n":2}\n\n']],
    ['CR', ['data: {"n":1}\r\rdata: {"n":2}\r\r']],
    ['CRLF split at any byte boundary', ['data: {"n":1}\r', '\n\r', '\ndata: {"n":2}\r\n\r', '\n']],
  ])('parses %s event boundaries', async (_name, textChunks) => {
    const events = await collectEvents(textChunks.map((chunk) => encoder.encode(chunk)));
    expect(events.map((event) => event.data)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('preserves a UTF-8 code point split across chunks', async () => {
    const bytes = encoder.encode('data: {"text":"Auckland 🥝"}\n\n');
    const splitAt = bytes.indexOf(0xf0) + 2;
    const events = await collectEvents([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
    expect(events).toEqual([{ data: { text: 'Auckland 🥝' } }]);
  });

  it('rejects an event larger than the 256 KiB parser cap', async () => {
    const oversized = encoder.encode(`data: ${'x'.repeat(256 * 1024)}\n\n`);
    await expect(collectEvents([oversized])).rejects.toThrow('SSE event exceeds 262144 bytes');
  });

  it('cancels and unlocks after parser failure without trusting source cancellation to settle', async () => {
    let cancelled = false;
    const oversized = encoder.encode(`data: ${'x'.repeat(256 * 1024)}\n\n`);
    const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(oversized);
      },
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    });

    await expect(consumeSseBody({ body: stream })).rejects.toThrow('SSE event exceeds 262144 bytes');
    expect(cancelled).toBe(true);
    expect(stream.locked).toBe(false);
  });
});
