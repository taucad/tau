import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type * as Ai from 'ai';
import { useNameGeneratorPartsClient } from '#chat-clients/_internal/name-generator-client.js';

const sdkLoaded = vi.hoisted(() => vi.fn());

vi.mock('ai', async (importOriginal) => {
  sdkLoaded();
  return importOriginal<typeof Ai>();
});

// eslint-disable-next-line @typescript-eslint/naming-convention -- Runtime environment keys follow the host contract.
vi.mock('#environment.config.js', () => ({ ENV: { TAU_API_URL: 'https://api.test.local' } }));

afterEach(() => {
  vi.restoreAllMocks();
});

it('should defer the SDK until generation and keep concurrent requests independent', async () => {
  const requests: Array<{ projectId: string; id: string; admission: { idempotencyKey: string } }> = [];
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    if (typeof init?.body !== 'string') {
      throw new TypeError('Naming request must carry a JSON string body.');
    }
    const body = JSON.parse(init.body) as (typeof requests)[number];
    requests.push(body);
    const events = [
      { type: 'start' },
      { type: 'text-start', id: 'text' },
      { type: 'text-delta', id: 'text', delta: body.projectId },
      { type: 'text-end', id: 'text' },
      { type: 'finish' },
    ];
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
      headers: { 'content-type': 'text/event-stream' },
    });
  });
  const { result, rerender } = renderHook(() => useNameGeneratorPartsClient('project_name'));
  rerender();
  expect(sdkLoaded).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();

  await act(async () => {
    const names = await Promise.all([
      result.current.generateFromParts([{ type: 'text', text: 'first' }], 'project_first'),
      result.current.generateFromParts([{ type: 'text', text: 'second' }], 'project_second'),
    ]);
    expect(names).toEqual(['project_first', 'project_second']);
  });

  expect(sdkLoaded).toHaveBeenCalledOnce();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new Set(requests.map((request) => request.id)).size).toBe(2);
  expect(new Set(requests.map((request) => request.admission.idempotencyKey)).size).toBe(2);
});
