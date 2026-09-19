import { describe, expect, it, vi } from 'vitest';
import type { ConverterRuntimeClient } from '#routes/convert/converter-runtime.definition.js';
import { beginConverterOperation, createActiveConverterClient } from '#routes/convert/converter-client-lifecycle.js';

describe('createActiveConverterClient', () => {
  it('terminates a client whose owner unmounted while creation was pending', async () => {
    const pending = Promise.withResolvers<ConverterRuntimeClient>();
    const terminate = vi.fn();
    let active = true;
    const result = createActiveConverterClient(
      async () => pending.promise,
      () => active,
    );

    active = false;
    pending.resolve({ terminate } as unknown as ConverterRuntimeClient);

    await expect(result).resolves.toBeUndefined();
    expect(terminate).toHaveBeenCalledOnce();
  });
});

it('only lets the latest overlapping converter operation publish or clear busy state', async () => {
  const generation = { current: 0 };
  const first = beginConverterOperation(generation);
  const deferred = Promise.withResolvers<void>();
  const firstCompletion = (async () => {
    await deferred.promise;
    return first();
  })();
  const second = beginConverterOperation(generation);

  deferred.resolve();
  await expect(firstCompletion).resolves.toBe(false);
  expect(second()).toBe(true);
});

it('invalidates a deferred converter operation when its owner unmounts', async () => {
  const generation = { current: 0 };
  const operation = beginConverterOperation(generation);
  const deferred = Promise.withResolvers<void>();
  const completion = (async () => {
    await deferred.promise;
    return operation();
  })();

  generation.current += 1;
  deferred.resolve();
  await expect(completion).resolves.toBe(false);
});
