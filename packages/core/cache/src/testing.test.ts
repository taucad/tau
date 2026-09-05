import { describe, expect, it } from 'vitest';

import { CacheCorruptionError } from '#errors.js';
import { createMemoryActionStore, createMemoryContentStore } from '#memory-store.js';
import {
  runActionStoreConformance,
  runCacheCodecConformance,
  runContentStoreConformance,
  runOwnerScopedStoreConformance,
} from '#testing.js';
import type { OwnerScopedComputeStores } from '#testing.js';

describe('@taucad/cache-core/testing', () => {
  it('accepts the memory content store', async () => {
    await expect(
      runContentStoreConformance({ createStore: () => createMemoryContentStore({ maxBytes: 4096 }) }),
    ).resolves.toBeUndefined();
  });

  it('accepts the memory action store', async () => {
    await expect(
      runActionStoreConformance({ createStore: () => createMemoryActionStore({ maxBytes: 4096 }) }),
    ).resolves.toBeUndefined();
  });

  it('accepts a deterministic round-trip codec', async () => {
    await expect(
      runCacheCodecConformance({
        codec: {
          id: 'text',
          version: '1',
          mediaType: 'text/plain',
          encode: ({ value }: { readonly value: string }) => new TextEncoder().encode(value),
          decode: ({ bytes }) => new TextDecoder().decode(bytes),
        },
        samples: ['', 'geometry'],
        equal: ({ actual, expected }) => actual === expected,
      }),
    ).resolves.toBeUndefined();
  });

  it('accepts transactional stores scoped outside cache identity', async () => {
    const createScope = (): OwnerScopedComputeStores => {
      const contentStore = createMemoryContentStore({ maxBytes: 4096 });
      const backingActions = createMemoryActionStore({ maxBytes: 4096 });
      return {
        contentStore,
        actionStore: {
          ...backingActions,
          async publish({ record, signal }) {
            const content = await contentStore.read({ digest: record.output.digest, signal });
            if (content.status !== 'hit') {
              throw new CacheCorruptionError('The owner does not have the referenced content.');
            }
            return backingActions.publish({ record, signal });
          },
        },
      };
    };
    const primary = createScope();
    const otherOwner = createScope();

    await expect(
      runOwnerScopedStoreConformance({
        createStores: () => ({ primary, sameOwner: primary, otherOwner }),
      }),
    ).resolves.toBeUndefined();
  });
});
