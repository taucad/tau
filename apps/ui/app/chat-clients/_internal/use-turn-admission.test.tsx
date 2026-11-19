// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { CadAgentExecution } from '@taucad/chat';
import type { ModelCatalog } from '@taucad/chat-ui/utils/new-chat-execution';
import { useTurnAdmission } from '#chat-clients/_internal/use-turn-admission.js';

const harness = vi.hoisted(() => {
  const state: { catalog: ModelCatalog } = { catalog: { status: 'loading' } };
  return Object.assign(state, {
    cloudOpenPending: false,
    intentListeners: new Set<() => void>(),
    statusListeners: new Set<() => void>(),
    syncState: 'pending' as string,
    canOpen: true,
    hasClient: true,
    clientListeners: new Set<() => void>(),
    creditPreflight: vi.fn(),
    awaitAvailability: vi.fn(async () => ({ status: 'available', durability: 'exclusive-append' })),
  });
});

const row = (id: string) => ({ id, name: id, provider: { id: 'anthropic', name: 'Anthropic' } });

vi.mock('#hooks/use-cad-agent-config.js', () => ({
  awaitAgentHostAvailability: harness.awaitAvailability,
}));
vi.mock('#hooks/use-credit-preflight.js', () => ({ useCreditPreflight: () => harness.creditPreflight }));
vi.mock('#hooks/active-chat-provider.js', () => ({ useActiveChatSession: () => ({ activeChatId: 'chat_1' }) }));
vi.mock('#hooks/chat-session-store-provider.js', () => ({ useChatSessionStore: () => ({ get: () => undefined }) }));
vi.mock('#hooks/use-project.js', () => ({ useProject: () => ({ projectId: 'proj_1' }) }));
vi.mock('#lib/tau-cloud-intent.js', () => ({
  isCloudProjectPending: () => harness.cloudOpenPending,
  canOpenCloudProject: () => harness.canOpen,
  cloudOpenAccountReason: 'Sign in with the account you used to open this project.',
  tauCloudIntent: {
    subscribe: (listener: () => void) => {
      harness.intentListeners.add(listener);
      return () => harness.intentListeners.delete(listener);
    },
  },
}));
vi.mock('@taucad/revisions-ui/services/revision-client-registry', () => {
  /* One client object, as the registry holds one per project. */
  const client = {
    status: () => ({ sync: { state: harness.syncState }, remote: { kind: 'tau', phase: 'connected' } }),
    subscribe: (listener: () => void) => {
      harness.statusListeners.add(listener);
      return () => harness.statusListeners.delete(listener);
    },
  };
  return {
    peekRevisionClient: () => (harness.hasClient ? client : undefined),
    subscribeRevisionClients: (listener: () => void) => {
      harness.clientListeners.add(listener);
      return () => harness.clientListeners.delete(listener);
    },
  };
});
vi.mock('#lib/agent-host-placement.js', () => ({
  daemonPlacementOf: (execution: { hostId?: string }) => execution.hostId,
  /* The web build: an external agent pinned to Tau Desktop has nowhere to run here. */
  unplaceableExecutionReason: (execution: { kind: string; hostId?: string }) =>
    execution.kind === 'acp' && execution.hostId === 'desktop' ? 'Codex runs in the Tau desktop app.' : undefined,
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

const admit = async (execution: CadAgentExecution, signal?: AbortSignal) => {
  const { result } = renderHook(() => useTurnAdmission(execution));
  return result.current.admitExecution(undefined, signal);
};

const notify = (listeners: ReadonlySet<() => void>): void => {
  /* A snapshot: a listener that resubscribes while it runs must not run again in this pass. */
  const snapshot = new Set(listeners);
  for (const listener of snapshot) {
    listener();
  }
};

const listening = (): number =>
  harness.intentListeners.size + harness.statusListeners.size + harness.clientListeners.size;

beforeEach(() => {
  vi.clearAllMocks();
  harness.cloudOpenPending = false;
  harness.syncState = 'pending';
  harness.canOpen = true;
  harness.hasClient = true;
});

describe('useTurnAdmission', () => {
  /* SP2h: chats open while the files still arrive; a turn in this document's checkout is held until they land, so a
   * seeded or linked prompt sent at once still runs (review). */
  it('should hold a browser-hosted turn until a Tau Cloud open has written the files, then admit it', async () => {
    harness.cloudOpenPending = true;
    harness.catalog = { status: 'loaded', models: [row('anthropic-claude-opus-4.8')] };
    let settled = false;
    const admitted = (async () => {
      try {
        return await admit(opus);
      } finally {
        settled = true;
      }
    })();
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(harness.awaitAvailability).not.toHaveBeenCalled();

    harness.cloudOpenPending = false;
    notify(harness.intentListeners);
    await expect(admitted).resolves.toEqual({ hostId: expect.any(String) as unknown as string });
    expect(listening()).toBe(0);
  });

  it('should refuse a held turn with the reason once the Tau Cloud open fails', async () => {
    harness.cloudOpenPending = true;
    const admitted = admit(opus);
    harness.syncState = 'failed';
    notify(harness.statusListeners);
    await expect(admitted).rejects.toMatchObject({
      code: 'CHAT_PLACEMENT_UNAVAILABLE',
      message: expect.stringContaining('could not finish') as unknown as string,
    });
  });

  it('should end a held turn when its dispatch is stopped, and stop listening', async () => {
    harness.cloudOpenPending = true;
    const stop = new AbortController();
    const admitted = admit(opus, stop.signal);
    await Promise.resolve();
    expect(listening()).toBeGreaterThan(0);
    stop.abort(new Error('Stopped.'));
    await expect(admitted).rejects.toThrow('Stopped.');
    expect(listening()).toBe(0);
  });

  it('should hear a failed open from a revision client that arrives after the wait began', async () => {
    harness.cloudOpenPending = true;
    harness.hasClient = false;
    const admitted = admit(opus);
    await Promise.resolve();
    harness.hasClient = true;
    harness.syncState = 'failed';
    notify(harness.clientListeners);
    await expect(admitted).rejects.toMatchObject({ code: 'CHAT_PLACEMENT_UNAVAILABLE' });
    expect(listening()).toBe(0);
  });

  it('should refuse a held turn at once with the account reason when this account cannot open the project', async () => {
    harness.cloudOpenPending = true;
    harness.canOpen = false;
    await expect(admit(opus)).rejects.toMatchObject({
      code: 'CHAT_PLACEMENT_UNAVAILABLE',
      message: 'Sign in with the account you used to open this project.',
    });
    expect(listening()).toBe(0);
  });

  it('should admit a daemon-placed turn while a Tau Cloud open writes this document’s files', async () => {
    harness.cloudOpenPending = true;
    /* A daemon runs on its own tree, which this open is not writing. */
    await expect(admit({ kind: 'acp', hostId: 'origin', agentId: 'codex' })).resolves.toEqual({ hostId: 'origin' });
  });

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
    await expect(admit({ kind: 'acp', hostId: 'origin', agentId: 'codex' })).resolves.toEqual({ hostId: 'origin' });
  });

  it('should refuse an external agent this device cannot place at once, without waiting for its host', async () => {
    await expect(admit({ kind: 'acp', hostId: 'desktop', agentId: 'codex' })).rejects.toMatchObject({
      code: 'CHAT_PLACEMENT_UNAVAILABLE',
      message: 'Codex runs in the Tau desktop app.',
    });
    expect(harness.awaitAvailability).not.toHaveBeenCalled();
    expect(harness.creditPreflight).not.toHaveBeenCalled();
  });
});
