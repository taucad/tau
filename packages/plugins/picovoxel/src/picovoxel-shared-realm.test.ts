// @vitest-environment node
/**
 * PicoVoxel — two runtime clients in one JavaScript realm.
 *
 * `createTestRuntimeClient` builds its kernel worker in the caller's realm.
 * A bundle client A executes after client B initialised must still import the
 * built-in module objects client A registered (kernel-realm-shared-state
 * blueprint, WP-A5, invariant I3).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import type * as KernelModule from '@taucad/runtime/kernel';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuild } from '@taucad/esbuild';
import { picovoxel } from '#index.js';

const registrations = vi.hoisted(() => [] as Array<{ name: string; exports: Record<string, unknown> }>);

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof KernelModule>();
  return {
    ...actual,
    registerKernelModule(...arguments_: Parameters<typeof actual.registerKernelModule>) {
      registrations.push({ name: arguments_[1].name, exports: arguments_[1].exports });
      actual.registerKernelModule(...arguments_);
    },
  };
});

const moduleName = 'picovoxel';
const probeKey = '__tauRealmProbe';
const probes = (): Record<string, unknown> => {
  const realmGlobal = globalThis as Record<string, unknown>;
  realmGlobal[probeKey] ??= {};
  return realmGlobal[probeKey] as Record<string, unknown>;
};

/** A model that records the `picovoxel` object its bundle imported under `tag`. */
const probeSource = (tag: string): string => `import picovoxel from '${moduleName}';
import type { Pico, Voxels } from '${moduleName}';
export const defaultParams = { voxelSize: 1 };
export default function main(pico: Pico): Voxels {
  const probes = ((globalThis as Record<string, unknown>)['${probeKey}'] ??= {}) as Record<string, unknown>;
  probes['${tag}'] = picovoxel;
  return pico.createVoxels({ shape: 'sphere', radius: 4 });
}
`;

const createClient = (files: Record<string, string>) =>
  createTestRuntimeClient({
    runtime: defineRuntime({ plugins: [picovoxel({ kernels: { default: { wasm: 'serial' } } }), esbuild()] }),
    files,
  });

const render = async (client: ReturnType<typeof createClient>, path: string): Promise<void> => {
  const document = client.open({ source: { path }, watch: false });
  const view = document.view();
  try {
    const outcome = await view.rendering();
    if (outcome.superseded || !outcome.rendering.success) {
      expect.fail(`render ${path}: ${JSON.stringify(outcome)}`);
    }
  } finally {
    view.close();
    document.close();
  }
};

/** The exports object the most recent registration of `moduleName` supplied. */
const lastRegistered = (): Record<string, unknown> | undefined =>
  registrations.findLast((registration) => registration.name === moduleName)?.exports;

describe('PicoVoxel — two clients in one realm', { timeout: 120_000 }, () => {
  const clients: Array<ReturnType<typeof createClient>> = [];

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.shutdown()));
    Reflect.deleteProperty(globalThis, probeKey);
  });

  it("should resolve client A's own built-in module in a bundle A executes after client B initialised", async () => {
    const clientA = createClient({ 'first.ts': probeSource('a-first'), 'edited.ts': probeSource('a-edited') });
    const clientB = createClient({ 'first.ts': probeSource('b-first') });
    clients.push(clientA, clientB);

    await render(clientA, 'first.ts');
    const exportsA = lastRegistered();
    await render(clientB, 'first.ts');
    const exportsB = lastRegistered();

    // Labels keep failures readable: these module objects do not pretty-print.
    const owner = (value: unknown): string => {
      if (value === undefined) {
        return 'none';
      }
      if (value === exportsA) {
        return 'client A';
      }
      return value === exportsB ? 'client B' : 'another object';
    };

    // Preconditions: each client registered its own object, and each first bundle saw its own.
    expect(exportsA).toBeDefined();
    expect(owner(exportsB)).toBe('client B');
    expect(owner(probes()['a-first'])).toBe('client A');
    expect(owner(probes()['b-first'])).toBe('client B');

    await render(clientA, 'edited.ts');

    expect(owner(probes()['a-edited'])).toBe('client A');
  });
});
