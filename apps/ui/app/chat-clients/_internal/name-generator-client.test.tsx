import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';

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
