import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
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

const mountStreamingResponse = (events: readonly SseEvent[]): void => {
  fetchMock.mockResolvedValue(
    new Response(sseStreamFromEvents(events), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
};

describe('useProjectNameClient', () => {
  it('should POST to /v1/chat with a body that parses through chatTurnRequestSchema and carries agent.profile = project_name', async () => {
    mountStreamingResponse([
      { type: 'start' },
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', delta: 'My ' },
      { type: 'text-delta', id: 't0', delta: 'Project' },
      { type: 'text-end', id: 't0' },
      { type: 'finish' },
    ]);

    const { result } = renderHook(() => useProjectNameClient());

    await act(async () => {
      await result.current.generate('Design a desk lamp');
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe('https://api.test.local/v1/chat');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');

    const sentBody: unknown = JSON.parse(init.body as string);
    const parsed = chatTurnRequestSchema.parse(sentBody);
    expect(parsed.agent).toEqual({ profile: 'project_name' });
    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]!.role).toBe('user');
    const textPart = parsed.messages[0]!.parts.find((part) => part.type === 'text');
    expect(textPart).toEqual({ type: 'text', text: 'Design a desk lamp' });
    expect(parsed.id).toMatch(/^chat_/);
  });

  it('should resolve with the accumulated text from text-delta chunks in order', async () => {
    mountStreamingResponse([
      { type: 'start' },
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', delta: 'Hello' },
      { type: 'text-delta', id: 't0', delta: ', ' },
      { type: 'text-delta', id: 't0', delta: 'world' },
      { type: 'text-end', id: 't0' },
      { type: 'finish' },
    ]);

    const { result } = renderHook(() => useProjectNameClient());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.generate('Hi');
    });

    expect(resolved).toBe('Hello, world');
  });

  it('should ignore non-text-delta chunks when accumulating the generated text', async () => {
    mountStreamingResponse([
      { type: 'start' },
      { type: 'reasoning-start', id: 'r0' },
      { type: 'reasoning-delta', id: 'r0', delta: 'thinking...' },
      { type: 'reasoning-end', id: 'r0' },
      { type: 'text-start', id: 't0' },
      { type: 'text-delta', id: 't0', delta: 'Final' },
      { type: 'text-end', id: 't0' },
      { type: 'finish' },
    ]);

    const { result } = renderHook(() => useProjectNameClient());

    let resolved: string | undefined;
    await act(async () => {
      resolved = await result.current.generate('Hi');
    });

    expect(resolved).toBe('Final');
  });

  it('should reject with a NameGeneratorRequestError carrying the status code and body when the response is non-2xx', async () => {
    fetchMock.mockResolvedValue(new Response('insufficient credits', { status: 402, statusText: 'Payment Required' }));

    const { result } = renderHook(() => useProjectNameClient());

    try {
      await act(async () => {
        await result.current.generate('Hi');
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('NameGeneratorRequestError');
      expect((error as Error).message).toContain('402');
      expect((error as Error).message).toContain('insufficient credits');
      expect((error as NameGeneratorRequestError).status).toBe(402);
    }
  });

  it('should reject with a NameGeneratorRequestError when the response body stream is missing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));

    const { result } = renderHook(() => useProjectNameClient());

    try {
      await act(async () => {
        await result.current.generate('Hi');
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect((error as Error).name).toBe('NameGeneratorRequestError');
      expect((error as Error).message).toMatch(/empty|body|stream/i);
    }
  });
});
