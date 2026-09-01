import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { chatTurnRequestSchema } from '@taucad/chat/schemas';
import { useProjectNameClient } from '#chat-clients/use-project-name-client.js';
import { useCommitNameClient } from '#chat-clients/use-commit-name-client.js';

// eslint-disable-next-line @typescript-eslint/naming-convention -- ENV/TAU_API_URL mirror the SCREAMING_SNAKE_CASE keys exported by the real environment.config module
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test.local' } }));

/**
 * Integration scope for the name-generator chat clients.
 *
 * Distinct from the per-client unit tests, this file focuses on **one
 * invariant**: the body the client emits on the wire parses cleanly through
 * the shared `chatTurnRequestSchema` from `@taucad/chat/schemas` — the same
 * schema the API uses to validate `POST /v1/chat`. A green test here proves
 * the client-server contract holds end-to-end for both name profiles
 * without relying on the API server being mounted.
 */
const emptySseStream = (): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
      controller.close();
    },
  });
};

let fetchMock: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(
    new Response(emptySseStream(), {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }),
  );
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

const captureWireBody = (): unknown => {
  const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
  return JSON.parse(init.body as string);
};

describe('name clients wire integration', () => {
  it('should emit a project-name body that parses cleanly through chatTurnRequestSchema', async () => {
    const { result } = renderHook(() => useProjectNameClient());

    await act(async () => {
      await result.current.generate('Design a coat rack');
    });

    const wireBody = captureWireBody();
    const parsed = chatTurnRequestSchema.parse(wireBody);
    expect(parsed.agent).toEqual({ profile: 'project_name' });
  });

  it('should emit a commit-name body that parses cleanly through chatTurnRequestSchema', async () => {
    const { result } = renderHook(() => useCommitNameClient());

    await act(async () => {
      await result.current.generate('Summarise this diff');
    });

    const wireBody = captureWireBody();
    const parsed = chatTurnRequestSchema.parse(wireBody);
    expect(parsed.agent).toEqual({ profile: 'commit_name' });
  });

  /**
   * The refactor to `DefaultChatTransport.sendMessages` puts the AI SDK in
   * charge of the wire body shape. `trigger: 'submit-message'` is the SDK's
   * own field — its presence proves we routed through the transport rather
   * than reimplementing the POST inline. If a future change bypasses the
   * transport (e.g. a hand-rolled `fetch`), this field will disappear and
   * this assertion will fail, surfacing the regression at the right layer.
   */
  it('should carry trigger: submit-message alongside agent.profile, proving the AI SDK transport composed the request', async () => {
    const { result } = renderHook(() => useProjectNameClient());

    await act(async () => {
      await result.current.generate('Design a coat rack');
    });

    const wireBody = captureWireBody() as { trigger?: unknown; agent?: unknown };
    expect(wireBody.trigger).toBe('submit-message');
    expect(wireBody.agent).toEqual({ profile: 'project_name' });
  });
});
