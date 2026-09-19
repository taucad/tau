import { describe, expect, it } from 'vitest';
import { createSseDecoder } from '#api/llm/llm-gateway.stream.js';
import type { SseEvent } from '#api/llm/llm-gateway.stream.js';

const encoder = new TextEncoder();

const collectEvents = (chunks: ReadonlyArray<Uint8Array<ArrayBuffer>>): SseEvent[] => {
  const events: SseEvent[] = [];
  const decoder = createSseDecoder({ onEvent: (event) => events.push(event) });
  for (const chunk of chunks) {
    decoder.write(chunk);
  }
  decoder.end();
  return events;
};

describe('gateway SSE decoder', () => {
  it.each([
    ['LF', ['data: {"n":1}\n\ndata: {"n":2}\n\n']],
    ['CR', ['data: {"n":1}\r\rdata: {"n":2}\r\r']],
    ['CRLF split at any byte boundary', ['data: {"n":1}\r', '\n\r', '\ndata: {"n":2}\r\n\r', '\n']],
  ])('parses %s event boundaries', (_name, textChunks) => {
    const events = collectEvents(textChunks.map((chunk) => encoder.encode(chunk)));
    expect(events.map((event) => event.data)).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('preserves a UTF-8 code point split across chunks', () => {
    const bytes = encoder.encode('data: {"text":"Auckland 🥝"}\n\n');
    const splitAt = bytes.indexOf(0xf0) + 2;
    const events = collectEvents([bytes.slice(0, splitAt), bytes.slice(splitAt)]);
    expect(events).toEqual([{ data: { text: 'Auckland 🥝' } }]);
  });

  it('rejects an event larger than the 256 KiB parser cap', () => {
    const oversized = encoder.encode(`data: ${'x'.repeat(256 * 1024)}\n\n`);
    expect(() => collectEvents([oversized])).toThrow('SSE event exceeds 262144 bytes');
  });
});
