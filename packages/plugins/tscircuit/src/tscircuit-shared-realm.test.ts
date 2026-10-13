// @vitest-environment node
/**
 * tscircuit — two runtime clients in one JavaScript realm.
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
import { esbuildBundler } from '@taucad/esbuild';
import { tscircuitKernel } from '#tscircuit.kernel.js';

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

const moduleName = '@tscircuit/core';
const probeKey = '__tauRealmProbe';
const probes = (): Record<string, unknown> => {
  const realmGlobal = globalThis as Record<string, unknown>;
  realmGlobal[probeKey] ??= {};
  return realmGlobal[probeKey] as Record<string, unknown>;
};

/** A board that records the `@tscircuit/core` object its bundle imported under `tag`. */
const probeSource = (tag: string): string => `import tscircuitCore from '${moduleName}';
export default () => {
  const probes = ((globalThis as Record<string, unknown>)['${probeKey}'] ??= {}) as Record<string, unknown>;
  probes['${tag}'] = tscircuitCore;
  return <board width="10mm" height="10mm"><resistor name="R1" resistance="1k" footprint="0402" /></board>;
};
`;

const createClient = (files: Record<string, string>) =>
  createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [tscircuitKernel()], bundlers: [esbuildBundler()] }),
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

describe('tscircuit — two clients in one realm', { timeout: 120_000 }, () => {
  const clients: Array<ReturnType<typeof createClient>> = [];

  afterAll(async () => {
    await Promise.all(clients.map(async (client) => client.shutdown()));
    Reflect.deleteProperty(globalThis, probeKey);
  });

  it("should resolve client A's own built-in module in a bundle A executes after client B initialised", async () => {
    const clientA = createClient({ 'first.tsx': probeSource('a-first'), 'edited.tsx': probeSource('a-edited') });
    const clientB = createClient({ 'first.tsx': probeSource('b-first') });
    clients.push(clientA, clientB);

    await render(clientA, 'first.tsx');
    const exportsA = lastRegistered();
    await render(clientB, 'first.tsx');
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

    await render(clientA, 'edited.tsx');

    expect(owner(probes()['a-edited'])).toBe('client A');
  });
});
