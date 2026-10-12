// @vitest-environment node
/**
 * Manifold — two runtime clients in one JavaScript realm.
 *
 * `createTestRuntimeClient` builds its kernel worker in the caller's realm.
 * A bundle client A executes after client B initialised must still import the
 * built-in module objects client A registered (kernel-realm-shared-state
 * blueprint, WP-A5, invariant I3).
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import type * as KernelModule from '@taucad/runtime/kernel';
import { createTestRuntimeClient, extractGltfFromExportResult, getSignedVolumeFromGlb } from '@taucad/runtime-testing';
import { defineRuntime } from '@taucad/runtime/worker';
import { esbuildBundler } from '@taucad/esbuild';
import { manifoldKernel } from '#manifold.kernel.js';

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

const moduleName = 'manifold-3d/manifoldCAD';
const probeKey = '__tauRealmProbe';
const probes = (): Record<string, unknown> => {
  const realmGlobal = globalThis as Record<string, unknown>;
  realmGlobal[probeKey] ??= {};
  return realmGlobal[probeKey] as Record<string, unknown>;
};

/** A model that records the `manifold-3d/manifoldCAD` object its bundle imported under `tag`. */
const probeSource = (tag: string): string => `import manifoldCad, { Manifold } from '${moduleName}';
export default function main() {
  const probes = ((globalThis as Record<string, unknown>)['${probeKey}'] ??= {}) as Record<string, unknown>;
  probes['${tag}'] = manifoldCad;
  return Manifold.cube([10, 10, 10], true);
}
`;

const createClient = (files: Record<string, string>) =>
  createTestRuntimeClient({
    runtime: defineRuntime({ kernels: [manifoldKernel()], bundlers: [esbuildBundler()] }),
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

describe('Manifold — two clients in one realm', { timeout: 120_000 }, () => {
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

  it('should render and export concurrent models from two clients in one realm', async () => {
    // The model holds a live Manifold across an await, so the other client's evaluation runs in between.
    const pausedCube = (size: number): string => `import { Manifold } from '${moduleName}';
export default async function main() {
  const cube = Manifold.cube([${size}, ${size}, ${size}], true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return cube.add(Manifold.cube([1, 1, 1]).translate([${size}, 0, 0]));
}
`;
    const rounds = [0, 1, 2];
    const sizes = { a: 10, b: 12 } as const;
    const files = (size: number): Record<string, string> =>
      Object.fromEntries(rounds.map((round) => [`round-${round}.ts`, pausedCube(size + round)]));
    const clientA = createClient(files(sizes.a));
    const clientB = createClient(files(sizes.b));
    clients.push(clientA, clientB);

    const renderAndExport = async (client: ReturnType<typeof createClient>, path: string): Promise<number> => {
      const document = client.open({ source: { path }, watch: false });
      const view = document.view();
      try {
        const outcome = await view.rendering();
        if (outcome.superseded || !outcome.rendering.success) {
          expect.fail(`render ${path}: ${JSON.stringify(outcome)}`);
        }
        const glb = extractGltfFromExportResult(await document.export('glb'));
        expect(glb, `export ${path}`).toBeDefined();
        return await getSignedVolumeFromGlb(glb!);
      } finally {
        view.close();
        document.close();
      }
    };

    for (const round of rounds) {
      const path = `round-${round}.ts`;
      // oxlint-disable-next-line no-await-in-loop -- each round races the two clients against each other.
      const [volumeA, volumeB] = await Promise.all([renderAndExport(clientA, path), renderAndExport(clientB, path)]);
      // Each model is a centred cube plus a disjoint unit cube.
      expect(volumeA, `client A ${path}`).toBeCloseTo((sizes.a + round) ** 3 + 1, 1);
      expect(volumeB, `client B ${path}`).toBeCloseTo((sizes.b + round) ** 3 + 1, 1);
    }
  });
});
