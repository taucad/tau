import { describe, expect, it } from 'vitest';

import { digestContent } from '#digest.js';
import { createMemoryActionStore, createMemoryContentStore } from '#memory-store.js';
import { unsupportedCacheMaintenance } from '#store.js';
import { createTieredActionStore, createTieredContentStore } from '#tiered-store.js';
import { runActionStoreConformance, runContentStoreConformance } from '#testing.js';
import type { ContentStore } from '#store.js';

describe('tiered stores', () => {
  it('passes store conformance with opportunistic memory and required backing tiers', async () => {
    await runContentStoreConformance({
      createStore: () =>
        createTieredContentStore({
          tiers: [
            { store: createMemoryContentStore({ maxBytes: 4096 }), required: false },
            { store: createMemoryContentStore({ maxBytes: 4096 }), required: true },
          ],
        }),
    });
    await runActionStoreConformance({
      createStore: () =>
        createTieredActionStore({
          tiers: [
            { store: createMemoryActionStore({ maxBytes: 4096 }), required: false },
            { store: createMemoryActionStore({ maxBytes: 4096 }), required: true },
          ],
        }),
    });
  });

  it('warms a faster content tier after a backing-tier hit', async () => {
    const memory = createMemoryContentStore({ maxBytes: 4096 });
    const backing = createMemoryContentStore({ maxBytes: 4096 });
    const store = createTieredContentStore({
      tiers: [
        { store: memory, required: false },
        { store: backing, required: true },
      ],
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const digest = await digestContent({ bytes });
    await backing.write({ digest, bytes });

    await expect(store.read({ digest })).resolves.toMatchObject({ status: 'hit' });
    await backing.maintenance.clear({});
    await expect(store.read({ digest })).resolves.toMatchObject({ status: 'hit' });
  });

  it('fails publication when a required tier fails even if memory accepted the content', async () => {
    const failing: ContentStore = {
      read: async () => ({ status: 'miss' }),
      write: async () => {
        throw new Error('unavailable');
      },
      maintenance: unsupportedCacheMaintenance,
    };
    const store = createTieredContentStore({
      tiers: [
        { store: createMemoryContentStore({ maxBytes: 4096 }), required: false },
        { store: failing, required: true },
      ],
    });
    const bytes = new Uint8Array([1]);
    const digest = await digestContent({ bytes });

    await expect(store.write({ digest, bytes })).rejects.toThrow('Required content tiers');
  });
});
