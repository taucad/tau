// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { AcpAgentExecution, TauAgentExecution } from '@taucad/chat';
import { useModels } from '#hooks/use-models.js';
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

const storageKeys = [cookieName.chatExecution, cookieName.chatModel, cookieName.chatEffort].map(
  (name) => `${metaConfig.cookiePrefix}${name}`,
);

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
});
