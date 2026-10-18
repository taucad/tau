import { describe, expect, it, vi } from 'vitest';
import { mock, mockDeep } from 'vitest-mock-extended';
import { emptyChatLedger } from '@taucad/agent-host';
import type { AgentSessionModel } from '@taucad/agent-host';
import type { AgentLauncher } from '@taucad/agent-host/launcher';
import type { ProjectTask, ProjectTaskAttempt } from '@taucad/agent-host/wire';

import { createProjectTaskBackend } from '#project-task-integration.js';

const selected: AgentSessionModel = {
  id: 'catalog-model',
  providerKind: 'openai',
  contextWindow: 200_000,
  maxTokens: 16_000,
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
};

const setup = (
  input: Readonly<{
    provider: ProjectTask['provider'];
    model?: AgentSessionModel;
    resolveModel?: (modelId: string, signal: AbortSignal) => Promise<AgentSessionModel | undefined>;
    onContext?: () => void;
  }>,
) => {
  const createCandidate = vi.fn(async () => ({ checkoutId: 'candidate', checkoutRoot: '/candidate' }));
  const launcher = mockDeep<AgentLauncher>();
  launcher.read.mockRejectedValue(Object.assign(new Error('closed'), { code: 'HOST_CLOSED' }));
  launcher.host.ledger.mockResolvedValue({
    ...emptyChatLedger,
    runs: {
      attempt: {
        kind: 'tau',
        attempt: 1,
        lifecycle: 'completed',
        appendState: 'settled',
        committed: true,
        settlements: [],
        pendingInterrupts: {},
        opaque: false,
      },
    },
  });
  const resolved = vi.fn(input.resolveModel ?? (async () => undefined));
  const backend = createProjectTaskBackend({
    createCandidate,
    launcher: () => launcher,
    agents: ['codex'],
    systemPrompt: 'System',
    tauModel: input.model,
    resolveModel: async ({ modelId, signal }) => resolved(modelId, signal),
    bind: vi.fn(),
    allocated: vi.fn(),
    context: async () => {
      input.onContext?.();
      return {};
    },
    rememberGrant: vi.fn(),
    released: vi.fn(),
    waitForOwnerClose: async () => undefined,
    placement: mock(),
  });
  const attempt: ProjectTaskAttempt = {
    id: 'attempt',
    number: 1,
    status: 'allocating',
    source: { revisionId: 'source', checkoutId: 'live' },
    toolGrant: { toolChoice: 'auto' },
    createdAt: 1,
  };
  const task: ProjectTask = {
    id: 'task',
    projectId: 'project',
    chatId: 'chat',
    depth: 1,
    title: 'Task',
    prompt: 'Do work',
    provider: input.provider,
    attempts: [attempt],
    createdAt: 1,
    closed: false,
  };
  const launch = { task, attempt, messages: [], signal: new AbortController().signal };
  return { backend, createCandidate, launcher, resolved, launch };
};

describe('Tau child model admission', () => {
  it('resolves once before candidate allocation and carries an immutable row into the launcher', async () => {
    const row = { ...selected, cost: { ...selected.cost! } };
    const host = setup({ provider: { id: 'tau', model: 'catalog-model' }, resolveModel: async () => row });
    const allocation = await host.backend.allocate(host.launch);
    expect(host.resolved).toHaveBeenCalledOnce();
    expect(host.createCandidate).toHaveBeenCalledOnce();
    row.cost.input = 999;
    expect(allocation.model?.cost?.input).toBe(1);
    host.launcher.execute.mockResolvedValue({
      status: 'applied',
      commandId: 'task-start-attempt',
      generation: 1,
      effect: 'durable',
      cursor: 1,
    });
    const execution = await host.backend.start(host.launch, allocation);
    const command = host.launcher.execute.mock.calls[0]?.[0];
    expect(command?.type).toBe('start');
    if (command?.type !== 'start' || command.payload.config === undefined) {
      throw new Error('Expected a child start command with admission config.');
    }
    expect(command.payload.config.model).toEqual(allocation.model);
    expect(host.resolved).toHaveBeenCalledOnce();
    await expect(execution.completion).resolves.toEqual({ status: 'completed' });
  });

  it.each([
    [{ id: 'tau' }, undefined],
    [{ id: 'tau', model: 'missing' }, undefined],
    [
      { id: 'tau', model: 'catalog-model' },
      { ...selected, id: 'different' },
    ],
    [
      { id: 'tau', model: 'catalog-model' },
      { ...selected, contextWindow: 0 },
    ],
  ] as const)('fails unresolved Tau selection before creating a candidate', async (provider, row) => {
    const host = setup({ provider, resolveModel: async () => row });
    await expect(host.backend.allocate(host.launch)).rejects.toMatchObject({ code: 'TASK_UNAVAILABLE' });
    expect(host.createCandidate).not.toHaveBeenCalled();
    expect(host.launcher.execute).not.toHaveBeenCalled();
  });

  it('keeps a configured fallback and an external-native model out of Tau lookup', async () => {
    const fallback = setup({ provider: { id: 'tau' }, model: selected });
    const fallbackAllocation = await fallback.backend.allocate(fallback.launch);
    expect(fallbackAllocation.model).toEqual(selected);
    expect(fallback.resolved).not.toHaveBeenCalled();
    const external = setup({ provider: { id: 'codex', model: 'gpt-native' } });
    const externalAllocation = await external.backend.allocate(external.launch);
    expect(externalAllocation.model).toBeUndefined();
    expect(external.resolved).not.toHaveBeenCalled();
  });

  it('should preserve launcher defaults without gateway admission fields', async () => {
    const defaultModel: AgentSessionModel = { id: 'local-default', contextWindow: 200_000 };
    const host = setup({ provider: { id: 'tau' }, model: defaultModel });
    await expect(host.backend.validate({ id: 'tau' })).resolves.toBeUndefined();
    const allocation = await host.backend.allocate(host.launch);
    expect(allocation.model).toEqual(defaultModel);
    host.launcher.execute.mockResolvedValue({
      status: 'applied',
      commandId: 'task-start-attempt',
      generation: 1,
      effect: 'durable',
      cursor: 1,
    });
    const execution = await host.backend.start(host.launch, allocation);
    const command = host.launcher.execute.mock.calls[0]?.[0];
    expect(command?.type).toBe('start');
    if (command?.type !== 'start' || command.payload.config === undefined) {
      throw new Error('Expected a child start command with admission config.');
    }
    expect(command.payload.config.model).toBeUndefined();
    await expect(execution.completion).resolves.toEqual({ status: 'completed' });
    expect(host.resolved).not.toHaveBeenCalled();
  });

  it('should allow root registration without a default and resolve fresh metadata on a new attempt', async () => {
    let price = 1;
    const host = setup({
      provider: { id: 'tau', model: 'catalog-model' },
      resolveModel: async () => ({ ...selected, cost: { ...selected.cost!, input: price++ } }),
    });
    await expect(host.backend.validate({ id: 'tau' })).resolves.toBeUndefined();
    const first = await host.backend.allocate(host.launch);
    const second = await host.backend.allocate({
      ...host.launch,
      attempt: { ...host.launch.attempt, id: 'attempt-2', number: 2 },
    });
    expect(first.model?.cost?.input).toBe(1);
    expect(second.model?.cost?.input).toBe(2);
    expect(host.resolved).toHaveBeenCalledTimes(2);
    expect(host.createCandidate).toHaveBeenCalledTimes(2);
  });

  it('honors cancellation while catalog resolution is pending', async () => {
    const controller = new AbortController();
    const host = setup({
      provider: { id: 'tau', model: 'catalog-model' },
      resolveModel: async () => {
        controller.abort();
        return selected;
      },
    });
    await expect(host.backend.allocate({ ...host.launch, signal: controller.signal })).rejects.toBeDefined();
    expect(host.createCandidate).not.toHaveBeenCalled();
  });

  it('refuses an empty candidate identity before starting a child', async () => {
    const host = setup({ provider: { id: 'codex' } });
    host.createCandidate.mockResolvedValue({ checkoutId: '', checkoutRoot: '/candidate' });
    await expect(host.backend.allocate(host.launch)).rejects.toMatchObject({ code: 'TASK_SOURCE_UNAVAILABLE' });
    expect(host.launcher.execute).not.toHaveBeenCalled();
  });

  it('does not start a child when cancellation arrives during context assembly', async () => {
    const controller = new AbortController();
    const host = setup({
      provider: { id: 'codex' },
      onContext: () => {
        controller.abort();
      },
    });
    const launch = { ...host.launch, signal: controller.signal };
    const allocation = await host.backend.allocate(launch);
    await expect(host.backend.start(launch, allocation)).rejects.toBeDefined();
    expect(host.launcher.execute).not.toHaveBeenCalled();
  });
});
