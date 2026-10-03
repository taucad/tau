// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CadAgentExecution } from '@taucad/chat';
import type { ModelCatalog } from '#utils/new-chat-execution.js';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';

const harness = vi.hoisted(() => {
  const state: { catalog: ModelCatalog } = { catalog: { status: 'loading' } };
  return Object.assign(state, { creditPreflight: vi.fn() });
});

const row = (id: string) => ({ id, name: id, provider: { id: 'anthropic', name: 'Anthropic' } });

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  awaitAgentHostAvailability: async () => ({ status: 'available', durability: 'exclusive-append' }),
}));
vi.mock('#hooks/use-credit-preflight.js', () => ({ useCreditPreflight: () => harness.creditPreflight }));
vi.mock('#hooks/active-chat-provider.js', () => ({ useActiveChatSession: () => ({ activeChatId: 'chat_1' }) }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => ({ get: () => undefined }) }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'proj_1' }) }));
vi.mock('#lib/agent-host-placement.js', () => ({
  daemonPlacementOf: (execution: { hostId?: string }) => execution.hostId,
}));
vi.mock('#hooks/use-models.js', () => ({
  useModels: () => ({
    /* Admission waits for the catalog's own answer; the snapshot it starts from may predate it. */
    ensureModelCatalog: async () => harness.catalog,
    resolveModel: (id: string) => {
      const model = harness.catalog.status === 'loaded' ? harness.catalog.models.find((m) => m.id === id) : undefined;
      return model === undefined
        ? { id, name: id, isResolved: false, provider: { id: 'unknown', name: 'Unknown' } }
        : { id, name: id, isResolved: true, provider: { id: 'anthropic', name: 'Anthropic' }, model };
    },
  }),
}));

const opus: CadAgentExecution = { kind: 'tau', model: 'anthropic-claude-opus-4.8' };

const admit = async (execution: CadAgentExecution) => {
  const { result } = renderHook(() => useTurnAdmission(execution));
  return result.current.admitExecution();
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useTurnAdmission', () => {
  it('should refuse a Tau turn with a readable reason when the model catalog cannot be reached', async () => {
    harness.catalog = { status: 'unavailable' };
    await expect(admit(opus)).rejects.toMatchObject({
      code: 'CHAT_PLACEMENT_UNAVAILABLE',
      message: expect.stringContaining("can't reach its model list") as unknown as string,
    });
    expect(harness.creditPreflight).not.toHaveBeenCalled();
  });

  it('should refuse a Tau turn on a model the catalog no longer offers', async () => {
    harness.catalog = { status: 'loaded', models: [row('anthropic-claude-opus-4.9')] };
    await expect(admit(opus)).rejects.toMatchObject({
      code: 'CHAT_PLACEMENT_UNAVAILABLE',
      message: expect.stringContaining('anthropic-claude-opus-4.8 is no longer offered') as unknown as string,
    });
  });

  it('should admit a Tau turn once the awaited catalog offers its model', async () => {
    harness.catalog = { status: 'loaded', models: [row('anthropic-claude-opus-4.8')] };
    await expect(admit(opus)).resolves.toEqual({ hostId: expect.any(String) as unknown as string });
    expect(harness.creditPreflight).toHaveBeenCalledWith('anthropic-claude-opus-4.8', 'anthropic-claude-opus-4.8');
  });

  it('should admit an external agent without consulting the Tau catalog', async () => {
    harness.catalog = { status: 'unavailable' };
    await expect(admit({ kind: 'acp', hostId: 'desktop', agentId: 'codex' })).resolves.toEqual({ hostId: 'desktop' });
  });
});
