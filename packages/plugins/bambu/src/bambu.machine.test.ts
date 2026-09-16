import { describe, expect, it, vi } from 'vitest';

import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

const loaded = vi.hoisted(() => ({ count: 0 }));
vi.mock('#bambu.host.js', () => {
  loaded.count += 1;
  return {
    async *discoverBambuMachines() {
      yield* [];
    },
  };
});

describe('bambuMachine', () => {
  it('should keep host dependencies lazy until an explicit operation', async () => {
    const { bambuMachine } = await import('#bambu.machine.js');
    expect(loaded.count).toBe(0);
    const registration = bambuMachine();
    expect(() => structuredClone(registration)).not.toThrow();
    expect(JSON.stringify(registration)).not.toMatch(/mqtt|ftp|secret|certificate/iu);
    const definition = await resolveRuntimePluginDefinition('machine', registration);
    const iterator = definition
      .discover(
        {
          configuration: { logicalId: 'workshop-x1c' },
          signal: new AbortController().signal,
        },
        {
          clock: { now: () => '2026-09-14T00:00:00.000Z' },
          async *listenDatagrams() {
            yield* [];
          },
        },
      )
      [Symbol.asyncIterator]();
    await iterator.next();
    expect(loaded.count).toBe(1);
  });
});
