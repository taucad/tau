import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createModelCatalogCache } from '#lib/model-catalog.server.js';
import { catalogFreshness } from '#lib/model-catalog.js';
import type { Model } from '#lib/model-catalog.js';

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

describe('createModelCatalogCache', () => {
  let time: number;
  const now = (): number => time;

  beforeEach(() => {
    time = 1_000_000;
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should share one fetch between concurrent documents and reuse it while fresh', async () => {
    const fetchCatalog = vi.fn(async () => catalog);
    const read = createModelCatalogCache({ fetchCatalog, now });

    const [first, second] = await Promise.all([read(), read()]);
    time += catalogFreshness - 1;
    const third = await read();

    expect(fetchCatalog).toHaveBeenCalledOnce();
    expect(first).toEqual({ models: catalog, fetchedAt: 1_000_000 });
    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('should serve a stale catalog at once and refresh it in the background', async () => {
    const fresher = [row('anthropic-claude-opus-6', 'Opus 6', true)];
    const fetchCatalog = vi
      .fn<() => Promise<readonly Model[]>>()
      .mockResolvedValueOnce(catalog)
      .mockResolvedValue(fresher);
    const read = createModelCatalogCache({ fetchCatalog, now });
    await read();
    time += catalogFreshness;

    const stale = await read();
    await vi.waitFor(() => {
      expect(fetchCatalog).toHaveBeenCalledTimes(2);
    });
    const refreshed = await read();

    expect(stale?.models).toBe(catalog);
    expect(refreshed).toEqual({ models: fresher, fetchedAt: time });
  });

  it('should render without a catalog when the API fails, and not wait on it again until the backoff passes', async () => {
    const fetchCatalog = vi
      .fn<() => Promise<readonly Model[]>>()
      .mockRejectedValueOnce(new Error('The model catalog answered 502.'))
      .mockResolvedValue(catalog);
    const read = createModelCatalogCache({ fetchCatalog, now });

    await expect(read()).resolves.toBeUndefined();
    time += 1000;
    await expect(read()).resolves.toBeUndefined();
    expect(fetchCatalog).toHaveBeenCalledOnce();

    time += 30_000;
    await expect(read()).resolves.toEqual({ models: catalog, fetchedAt: time });
    expect(console.warn).toHaveBeenCalledWith('The model catalog prefetch failed: The model catalog answered 502.');
  });
});
