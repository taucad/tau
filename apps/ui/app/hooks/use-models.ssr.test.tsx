// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { HydrationBoundary, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DehydratedState } from '@tanstack/react-query';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { dehydrateModelCatalog } from '#lib/model-catalog.server.js';
import { useModels } from '#hooks/use-models.js';
import type { Model } from '#hooks/use-models.js';
import { store } from '#hooks/use-cookie.js';

/* The server render and hydration of the model label (audit R3): the root loader's catalog. The person's choice is
   read after hydration (P2: the document is the same for every visitor). */

const flags = vi.hoisted(() => ({ modelPinning: false }));
vi.mock('#flags/use-feature.js', () => ({ useFeature: (name: 'modelPinning') => flags[name] }));

const row = (id: string, name: string, isDefault = false): Model =>
  ({
    id,
    name,
    recommended: true,
    ...(isDefault ? { default: true } : {}),
    provider: { id: 'anthropic', name: 'Anthropic' },
    details: { family: 'claude', contextWindow: 200_000 },
  }) as unknown as Model;

const catalog = [row('anthropic-claude-opus-5.5', 'Opus 5.5', true), row('anthropic-claude-haiku-5.5', 'Haiku 5.5')];

const modelKey = 'tau-chat-model';
const effortKey = 'tau-chat-effort';

/** Renders what the composer's model trigger reads. */
function ModelProbe(): React.JSX.Element {
  const { selectedModel, lastTauExecution } = useModels();
  const name = selectedModel.isNamePending ? 'pending' : selectedModel.name;
  return <span>{`${name}|${lastTauExecution.effort ?? 'none'}`}</span>;
}

const app = (client: QueryClient, queries: DehydratedState | undefined) => (
  <QueryClientProvider client={client}>
    <HydrationBoundary state={queries}>
      <ModelProbe />
    </HydrationBoundary>
  </QueryClientProvider>
);

describe('server-rendered model label', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('The browser must not refetch a fresh server catalog.');
      }),
    );
  });

  afterEach(() => {
    store.remove(modelKey);
    store.remove(effortKey);
    vi.unstubAllGlobals();
  });

  it('should render the catalog default on the server whatever the visitor chose', () => {
    store.update(modelKey, 'anthropic-claude-haiku-5.5');
    const queries = dehydrateModelCatalog({ models: catalog, fetchedAt: Date.now() });

    const html = renderToString(app(new QueryClient(), queries));

    expect(html).toContain('Opus 5.5|none');
    expect(html).not.toContain('anthropic-claude-opus-5.5');
  });

  it("should hydrate the neutral label, then show the visitor's choice, without a refetch or a recoverable error", async () => {
    const queries = dehydrateModelCatalog({ models: catalog, fetchedAt: Date.now() });
    const container = document.createElement('div');
    container.innerHTML = renderToString(app(new QueryClient(), queries));
    store.update(modelKey, 'anthropic-claude-haiku-5.5');
    store.update(effortKey, 'high');
    const onRecoverableError = vi.fn();

    const root = await act(async () => hydrateRoot(container, app(new QueryClient(), queries), { onRecoverableError }));

    expect(container.textContent).toBe('Haiku 5.5|high');
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    act(() => {
      root.unmount();
    });
  });

  it('should render the catalog default for a first visit, never an empty label', () => {
    const queries = dehydrateModelCatalog({ models: catalog, fetchedAt: Date.now() });

    expect(renderToString(app(new QueryClient(), queries))).toContain('Opus 5.5|none');
  });

  it('should render the pending placeholder state when the server had no catalog', () => {
    expect(renderToString(app(new QueryClient(), undefined))).toContain('pending|none');
  });
});
