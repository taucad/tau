import { it, expect, vi } from 'vitest';
import { createModels, createProvider, AI_TELEMETRY_SCHEMA } from '@earendil-works/pi-ai';
import type { Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { createPiTelemetry } from '#pi-telemetry.js';
import { piTelemetryPolicy } from '#telemetry-policy.js';

it('should preserve native model execution and settled usage through the production adapter', async () => {
  const exporter = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] });
  const adapter = createPiTelemetry({
    tracer: provider.getTracer('pi-native-test'),
    enabled: true,
    policy: { ...piTelemetryPolicy, spans: { ...piTelemetryPolicy.spans, 'tau.run': {} } },
  });
  const model: Model<'openai-completions'> = {
    id: 'synthetic',
    name: 'Synthetic',
    api: 'openai-completions',
    provider: 'synthetic',
    baseUrl: 'https://invalid.example',
    reasoning: false,
    input: ['text'],
    contextWindow: 4096,
    maxTokens: 128,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  const models = createModels();
  models.setProvider(
    createProvider({
      id: model.provider,
      models: [model],
      auth: { apiKey: { name: 'Synthetic', resolve: async () => ({ auth: {} }) } },
      api: openAICompletionsApi(),
    }),
  );
  const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    expect(init?.body).toEqual(expect.stringContaining('PRIVATE_INPUT'));
    return new Response(
      'data: {"id":"PRIVATE_RESPONSE","choices":[{"index":0,"delta":{"content":"PRIVATE_OUTPUT"}}]}\n\ndata: {"id":"PRIVATE_RESPONSE","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":100,"completion_tokens":25,"total_tokens":125,"prompt_tokens_details":{"cached_tokens":10}}}\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  try {
    const result = await adapter.context.startSpan({ name: 'tau.run' }, async (telemetry) =>
      models
        .stream(
          model,
          { systemPrompt: 'PRIVATE_SYSTEM', messages: [{ role: 'user', content: 'PRIVATE_INPUT', timestamp: 1 }] },
          { apiKey: 'synthetic', fetch, telemetry },
        )
        .result(),
    );
    expect(result.stopReason).toBe('stop');
    expect(result.content).toMatchObject([{ type: 'text', text: 'PRIVATE_OUTPUT' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(exporter.getFinishedSpans().some((span) => span.name === 'pi.ai.request')).toBe(true);
    });
    const spans = exporter.getFinishedSpans();
    const request = spans.find((span) => span.name === 'pi.ai.request')!;
    expect(request.parentSpanContext?.spanId).toBe(spans.find((span) => span.name === 'tau.run')?.spanContext().spanId);
    expect(request.attributes).toMatchObject({
      'usage.input': 90,
      'usage.cache_read': 10,
      'usage.output': 25,
      stop: 'stop',
    });
    expect(request.events[0]?.name).toBe('pi.ai.first_chunk');
    expect(
      JSON.stringify(
        spans.map((span) => ({
          name: span.name,
          attributes: span.attributes,
          events: span.events,
          status: span.status,
        })),
      ),
    ).not.toContain('PRIVATE');
  } finally {
    adapter.stop();
    await provider.shutdown();
  }
});

it('should require review when native schema names or attribute vocabulary change', () => {
  expect(AI_TELEMETRY_SCHEMA.version).toBe(1);
  expect(Object.keys(AI_TELEMETRY_SCHEMA.spans)).toEqual(['pi.ai.request', 'pi.ai.poll']);
  expect(Object.keys(AI_TELEMETRY_SCHEMA.metrics)).toEqual([
    'pi.ai.request.duration',
    'pi.ai.first_chunk.duration',
    'pi.ai.tokens',
    'pi.ai.cost',
  ]);
  const request = AI_TELEMETRY_SCHEMA.spans['pi.ai.request'];
  expect(Object.keys(request.startAttributes)).toEqual(['provider', 'api', 'model', 'reasoning']);
  expect(Object.keys(request.endAttributes)).toEqual([
    'stop',
    'usage.input',
    'usage.output',
    'usage.cache_read',
    'usage.cache_write',
    'cost.total',
    'response.id',
  ]);
  expect(Object.keys(request.events)).toEqual(['pi.ai.first_chunk', 'pi.ai.block']);
  expect(Object.keys(request.events['pi.ai.first_chunk'].attributes)).toEqual([]);
  expect(Object.keys(request.events['pi.ai.block'].attributes)).toEqual(['type', 'index', 'chars', 'tool']);
  expect(request.endAttributes.stop.values).toEqual([
    'pending',
    'stop',
    'length',
    'toolUse',
    'error',
    'aborted',
    'deferred',
  ]);
  const poll = AI_TELEMETRY_SCHEMA.spans['pi.ai.poll'];
  expect(poll.startAttributes).toEqual(request.startAttributes);
  expect(poll.endAttributes).toEqual(request.endAttributes);
  expect(poll.events).toEqual(request.events);
  expect(
    Object.fromEntries(
      Object.entries(AI_TELEMETRY_SCHEMA.metrics).map(([name, metric]) => [
        name,
        { kind: metric.kind, unit: metric.unit, attributes: Object.keys(metric.attributes) },
      ]),
    ),
  ).toEqual({
    'pi.ai.request.duration': { kind: 'histogram', unit: 'ms', attributes: ['provider', 'model', 'stop'] },
    'pi.ai.first_chunk.duration': { kind: 'histogram', unit: 'ms', attributes: ['provider', 'model'] },
    'pi.ai.tokens': { kind: 'counter', unit: 'token', attributes: ['provider', 'model', 'kind'] },
    'pi.ai.cost': { kind: 'counter', unit: 'USD', attributes: ['provider', 'model'] },
  });
});
