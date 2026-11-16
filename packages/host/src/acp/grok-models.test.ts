/*
 * Grok's `_x.ai/models/update`: validated at the port, folded as the `config_option_update` it stands
 * for, and read by a live session as its model choice.
 */

import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import type { SessionConfigOption } from '@agentclientprotocol/sdk';

import { flush } from '@taucad/xstate-testing/clock';
import { createFakeCallbackActors } from '@taucad/xstate-testing/fakes';

import { openAcpSession } from '#acp/acp-session.js';
import { provideAcpSession } from '#acp/acp-session-logic.js';
import { grokModelsSchema, withGrokModels } from '#acp/grok-models.js';
import type { AcpPromptTurn } from '#acp/session.js';
import { modelChoice, protocolVersion } from '#acp/session.js';
import type { AcpAdapter } from '#acp/registry.js';

const builtIn: SessionConfigOption[] = [
  {
    id: 'model',
    name: 'Model',
    category: 'model',
    type: 'select',
    currentValue: 'built-in-a',
    options: [
      { value: 'built-in-a', name: 'Built-in A' },
      { value: 'built-in-b', name: 'Built-in B' },
    ],
  },
  {
    id: 'thought_level',
    name: 'Thinking',
    category: 'thought_level',
    type: 'select',
    currentValue: 'low',
    options: [{ value: 'low', name: 'Low' }],
  },
];

const pushed = grokModelsSchema.parse({
  currentModelId: 'account-a',
  availableModels: [
    { modelId: 'built-in-a', name: 'Built-in A' },
    { modelId: 'built-in-b', name: 'Built-in B' },
    { modelId: 'account-a', name: 'Account A', description: 'Signed-in only' },
    { modelId: 'account-b', name: 'Account B', description: null },
  ],
});

describe('grokModelsSchema', () => {
  it('should refuse a push with no models or a model without an id', () => {
    expect(grokModelsSchema.safeParse({ currentModelId: 'a', availableModels: [] }).success).toBe(false);
    expect(
      grokModelsSchema.safeParse({ currentModelId: 'a', availableModels: [{ modelId: '', name: 'A' }] }).success,
    ).toBe(false);
    expect(grokModelsSchema.safeParse({ availableModels: [{ modelId: 'a', name: 'A' }] }).success).toBe(false);
  });
});

describe('withGrokModels', () => {
  it('should replace the model select’s choices and current value and keep its id and the other options', () => {
    const refreshed = withGrokModels(builtIn, pushed);

    expect(modelChoice(refreshed)).toEqual({
      configId: 'model',
      currentValue: 'account-a',
      models: [
        { id: 'built-in-a', name: 'Built-in A' },
        { id: 'built-in-b', name: 'Built-in B' },
        { id: 'account-a', name: 'Account A' },
        { id: 'account-b', name: 'Account B' },
      ],
      values: ['built-in-a', 'built-in-b', 'account-a', 'account-b'],
    });
    const model = refreshed?.[0];
    const listed = model?.type === 'select' ? model.options : [];
    expect(listed[2]).toEqual({ value: 'account-a', name: 'Account A', description: 'Signed-in only' });
    expect(listed[3]).toEqual({ value: 'account-b', name: 'Account B' });
    expect(refreshed?.[1]).toBe(builtIn[1]);
  });

  it('should refresh nothing while the session offers no model select', () => {
    expect(withGrokModels(undefined, pushed)).toBeUndefined();
    expect(withGrokModels(builtIn.slice(1), pushed)).toBeUndefined();
  });
});

const adapter: AcpAdapter = {
  id: 'fake',
  displayName: 'Fake',
  package: 'fixture',
  version: '0.0.0',
  configEnv: [],
  modulePath: '/nonexistent',
};

describe('acpSession with a pushed model list', () => {
  it('should prefer a list pushed before the open’s answer to the built-in list that answer holds', async () => {
    const fakes = createFakeCallbackActors();
    const machine = provideAcpSession({
      createId: () => crypto.randomUUID(),
      seams: () => undefined,
      publishSkills: async () => [],
    }).provide({ actors: { adapterConnection: fakes.actor('connection') } });
    const actor = createActor(machine, {
      input: {
        key: 'fake:chat-1',
        opening: {
          adapter,
          cwd: '/work',
          mcpServers: [],
          sessionMessageId: 'session-message',
          sessionCommitted: false,
          notices: false,
        },
      },
    });
    actor.start();
    const answer = (result: unknown): void => {
      const call = fakes.deliveries
        .filter((delivery) => delivery.name === 'connection')
        .map((delivery) => delivery.event)
        .findLast((event) => event.type === 'call');
      fakes.sendBack('connection', {
        type: 'callSettled',
        id: String(call?.['id']),
        at: 0,
        answer: { method: String(call?.['method']), result },
      });
    };
    await flush();
    answer({ protocolVersion, agentCapabilities: {} });
    await flush();
    fakes.sendBack('connection', { type: 'grokModels', models: pushed });
    answer({ sessionId: 'acp-1', configOptions: builtIn });
    await flush();

    expect(modelChoice(actor.getSnapshot().context.configOptions)?.values).toEqual([
      'built-in-a',
      'built-in-b',
      'account-a',
      'account-b',
    ]);
    expect(actor.getSnapshot().context.presentation.configOptions).toMatchObject([
      { id: 'model', currentValue: 'account-a' },
      { id: 'thought_level' },
    ]);
    actor.stop();
  });
});

describe('a live ACP session', () => {
  it('should refresh its model list from Grok’s push and run a turn on a pushed model', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'tau-acp-pushed-models-'));
    const session = await openAcpSession({
      adapter: {
        id: 'codex',
        package: 'fixture',
        version: '0.0.0',
        configEnv: [],
        displayName: 'Codex',
        // eslint-disable-next-line @typescript-eslint/naming-convention -- child-process environment variable names.
        spawnEnv: { TAU_FAKE_AGENT_MODE: 'pushed-models' },
        modulePath: new URL('fixtures/fake-agent.ts', import.meta.url).pathname,
      },
      cwd,
      createId: randomUUID,
    });
    const turn: AcpPromptTurn = {
      append: async () => undefined,
      approve: async () => ({ interruptId: 'unused', outcome: 'cancelled' }),
      publishLive: async () => undefined,
      signal: new AbortController().signal,
    };

    try {
      expect(modelChoice(session.configOptions)?.values).toHaveLength(2);
      await session.modelListPushed;

      expect(modelChoice(session.configOptions)?.values).toHaveLength(4);
      expect(modelChoice(session.configOptions)?.values.slice(2)).toEqual(['pushed-model-a', 'pushed-model-b']);
      await expect(session.prompt('noask', turn, 'pushed-model-a')).resolves.toMatchObject({
        stopReason: 'end_turn',
      });
      expect(modelChoice(session.configOptions)?.currentValue).toBe('pushed-model-a');
    } finally {
      await session.close();
      await rm(cwd, { recursive: true, force: true });
    }
  }, 30_000);
});
