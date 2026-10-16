// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AcpAgentExecution, TauAgentExecution } from '@taucad/chat';
import { useModels } from '#hooks/use-models.js';
import type { Model } from '#hooks/use-models.js';
import { store } from '#hooks/use-cookie.js';
import { cookieName } from '#constants/cookie.constants.js';
import { metaConfig } from '#constants/meta.constants.js';

const codex: AcpAgentExecution = {
  kind: 'acp',
  hostId: 'desktop',
  agentId: 'codex',
  model: 'gpt-6-astra',
  config: { mode: 'high' },
};
const catalogRow = (id: string, recommended = false) => ({
  id,
  name: id,
  recommended,
  provider: { id: 'anthropic', name: 'Anthropic' },
  details: { family: 'claude', contextWindow: 200_000 },
});

const storageKeys = [
  cookieName.chatExecution,
  cookieName.chatModel,
  cookieName.chatEffort,
  cookieName.chatModelOverrides,
  cookieName.chatModelPinned,
].map((name) => `${metaConfig.cookiePrefix}${name}`);

let queryClient: QueryClient;
const wrapper = ({ children }: { readonly children: ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);
const respond = (body: unknown, init?: ResponseInit) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), init)),
  );
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  for (const key of storageKeys) {
    store.remove(key);
  }
  queryClient.clear();
  vi.unstubAllGlobals();
});

describe('useModels', () => {
  it('should reuse a fresh catalog when another consumer mounts', async () => {
    respond([catalogRow('anthropic-claude-opus-4.8', true)]);
    const first = renderHook(() => useModels(), { wrapper });
    await waitFor(() => {
      expect(first.result.current.availableModels).toHaveLength(1);
    });

    const second = renderHook(() => useModels(), { wrapper });

    expect(second.result.current.availableModels).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('new-chat default execution', () => {
    it('should start the next chat on the external agent last used, with its model and config', async () => {
      respond([catalogRow('anthropic-claude-opus-4.8', true)]);
      const { result } = renderHook(() => useModels(), { wrapper });
      act(() => {
        result.current.rememberExecution(codex);
      });
      expect(result.current.defaultExecution).toEqual(codex);
    });

    it('should keep the last Tau choice for switching back from an external agent', () => {
      respond([]);
      const { result } = renderHook(() => useModels(), { wrapper });
      const tau: TauAgentExecution = { kind: 'tau', model: 'anthropic-claude-haiku-5.5', effort: 'low' };
      act(() => {
        result.current.rememberExecution(tau);
        result.current.rememberExecution(codex);
      });
      expect(result.current.lastTauExecution).toEqual(tau);
      expect(result.current.defaultExecution).toEqual(codex);
    });

    it('should ignore a stored execution that fails the execution schema', () => {
      respond([]);
      store.update(`${metaConfig.cookiePrefix}${cookieName.chatExecution}`, { kind: 'acp', agentId: 'codex' });
      const { result } = renderHook(() => useModels(), { wrapper });
      expect(result.current.defaultExecution).toEqual({ kind: 'tau', model: 'anthropic-claude-opus-4.8' });
    });

    it('should move a remembered Tau model the catalog no longer offers to the recommended model', async () => {
      respond([catalogRow('other'), catalogRow('anthropic-claude-opus-4.9', true)]);
      const { result } = renderHook(() => useModels(), { wrapper });
      act(() => {
        result.current.rememberExecution({ kind: 'tau', model: 'retired', effort: 'high' });
      });
      await waitFor(() => {
        expect(result.current.defaultExecution).toEqual({
          kind: 'tau',
          model: 'anthropic-claude-opus-4.9',
          effort: 'high',
        });
      });
    });
  });

  describe('catalog state', () => {
    it('should report the catalog unavailable when the API answers with an error', async () => {
      respond({ message: 'Bad Gateway' }, { status: 502 });
      const { result } = renderHook(() => useModels(), { wrapper });
      /* The catalog retries once before it reports a failure. */
      await waitFor(
        () => {
          expect(result.current.catalog).toEqual({ status: 'unavailable' });
        },
        { timeout: 3000 },
      );
      expect(result.current.availableModels).toEqual([]);
    });

    it('should report the catalog unavailable when the API cannot be reached', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          throw new TypeError('Failed to fetch');
        }),
      );
      const { result } = renderHook(() => useModels(), { wrapper });
      /* The catalog retries once before it reports a failure. */
      await waitFor(
        () => {
          expect(result.current.catalog).toEqual({ status: 'unavailable' });
        },
        { timeout: 3000 },
      );
    });

    it('should let a caller await the in-flight catalog and resolve against it', async () => {
      respond([catalogRow('anthropic-claude-opus-4.8', true)]);
      const { result } = renderHook(() => useModels(), { wrapper });
      const catalog = await result.current.ensureModelCatalog();
      expect(catalog.status).toBe('loaded');
      expect(result.current.resolveModel('anthropic-claude-opus-4.8').provider.id).toBe('anthropic');
    });
  });

  describe('pinned models and availability', () => {
    const pinnedKey = `${metaConfig.cookiePrefix}${cookieName.chatModelPinned}`;
    const overridesKey = `${metaConfig.cookiePrefix}${cookieName.chatModelOverrides}`;
    const catalog = [catalogRow('opus', true), catalogRow('sonnet', true), catalogRow('hidden')];
    const loaded = async () => {
      respond(catalog);
      const hook = renderHook(() => useModels(), { wrapper });
      await waitFor(() => {
        expect(hook.result.current.data).toHaveLength(3);
      });
      return hook;
    };
    const row = (id: string) => catalog.find((entry) => entry.id === id) as unknown as Model;

    it('should keep pins in pin order and leave a pinned model where it is', async () => {
      const { result } = await loaded();
      act(() => {
        result.current.setPinned(row('sonnet'), true);
        result.current.setPinned(row('opus'), true);
        result.current.setPinned(row('sonnet'), true);
      });
      expect(result.current.pinnedIds).toEqual(['sonnet', 'opus']);
      act(() => {
        result.current.setPinned(row('sonnet'), false);
      });
      expect(result.current.pinnedIds).toEqual(['opus']);
      expect(store.get(pinnedKey)).toEqual(['opus']);
    });

    it('should keep a pinned model in the picker, even switched off before or reset after', async () => {
      const { result } = await loaded();
      act(() => {
        result.current.setAvailable(row('hidden'), false);
      });
      expect(result.current.isAvailable(row('hidden'))).toBe(false);
      act(() => {
        result.current.setPinned(row('hidden'), true);
      });
      expect(result.current.isAvailable(row('hidden'))).toBe(true);
      act(() => {
        result.current.resetAvailability();
      });
      expect(result.current.isAvailable(row('hidden'))).toBe(true);
      act(() => {
        result.current.setPinned(row('hidden'), false);
      });
      expect(result.current.isAvailable(row('hidden'))).toBe(false);
    });

    it('should ignore unknown pins on read, prune them on write, and read a malformed list as empty', async () => {
      store.update(pinnedKey, ['retired', 'opus']);
      const { result } = await loaded();
      expect(result.current.pinnedIds).toEqual(['opus']);
      act(() => {
        result.current.setPinned(row('sonnet'), true);
      });
      expect(store.get(pinnedKey)).toEqual(['opus', 'sonnet']);

      act(() => {
        store.update(pinnedKey, { opus: true });
      });
      expect(result.current.pinnedIds).toEqual([]);
    });

    it('should keep pins the catalog cannot confirm while it is unavailable', () => {
      respond({ message: 'Bad Gateway' }, { status: 502 });
      store.update(pinnedKey, ['retired']);
      const { result } = renderHook(() => useModels(), { wrapper });
      expect(result.current.pinnedIds).toEqual(['retired']);
    });

    it('should store a toggle that agrees with the recommendation, prune unknown ids, and reset', async () => {
      store.update(overridesKey, { retired: true });
      const { result } = await loaded();
      act(() => {
        result.current.setAvailable(row('opus'), false);
        result.current.setAvailable(row('opus'), true);
      });
      expect(result.current.overrides).toEqual({ opus: true });
      act(() => {
        result.current.resetAvailability();
      });
      expect(result.current.overrides).toEqual({});
      expect(result.current.isAvailable(row('opus'))).toBe(true);
    });
  });
});
