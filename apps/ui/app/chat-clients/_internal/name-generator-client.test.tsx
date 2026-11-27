import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';
import { publishIdentityState } from '#lib/identity-answer.js';

const originalClientEnvironment = globalThis.window.ENV;

const sseStream = (): ReadableStream<Uint8Array<ArrayBuffer>> => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"start"}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"finish"}\n\n'));
      controller.close();
    },
  });
};

describe('name generator runtime environment', () => {
  afterEach(() => {
    globalThis.window.ENV = originalClientEnvironment;
    vi.restoreAllMocks();
  });

  it('reads TAU_API_URL when generation starts', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(sseStream(), { headers: { 'content-type': 'text/event-stream' } }));
    const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));
    globalThis.window.ENV = {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- browser environment keys are uppercase by contract.
      TAU_API_URL: 'https://late-api.tau.test/',
    };

    await act(async () => result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1'));

    expect(fetch).toHaveBeenCalledWith('https://late-api.tau.test/v1/chat', expect.anything());
  });

  it('rejects a missing API URL before fetching', async () => {
    globalThis.window.ENV = {};
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));

    await expect(result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1')).rejects.toThrow(
      'Missing TAU_API_URL: the host must inject it through window.ENV before app-module evaluation.',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * A name is a courtesy. The naming profiles need a session and spend credit, so a request that is certain to be
 * refused is not made, and the two refusals an account can cause are no name, not a failure (launch audit N-7).
 */
describe('name generation for an account that cannot have a name', () => {
  afterEach(() => {
    publishIdentityState('unknown');
    vi.restoreAllMocks();
  });

  const refusal = (status: number, code: string): Response =>
    Response.json({ code, message: `refused ${code}` }, { status, statusText: 'Refused' });

  it('should make no request and give no name when nobody is signed in', async () => {
    publishIdentityState('signed-out');
    const fetch = vi.spyOn(globalThis, 'fetch');
    const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));

    const name = await result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1');

    expect(name).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each(['verified', 'unverified', 'unknown'] as const)(
    'should ask the API when the identity is %s',
    async (state) => {
      publishIdentityState(state);
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response(sseStream(), { headers: { 'content-type': 'text/event-stream' } }));
      const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));

      await act(async () => result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1'));

      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    { status: 401, code: 'UNAUTHORIZED' },
    { status: 402, code: 'INSUFFICIENT_CREDIT' },
  ])('should give no name when the API answers $status', async ({ status, code }) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(refusal(status, code));
    const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));

    await expect(result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1')).resolves.toBe(
      '',
    );
  });

  it('should still fail when the API answers a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(refusal(503, 'PROVIDER_UNAVAILABLE'));
    const { result } = renderHook(() => useNameGeneratorPartsClient('project_name'));

    await expect(
      result.current.generateFromParts([{ type: 'text', text: 'desk lamp' }], 'project_1'),
    ).rejects.toMatchObject({ name: 'NameGeneratorRequestError', status: 503 });
  });
});
