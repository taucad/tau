/**
 * One gateway transport whose billing layer is chosen per run from the API's deployment answer (D1): the answer is
 * asked through the host's port, a run's transport is funded or plain, and an unknown answer never reads as unfunded
 * (I1, I2).
 */

import { describe, expect, it, vi } from 'vitest';
import type { DeploymentModeAnswer, ModelStreamEvent, ModelStreamRequest } from '#waist/ports.js';
import { createGatewayModelTransport } from '#transport/gateway-model-transport.js';
import { createTauCloudGatewayModelTransport } from '#transport/tau-cloud-gateway-model-transport.js';
import { authoritativeGatewayWireFixtures } from '#transport/gateway-wire.fixture.js';

const request = (overrides: Partial<ModelStreamRequest> = {}): ModelStreamRequest => ({
  attemptId: 'run-1:1:0',
  invocationPurpose: 'generation',
  modelId: 'fixture-model',
  providerKind: 'vertexai',
  maxTokens: 4096,
  systemPrompt: 'You are Tau.',
  messages: [{ id: 'user-1', role: 'user', content: 'hello' }],
  tools: [],
  signal: new AbortController().signal,
  ...overrides,
});

const sse = (headers: Readonly<Record<string, string>> = {}): Response => {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        for (const chunk of authoritativeGatewayWireFixtures.browserTurn) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } },
  );
};

const drain = async (stream: AsyncIterable<ModelStreamEvent>): Promise<ModelStreamEvent[]> => {
  const events: ModelStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
};

/** A deployment port that never answers. */
const neverSettles = async (): Promise<DeploymentModeAnswer> => Promise.withResolvers<DeploymentModeAnswer>().promise;

const unified = (
  deployment: () => Promise<DeploymentModeAnswer>,
  fetch: typeof globalThis.fetch = vi.fn(async () => sse({ 'x-tau-operation-id': 'operation-1' })),
) =>
  createGatewayModelTransport({
    baseUrl: 'https://api.example/',
    model: { contextWindow: 200_000, maxTokens: 4096 },
    fetch,
    billing: { deployment, principal: () => 'account-1' },
  });

describe('createGatewayModelTransport with a billing layer', () => {
  it('answers each known deployment mode as the port gives it', async () => {
    await expect(unified(async () => 'funded').deployment?.resolve()).resolves.toBe('funded');
    await expect(unified(async () => 'unfunded').deployment?.resolve()).resolves.toBe('unfunded');
  });

  it.each([
    ['an unknown answer', async (): Promise<DeploymentModeAnswer> => 'unknown'],
    [
      'a port that throws',
      async (): Promise<DeploymentModeAnswer> => {
        throw new Error('The deployment answer timed out.');
      },
    ],
    // A port typed loosely by its host (a JavaScript composition) may answer anything; only the two modes count.
    ['an answer outside the vocabulary', async () => 'self-host' as unknown as DeploymentModeAnswer],
    ['no answer', async () => undefined as unknown as DeploymentModeAnswer],
  ])('never reads %s as unfunded (I1, I2)', async (_label, deployment) => {
    await expect(unified(deployment).deployment?.resolve()).resolves.toBe('unknown');
  });

  it('answers unknown once a port that never settles passes its 10 s bound, and not before', async () => {
    vi.useFakeTimers();
    try {
      const resolving = unified(neverSettles).deployment!.resolve();
      const pending = Symbol('pending');
      await vi.advanceTimersByTimeAsync(9999);
      await expect(Promise.race([resolving, Promise.resolve(pending)])).resolves.toBe(pending);
      await vi.advanceTimersByTimeAsync(1);
      await expect(resolving).resolves.toBe('unknown');
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers unknown at once when the run is stopped while the port is asked', async () => {
    const stop = new AbortController();
    const resolving = unified(neverSettles).deployment!.resolve(stop.signal);
    stop.abort(new DOMException('The run was stopped.', 'AbortError'));
    await expect(resolving).resolves.toBe('unknown');
  });

  it('refuses DEPLOYMENT_UNKNOWN before any fetch when a call is made on no run mode (I1)', async () => {
    const fetch = vi.fn(async () => sse({ 'x-tau-operation-id': 'operation-1' }));
    const transport = unified(async () => 'funded', fetch);

    await expect(drain(transport.stream(request()))).rejects.toMatchObject({ code: 'DEPLOYMENT_UNKNOWN' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the funded facet for attempts earlier funded runs left unresolved', async () => {
    const fetch = vi.fn(async () =>
      Response.json({ state: 'not_found', voided: true }, { headers: { 'content-type': 'application/json' } }),
    );
    const transport = unified(async () => 'unfunded', fetch);

    expect(transport.funding.type).toBe('funded');
    if (transport.funding.type !== 'funded') {
      return;
    }
    await expect(
      transport.funding.resolveInvocation({ attemptId: 'run-0:1:0', signal: new AbortController().signal }),
    ).resolves.toEqual({ status: 'voided' });
    await expect(transport.funding.principal()).resolves.toBe('account-1');
  });

  it('gives a funded run the billing layer: the operation is bound off the response', async () => {
    const fetch = vi.fn(async () => sse({ 'x-tau-operation-id': 'operation-1' }));
    const transport = unified(async () => 'funded', fetch).deployment!.forRun('funded');
    const bound = vi.fn(async () => undefined);

    expect(transport.funding.type).toBe('funded');
    expect(transport.deployment).toBeUndefined();
    await drain(transport.stream(request({ onInvocationBound: bound })));

    expect(bound).toHaveBeenCalledWith({ operationId: 'operation-1' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('gives an unfunded run the plain transport: no binding, no operation header required', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => sse());
    const transport = unified(async () => 'unfunded', fetch).deployment!.forRun('unfunded');
    const bound = vi.fn(async () => undefined);

    expect(transport.funding).toEqual({ type: 'unfunded' });
    expect(transport.deployment).toBeUndefined();
    const events = await drain(transport.stream(request({ attemptId: 'run-1:1:12345', onInvocationBound: bound })));

    expect(events.some((event) => event.type === 'completed')).toBe(true);
    expect(bound).not.toHaveBeenCalled();
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get('x-tau-attempt-id')).toBe('run-1:1:12345');
  });

  it('stays plain, with no deployment port, when the host configures no billing layer', () => {
    const transport = createGatewayModelTransport({ baseUrl: 'https://api.example/' });

    expect(transport.funding).toEqual({ type: 'unfunded' });
    expect(transport.deployment).toBeUndefined();
  });
});

describe('createTauCloudGatewayModelTransport', () => {
  it('stays a funded transport that needs no deployment answer (a compatibility export until W4)', async () => {
    const fetch = vi.fn(async () => sse({ 'x-tau-operation-id': 'operation-cloud' }));
    const transport = createTauCloudGatewayModelTransport({
      baseUrl: 'https://api.example/',
      model: { contextWindow: 200_000, maxTokens: 4096 },
      fetch,
    });
    const bound = vi.fn(async () => undefined);

    expect(transport.funding.type).toBe('funded');
    expect(transport.deployment).toBeUndefined();
    await drain(transport.stream(request({ onInvocationBound: bound })));
    expect(bound).toHaveBeenCalledWith({ operationId: 'operation-cloud' });
  });
});
