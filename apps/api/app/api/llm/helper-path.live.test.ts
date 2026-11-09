/* eslint-disable @typescript-eslint/naming-convention -- provider wire fields and environment names. */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import type { ConfigService } from '@nestjs/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DirectModelInvocationService,
  isGatewayProviderConfigured,
  isGatewayProviderId,
  LlmGatewayError,
  ModelService,
  ProviderService,
} from '@taucad/api-llm-gateway';
import type { ModelInvocationIntent, ModelProviderWire } from '@taucad/api-llm-gateway';
import type { Environment } from '@taucad/api-core';
import type { Model, ProviderId } from '@taucad/chat/model-catalog';

/**
 * Live acceptance for the self-host helper path (Tau Cloud off).
 *
 * For every configured provider it runs, through one `DirectModelInvocationService`:
 * (a) a streaming `project_name` helper request, (b) the same with a tiny inline PNG,
 * both forced onto that provider's helper model, and (c) a tool-call request through
 * the `gateway` surface on the same model, which shares the provider transport.
 *
 * It prints one line per case — provider, model id, HTTP status, latency and token
 * counts — and never a key, a prompt or a model's output.
 *
 * Skipped unless `TAU_LIVE_PROVIDERS=1`. Run it with
 * `TAU_LIVE_PROVIDERS=1 pnpm nx run api:test:live -- app/api/llm/helper-path.live.test.ts`.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
// `apps/api/.env` is authoritative for provider credentials; dotenv never overwrites a set variable.
loadDotenv({ path: path.resolve(here, '../../../.env'), quiet: true });

const enabled = process.env['TAU_LIVE_PROVIDERS'] === '1';
const ollamaUrl = 'http://localhost:11434/api/tags';
/** Names only `.env.test` filled, so their values are placeholders (`vitest.live.config.ts`). */
const testDefaulted = new Set((process.env['TAU_LIVE_TEST_DEFAULTED'] ?? '').split(','));
const credentialNames: Partial<Record<ProviderId, string>> = {
  anthropic: 'ANTHROPIC_API_KEY',
  cerebras: 'CEREBRAS_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  morph: 'MORPH_API_KEY',
  openai: 'OPENAI_API_KEY',
  together: 'TOGETHER_API_KEY',
  vertexai: 'GOOGLE_VERTEX_AI_CREDENTIALS',
  xai: 'XAI_API_KEY',
};

/** A 1×1 transparent PNG. */
const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

type LiveCase = {
  readonly label: string;
  readonly providerId: ProviderId;
  /** Narrows the provider's listed models, as when Together serves Kimi and others. */
  readonly pick?: (model: Model) => boolean;
};

const liveCases: readonly LiveCase[] = [
  { label: 'openai', providerId: 'openai' },
  { label: 'anthropic', providerId: 'anthropic' },
  { label: 'vertexai', providerId: 'vertexai' },
  { label: 'xai', providerId: 'xai' },
  { label: 'together-kimi', providerId: 'together', pick: (model) => model.id === 'together-kimi-k3' },
  { label: 'together', providerId: 'together', pick: (model) => model.id !== 'together-kimi-k3' },
  { label: 'morph', providerId: 'morph' },
  { label: 'cerebras', providerId: 'cerebras' },
  { label: 'moonshot', providerId: 'moonshot' },
  { label: 'ollama', providerId: 'ollama' },
];

const ollamaReachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(ollamaUrl, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
};

/** The API's configuration read from `process.env`, self-host mode forced, Ollama on only when it answers. */
const liveConfig = (ollama: boolean): ConfigService<Environment, true> => {
  const read = (key: string): unknown => {
    if (key === 'TAU_CLOUD_ENABLED') {
      return false;
    }
    if (key === 'OLLAMA_ENABLED') {
      return ollama;
    }
    const value = process.env[key];
    if (value === undefined || value.length === 0 || testDefaulted.has(key)) {
      return undefined;
    }
    if (key === 'GOOGLE_VERTEX_AI_CREDENTIALS') {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        return undefined;
      }
    }
    return value;
  };
  return { get: read } as unknown as ConfigService<Environment, true>;
};

type Counts = {
  input?: number;
  output?: number;
  cacheRead?: number;
  reasoning?: number;
  toolCall: boolean;
  textChars: number;
};

const field = (value: unknown, ...keys: string[]): unknown => {
  let current = value;
  for (const key of keys) {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
};

const numberField = (value: unknown, ...keys: string[]): number | undefined => {
  const found = field(value, ...keys);
  return typeof found === 'number' ? found : undefined;
};

/** Token counts from a Responses, Anthropic or completions SSE body, read without keeping any text. */
const sseCounts = (wire: ModelProviderWire, body: string): Counts => {
  const counts: Counts = { toolCall: false, textChars: 0 };
  let anthropicUncached = 0;
  for (const block of body.split('\n\n')) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => line.slice(6))
      .join('\n');
    if (!data.startsWith('{')) {
      continue;
    }
    const event = JSON.parse(data) as unknown;
    const type = field(event, 'type');
    if (wire === 'openai-responses') {
      const delta = field(event, 'delta');
      if (type === 'response.output_text.delta' && typeof delta === 'string') {
        counts.textChars += delta.length;
      }
      if (type === 'response.output_item.added' && field(event, 'item', 'type') === 'function_call') {
        counts.toolCall = true;
      }
      const usage = field(event, 'response', 'usage');
      if (usage !== undefined && usage !== null) {
        counts.input = numberField(usage, 'input_tokens');
        counts.output = numberField(usage, 'output_tokens');
        counts.cacheRead = numberField(usage, 'input_tokens_details', 'cached_tokens');
        counts.reasoning = numberField(usage, 'output_tokens_details', 'reasoning_tokens');
      }
    } else if (wire === 'anthropic') {
      if (type === 'content_block_start' && field(event, 'content_block', 'type') === 'tool_use') {
        counts.toolCall = true;
      }
      const usage = field(event, 'message', 'usage') ?? field(event, 'usage');
      if (usage !== undefined && usage !== null) {
        anthropicUncached = numberField(usage, 'input_tokens') ?? anthropicUncached;
        counts.cacheRead = numberField(usage, 'cache_read_input_tokens') ?? counts.cacheRead;
        const cacheWrite = numberField(usage, 'cache_creation_input_tokens') ?? 0;
        counts.output = numberField(usage, 'output_tokens') ?? counts.output;
        counts.input = anthropicUncached + (counts.cacheRead ?? 0) + cacheWrite;
      }
    } else {
      const choices = field(event, 'choices');
      if (Array.isArray(choices) && field(choices[0], 'delta', 'tool_calls') !== undefined) {
        counts.toolCall = true;
      }
      const usage = field(event, 'usage');
      if (usage !== undefined && usage !== null) {
        counts.input = numberField(usage, 'prompt_tokens');
        counts.output = numberField(usage, 'completion_tokens');
        counts.cacheRead =
          numberField(usage, 'prompt_tokens_details', 'cached_tokens') ?? numberField(usage, 'cached_tokens');
        counts.reasoning = numberField(usage, 'completion_tokens_details', 'reasoning_tokens');
      }
    }
  }
  return counts;
};

const report = (fields: Record<string, string | number | boolean | undefined>): void => {
  const line = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(' ');
  console.log(`[helper-path] ${line}`);
};

const refusalType = (error: unknown): string => {
  if (!(error instanceof LlmGatewayError)) {
    return error instanceof Error ? error.name : 'unknown';
  }
  const body = error.getResponse() as { error?: { type?: string } };
  return body.error?.type ?? 'unknown';
};

/** The tool-call request a gateway client would send on this wire, forcing nothing but offering one tool. */
const toolBody = (wire: ModelProviderWire, routeId: string): unknown => {
  const instruction = 'Call get_part_dimensions for the part named bracket. Do not answer in text.';
  const parameters = {
    type: 'object',
    properties: { part: { type: 'string', description: 'Part name' } },
    required: ['part'],
  };
  const description = 'Returns the bounding box of a named part.';
  if (wire === 'openai-responses') {
    return {
      model: routeId,
      stream: true,
      store: false,
      max_output_tokens: 2048,
      input: [{ role: 'user', content: instruction }],
      tools: [{ type: 'function', name: 'get_part_dimensions', description, parameters }],
      tool_choice: 'auto',
    };
  }
  if (wire === 'anthropic') {
    return {
      model: routeId,
      stream: true,
      max_tokens: 2048,
      messages: [{ role: 'user', content: instruction }],
      tools: [{ name: 'get_part_dimensions', description, input_schema: parameters }],
      tool_choice: { type: 'auto' },
    };
  }
  return {
    model: routeId,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: 2048,
    messages: [{ role: 'user', content: instruction }],
    tools: [{ type: 'function', function: { name: 'get_part_dimensions', description, parameters } }],
    tool_choice: 'auto',
  };
};

const intent = (overrides: Partial<ModelInvocationIntent>): ModelInvocationIntent => ({
  authUserId: 'live-helper',
  surface: 'project_name',
  attempt: { version: 1, key: 'live-helper-attempt' },
  providerWire: 'openai-responses',
  body: {},
  priceHeaders: {},
  activity: 'title',
  signal: AbortSignal.timeout(120_000),
  ...overrides,
});

describe.skipIf(!enabled)('self-host helper path (live)', () => {
  let ollama = false;
  let config: ConfigService<Environment, true>;
  let models: ModelService;
  let listed: Model[] = [];

  beforeAll(async () => {
    ollama = await ollamaReachable();
    config = liveConfig(ollama);
    models = new ModelService(new ProviderService(), config as unknown as ConfigService<Environment>);
    listed = await models.getModels();
  });

  afterAll(() => {
    report({ done: true, providers_listed: [...new Set(listed.map((model) => model.provider.id))].join(',') });
  });

  /** The service, forced onto one case's helper model by narrowing what `getModels` lists. */
  const serviceFor = (liveCase: LiveCase): { service: DirectModelInvocationService; model: Model | undefined } => {
    const offered = listed.filter(
      (model) => model.provider.id === liveCase.providerId && (liveCase.pick?.(model) ?? true),
    );
    const narrowed = {
      getModels: async () => offered,
      getOtelProviderName: (modelId: string) => models.getOtelProviderName(modelId),
    } as unknown as ModelService;
    // The service's own selection order.
    const model =
      offered.find((row) => row.id === 'openai-gpt-5.6-luna') ?? offered.find((row) => row.recommended) ?? offered[0];
    return { service: new DirectModelInvocationService(config, narrowed), model };
  };

  /** Why a case cannot run here, or `undefined` when it can. */
  const unavailable = (liveCase: LiveCase, model: Model | undefined): string | undefined => {
    if (liveCase.providerId === 'ollama') {
      return ollama ? (model ? undefined : 'no_tool_capable_ollama_model') : 'ollama_unreachable';
    }
    if (!isGatewayProviderId(liveCase.providerId) || !isGatewayProviderConfigured(config, liveCase.providerId)) {
      return `${credentialNames[liveCase.providerId] ?? 'credential'}_unset`;
    }
    return model ? undefined : 'no_enabled_catalog_row';
  };

  describe.each(liveCases)('$label', (liveCase) => {
    const helperCase = async (kind: 'stream' | 'image', skip: (note: string) => void): Promise<void> => {
      const { service, model } = serviceFor(liveCase);
      const reason = unavailable(liveCase, model);
      if (reason !== undefined || !model) {
        report({ provider: liveCase.label, case: kind, skipped: reason });
        skip(reason ?? 'unavailable');
        return;
      }
      if (kind === 'image' && !(model.support?.modalities?.input.includes('image') ?? false)) {
        report({ provider: liveCase.label, model: model.model, case: kind, skipped: 'text_only_model' });
        skip('text_only_model');
        return;
      }
      const startedAt = performance.now();
      let status = 0;
      let counts: Counts | undefined;
      try {
        const result = await service.invoke(
          intent({
            directPrompt: {
              system: 'Reply with a two-word name for the described part and nothing else.',
              messages: [
                {
                  role: 'user',
                  content:
                    kind === 'image'
                      ? [
                          { type: 'text', text: 'A small flat mounting bracket. A picture is attached.' },
                          { type: 'file', mediaType: 'image/png', data: tinyPng },
                        ]
                      : 'A small flat mounting bracket with two holes.',
                },
              ],
              maximumOutputTokens: 64,
            },
          }),
        );
        if (result.state !== 'streaming') {
          throw new Error(`Unexpected helper state ${result.state}`);
        }
        ({ status } = result.response);
        counts = sseCounts('openai-responses', await result.response.text());
        await result.completion;
      } catch (error) {
        status = error instanceof LlmGatewayError ? error.getStatus() : 0;
        report({
          provider: liveCase.label,
          model: model.model,
          case: kind,
          status,
          latency_ms: Math.round(performance.now() - startedAt),
          error: refusalType(error),
        });
        throw error;
      }
      report({
        provider: liveCase.label,
        model: model.model,
        case: kind,
        status,
        latency_ms: Math.round(performance.now() - startedAt),
        input_tokens: counts.input,
        output_tokens: counts.output,
        cache_read_tokens: counts.cacheRead,
        reasoning_tokens: counts.reasoning,
        text_chars: counts.textChars,
      });
      expect(status).toBe(200);
      expect(counts.input ?? 0).toBeGreaterThan(0);
    };

    it('streams a helper request', async (context) => {
      await helperCase('stream', (note) => {
        context.skip(note);
      });
    });

    it('streams an image helper request', async (context) => {
      await helperCase('image', (note) => {
        context.skip(note);
      });
    });

    it('relays a tool call through the gateway surface', async (context) => {
      const { service, model } = serviceFor(liveCase);
      const reason = liveCase.providerId === 'ollama' ? 'ollama_has_no_gateway_route' : unavailable(liveCase, model);
      if (reason !== undefined || !model) {
        report({ provider: liveCase.label, case: 'tool', skipped: reason });
        context.skip(reason ?? 'unavailable');
        return;
      }
      const wire: ModelProviderWire =
        liveCase.providerId === 'anthropic'
          ? 'anthropic'
          : liveCase.providerId === 'openai' || liveCase.providerId === 'xai'
            ? 'openai-responses'
            : 'openai-completions';
      const startedAt = performance.now();
      let status = 0;
      let counts: Counts | undefined;
      try {
        const result = await service.invoke(
          intent({
            surface: 'gateway',
            activity: 'agent',
            providerWire: wire,
            body: toolBody(wire, model.id),
            priceHeaders: wire === 'anthropic' ? { 'anthropic-version': '2023-06-01' } : {},
          }),
        );
        if (result.state !== 'streaming') {
          throw new Error(`Unexpected gateway state ${result.state}`);
        }
        ({ status } = result.response);
        counts = sseCounts(wire, await result.response.text());
      } catch (error) {
        status = error instanceof LlmGatewayError ? error.getStatus() : 0;
        report({
          provider: liveCase.label,
          model: model.model,
          case: 'tool',
          status,
          latency_ms: Math.round(performance.now() - startedAt),
          error: refusalType(error),
        });
        throw error;
      }
      report({
        provider: liveCase.label,
        model: model.model,
        case: 'tool',
        status,
        latency_ms: Math.round(performance.now() - startedAt),
        input_tokens: counts.input,
        output_tokens: counts.output,
        cache_read_tokens: counts.cacheRead,
        reasoning_tokens: counts.reasoning,
        tool_call: counts.toolCall,
      });
      expect(status).toBe(200);
      expect(counts.toolCall).toBe(true);
    });
  });
});
