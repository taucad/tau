import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAgentSession, createGatewayModelTransport } from '@taucad/agent-host';
import type {
  AgentLiveEvent,
  HostToolInvocation,
  ModelProviderKind,
  ModelReasoningConfig,
  ProviderMessage,
} from '@taucad/agent-host';
import { createNodeEventLog } from '@taucad/agent-host/node';

type ProviderCase = {
  readonly providerKind: Extract<ModelProviderKind, 'openai' | 'anthropic' | 'vertexai' | 'xai'>;
  readonly modelId: string;
  readonly contextWindow: number;
  readonly reasoning: ModelReasoningConfig;
};

const defaults: Record<ProviderCase['providerKind'], Omit<ProviderCase, 'providerKind'>> = {
  openai: {
    modelId: 'openai-gpt-5.6-luna',
    contextWindow: 200_000,
    reasoning: { effort: 'high', summary: 'detailed' },
  },
  anthropic: {
    modelId: 'anthropic-claude-haiku-4.5',
    contextWindow: 200_000,
    reasoning: { budgetTokens: 4000, display: 'summarized' },
  },
  vertexai: {
    modelId: 'google-gemini-3.8-flash',
    contextWindow: 200_000,
    reasoning: { effort: 'high' },
  },
  xai: {
    modelId: 'xai-grok-4.6',
    contextWindow: 200_000,
    reasoning: { effort: 'high', summary: 'detailed' },
  },
};
const gateway = process.env['TAU_AGENT_LIVE_GATEWAY_URL'] ?? process.env['TAU_HOST_GATEWAY_URL'] ?? '';
const bearer = process.env['TAU_AGENT_LIVE_BEARER'] ?? process.env['TAU_HOST_LIVE_BEARER'] ?? '';
const selected = (process.env['TAU_AGENT_LIVE_PROVIDERS'] ?? '')
  .split(',')
  .map((provider) => provider.trim())
  .filter(Boolean);
const known = new Set(Object.keys(defaults));

const cases = selected.flatMap((provider): ProviderCase[] => {
  if (!known.has(provider)) {
    return [];
  }
  const providerKind = provider as ProviderCase['providerKind'];
  const configured = defaults[providerKind];
  const variable = `TAU_AGENT_LIVE_${providerKind.toUpperCase()}_MODEL`;
  return [{ providerKind, ...configured, modelId: process.env[variable] ?? configured.modelId }];
});

const roots: string[] = [];

afterAll(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

const textOf = (message: ProviderMessage): string =>
  typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .flatMap((block) =>
            block !== null && typeof block === 'object' && !Array.isArray(block) && typeof block['text'] === 'string'
              ? [block['text']]
              : [],
          )
          .join('')
      : '';

describe('live gateway provider streaming', () => {
  beforeAll(() => {
    expect(gateway, 'TAU_AGENT_LIVE_GATEWAY_URL or TAU_HOST_GATEWAY_URL is required').not.toBe('');
    expect(bearer, 'TAU_AGENT_LIVE_BEARER or TAU_HOST_LIVE_BEARER is required').not.toBe('');
    expect(selected, 'TAU_AGENT_LIVE_PROVIDERS must select at least one provider').not.toEqual([]);
    expect(
      selected.filter((provider) => !known.has(provider)),
      'unknown selected providers',
    ).toEqual([]);
    expect(cases).toHaveLength(selected.length);
  });

  for (const provider of cases) {
    it(`${provider.providerKind}/${provider.modelId} streams a tool turn and resumes it after reload`, async () => {
      const nonce = `tau-live-${provider.providerKind}-${Date.now().toString(36)}`;
      const root = await mkdtemp(join(tmpdir(), `tau-agent-live-${provider.providerKind}-`));
      roots.push(root);
      const filePath = join(root, '.tau', 'chats', nonce, 'events.jsonl');
      const live: AgentLiveEvent[] = [];
      let invocations = 0;
      const toolRegistry = {
        list: () => [
          {
            name: 'echo_probe',
            description: 'Echo a nonce and payload for stream verification.',
            inputSchema: {
              type: 'object',
              properties: { nonce: { type: 'string' }, payload: { type: 'string' } },
              required: ['nonce', 'payload'],
              additionalProperties: false,
            },
          },
        ],
        invoke: async (invocation: HostToolInvocation) => {
          invocations++;
          invocation.onUpdate?.({ content: { nonce, phase: 'halfway' }, isError: false });
          return { content: { nonce, echoed: true }, isError: false };
        },
      };
      const transport = createGatewayModelTransport({ baseUrl: gateway, auth: () => bearer });
      const model = {
        id: provider.modelId,
        contextWindow: provider.contextWindow,
        maxTokens: 4096,
        providerKind: provider.providerKind,
        reasoning: provider.reasoning,
      } as const;
      const first = await createAgentSession({
        chatId: nonce,
        runId: `${nonce}-run-1`,
        leaderEpoch: `${nonce}-epoch-1`,
        systemPrompt:
          'Solve the optimization problem before calling echo_probe exactly once. Preserve the supplied nonce, put the solution and supplied padding in payload, then report the returned nonce.',
        model,
        modelTransport: transport,
        toolRegistry,
        eventLog: await createNodeEventLog({ filePath }),
        onLiveEvent: (event) => {
          live.push(event);
        },
      });

      try {
        await first.prompt({
          id: `${nonce}-user-1`,
          role: 'user',
          content: `A farmer has 100 meters of fence for a rectangle beside a straight river, so the river side needs no fence. Derive the dimensions that maximize area, then call echo_probe with nonce ${nonce}. Begin payload with the dimensions and include this padding verbatim: ${'structured payload '.repeat(8)}`,
        });
        const snapshot = await first.snapshot();
        const types = live.map((event) => event.type);
        const toolStart = types.indexOf('tool-input-start');
        const toolDelta = types.indexOf('tool-input-delta');
        const toolEnd = types.indexOf('tool-input-end');
        const progress = types.indexOf('tool-output-update');

        expect(snapshot.state, JSON.stringify(snapshot.messages.slice(-2))).toBe('completed');
        expect(types).toContain('thinking-start');
        expect(types).toContain('thinking-delta');
        expect(types).toContain('thinking-end');
        expect(toolStart).toBeGreaterThanOrEqual(0);
        expect(toolDelta).toBeGreaterThan(toolStart);
        expect(toolEnd).toBeGreaterThan(toolDelta);
        expect(progress).toBeGreaterThan(toolEnd);
        expect(invocations).toBe(1);
        expect(
          snapshot.messages.some(
            (message) =>
              message.role === 'tool-input' &&
              message.content !== null &&
              typeof message.content === 'object' &&
              !Array.isArray(message.content) &&
              (message.content as Record<string, unknown>)['nonce'] === nonce,
          ),
        ).toBe(true);
        expect(snapshot.messages).toContainEqual(
          expect.objectContaining({ role: 'tool-output', content: { nonce, echoed: true }, isError: false }),
        );
        expect(
          snapshot.messages.some(
            (message) =>
              message.role === 'assistant' &&
              Array.isArray(message.metadata?.['reasoningTimings']) &&
              message.metadata['reasoningTimings'].some(
                (timing) =>
                  timing !== null &&
                  typeof timing === 'object' &&
                  !Array.isArray(timing) &&
                  typeof timing['startedAtMs'] === 'number' &&
                  typeof timing['endedAtMs'] === 'number',
              ),
          ),
        ).toBe(true);
      } finally {
        await first.close();
      }

      const second = await createAgentSession({
        chatId: nonce,
        runId: `${nonce}-run-2`,
        leaderEpoch: `${nonce}-epoch-2`,
        systemPrompt: 'Answer from the durable conversation history. Do not call a tool.',
        model,
        modelTransport: transport,
        toolRegistry,
        eventLog: await createNodeEventLog({ filePath }),
      });
      try {
        await second.prompt({
          id: `${nonce}-user-2`,
          role: 'user',
          content: 'Reply with the nonce returned by echo_probe in the previous turn.',
        });
        const resumed = await second.snapshot();
        expect(resumed.state).toBe('completed');
        expect(
          resumed.messages
            .filter((message) => message.role === 'assistant')
            .map((message) => textOf(message))
            .at(-1),
        ).toContain(nonce);
        expect(invocations).toBe(1);
      } finally {
        await second.close();
      }
    }, 240_000);
  }
});
