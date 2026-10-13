// @vitest-environment node
/**
 * JSCAD — built-in module resolution in a shared JavaScript realm.
 *
 * `createTestRuntimeClient` builds its kernel worker in the caller's realm.
 * A bundle client A executes after client B initialised must still import the
 * `@jscad/modeling` object client A registered, and a two-argument `main`
 * receives `@jscad/modeling` whatever else the realm registered first
 * (kernel-realm-shared-state blueprint, WP-A5, invariant I3).
 */
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type * as KernelModule from '@taucad/runtime/kernel';
import {
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  registerKernelModule,
} from '@taucad/runtime/kernel';
import { createTestRuntimeClient } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import { jscadKernel } from '#jscad.kernel.js';

const registry = vi.hoisted(() => ({
  registrations: [] as Array<{ name: string; exports: Record<string, unknown> }>,
  /** Register a fresh copy per call, so two clients' `@jscad/modeling` objects differ. */
  cloneExports: false,
}));

vi.mock('@taucad/runtime/kernel', async (importOriginal) => {
  const actual = await importOriginal<typeof KernelModule>();
  return {
    ...actual,
    registerKernelModule(...[services, options]: Parameters<typeof actual.registerKernelModule>) {
      const exports = registry.cloneExports ? { ...options.exports } : options.exports;
      registry.registrations.push({ name: options.name, exports });
      actual.registerKernelModule(services, { ...options, exports });
    },
  };
});

const moduleName = '@jscad/modeling';
const probeKey = '__tauRealmProbe';
const probes = (): Record<string, unknown> => {
  const realmGlobal = globalThis as Record<string, unknown>;
  realmGlobal[probeKey] ??= {};
  return realmGlobal[probeKey] as Record<string, unknown>;
};

/** A model that records the `@jscad/modeling` object its bundle imported under `tag`. */
const importProbeSource = (tag: string): string => `import modeling from '${moduleName}';
export default function main() {
  const probes = ((globalThis as Record<string, unknown>)['${probeKey}'] ??= {}) as Record<string, unknown>;
  probes['${tag}'] = modeling;
  return modeling.primitives.cuboid({ size: [10, 10, 10] });
}
`;

/** A model whose only route to the library is `main`'s first argument (the type import is erased). */
const injectedProbeSource = (tag: string): string => `import type * as Modeling from '${moduleName}';
export default function main(modeling: typeof Modeling, _params: unknown) {
  const probes = ((globalThis as Record<string, unknown>)['${probeKey}'] ??= {}) as Record<string, unknown>;
  probes['${tag}'] = modeling;
  return modeling.primitives.cuboid({ size: [10, 10, 10] });
}
`;

/** A kernel that registers its own built-in module when it initialises. */
const otherKernel = defineKernel({
  id: 'realm-other',
  extensions: ['other'],
  name: 'Realm neighbour',
  version: '1.0.0',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {},
  initialize: async (_options, runtime) => {
    registerKernelModule(runtime, { name: 'realm-other-library', exports: { other: true }, version: '1.0.0' });
    return {};
  },
  resolve: async () => ({ resolved: [], unresolved: [] }),
  describe: async () =>
    createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {} },
        { id: 'urn:taucad:test:realm-other', name: 'RealmOtherParameters' },
      ),
    }),
  evaluate: async () => ({ handle: new Uint8Array([1]) }),
  render: async ({ handle }) => ({ content: handle }),
});

const createClient = (
  files: Record<string, string>,
  kernels: Array<ReturnType<typeof jscadKernel> | ReturnType<typeof otherKernel>> = [jscadKernel()],
) => createTestRuntimeClient({ runtime: defineRuntime({ kernels, bundlers: [esbuildBundler()] }), files });

type Client = ReturnType<typeof createClient>;

const clients: Client[] = [];

const render = async (client: Pick<Client, 'open'>, path: string): Promise<void> => {
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

/** The exports object the most recent registration of `@jscad/modeling` supplied. */
const lastRegistered = (): Record<string, unknown> | undefined =>
  registry.registrations.findLast((registration) => registration.name === moduleName)?.exports;

afterEach(async () => {
  registry.cloneExports = false;
  await Promise.all(clients.splice(0).map(async (client) => client.shutdown()));
});

afterAll(() => {
  Reflect.deleteProperty(globalThis, probeKey);
});

// Runs first: the realm's registry must not already hold `@jscad/modeling` from another test.
describe('JSCAD — two-argument main', { timeout: 120_000 }, () => {
  it('should pass @jscad/modeling to main when another kernel registered a module first', async () => {
    const client = createClient({ 'neighbour.other': '', 'main.ts': injectedProbeSource('injected') }, [
      otherKernel(),
      jscadKernel(),
    ]);
    clients.push(client);

    // The other kernel initialises first and registers its module before JSCAD's.
    const neighbour = client.open({ source: { path: 'neighbour.other' }, watch: false });
    const evaluation = await neighbour.evaluation();
    neighbour.close();
    expect(evaluation.superseded).toBe(false);
    expect(registry.registrations.map(({ name }) => name)).toContain('realm-other-library');

    await render(client, 'main.ts');

    expect(probes()['injected'] === lastRegistered(), 'main received the registered @jscad/modeling').toBe(true);
  });
});

describe('JSCAD — two clients in one realm', { timeout: 120_000 }, () => {
  it("should resolve client A's own @jscad/modeling in a bundle A executes after client B initialised", async () => {
    registry.cloneExports = true;
    const clientA = createClient({
      'first.ts': importProbeSource('a-first'),
      'edited.ts': importProbeSource('a-edited'),
    });
    const clientB = createClient({ 'first.ts': importProbeSource('b-first') });
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
