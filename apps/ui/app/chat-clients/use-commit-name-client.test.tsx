import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import { useCommitNameClient } from '#chat-clients/use-commit-name-client.js';
import type { NameGeneratorRequestError } from '#chat-clients/_internal/name-generator-client.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- ENV/TAU_API_URL mirror the SCREAMING_SNAKE_CASE keys exported by the real environment.config module
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test.local' } }));

type SseEvent = Readonly<Record<string, unknown>>;

const sseChunk = (json: SseEvent): string => `data: ${JSON.stringify(json)}\n\n`;

const sseStreamFromEvents = (events: readonly SseEvent[]): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(sseChunk(event)));
      }
      controller.close();
    },
  });
};

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('useCommitNameClient', () => {
  it('should POST to /v1/chat with a body that parses through chatTurnRequestSchema and carries agent.profile = commit_name', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        sseStreamFromEvents([
          { type: 'start' },
          { type: 'text-start', id: 't0' },
          { type: 'text-delta', id: 't0', delta: 'fix: trim trailing whitespace' },
          { type: 'text-end', id: 't0' },
          { type: 'finish' },
        ]),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      ),
    );

    const { result } = renderHook(() => useCommitNameClient());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.generate('Summarise this diff');
    });

    expect(resolved).toBe('fix: trim trailing whitespace');

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.test.local/v1/chat');
    expect(init.method).toBe('POST');

    const sentBody: unknown = JSON.parse(init.body as string);
    const parsed = chatTurnRequestSchema.parse(sentBody);
    expect(parsed.agent).toEqual({ profile: 'commit_name' });
    expect(parsed.messages).toHaveLength(1);
    const textPart = parsed.messages[0]!.parts.find((part) => part.type === 'text');
    expect(textPart).toEqual({ type: 'text', text: 'Summarise this diff' });
  });

  it('should reject with a NameGeneratorRequestError when the API returns a non-2xx response', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429, statusText: 'Too Many Requests' }));

    const { result } = renderHook(() => useCommitNameClient());

    try {
      await act(async () => {
        await result.current.generate('Summarise this diff');
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('NameGeneratorRequestError');
      expect((error as Error).message).toContain('429');
      expect((error as NameGeneratorRequestError).status).toBe(429);
    }
  });
});
