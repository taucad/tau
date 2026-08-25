import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicationKernelExtensions } from '#api/publications/publication-runtime.utils.js';

/*
 * `defaultRuntime` is the engine's own composition, not a published subpath of
 * `@taucad/geospec-engine`, so the parity test resolves it through the package root the
 * devDependency already provides. The API keeps its own table because it must not import
 * plugin packages at runtime — this test is what stops that table from drifting.
 */
const loadEngineKernelExtensions = async (): Promise<Readonly<Record<string, readonly string[]>>> => {
  const requireFromHere = createRequire(import.meta.url);
  const engineRoot = dirname(requireFromHere.resolve('@taucad/geospec-engine/package.json'));
  const moduleUrl = pathToFileURL(resolve(engineRoot, 'src/model/default-runtime.ts')).href;
  const { defaultRuntime } = (await import(/* @vite-ignore */ moduleUrl)) as {
    defaultRuntime: {
      readonly kernels: ReadonlyArray<{ readonly id: string; readonly extensions: readonly string[] }>;
    };
  };
  return Object.fromEntries(defaultRuntime.kernels.map((kernel) => [kernel.id, kernel.extensions]));
};

/** Kernels the hosted publication runtime serves that the engine's default plugin set omits. */
const publicationOnlyKernelIds = ['openrscad', 'zoo'];

describe('publicationKernelExtensions parity', () => {
  it('matches the engine default runtime for every shared kernel', { timeout: 30_000 }, async () => {
    const engineExtensions = await loadEngineKernelExtensions();

    const shared = Object.fromEntries(
      publicationKernelExtensions
        .filter((kernel) => kernel.id in engineExtensions)
        .map((kernel) => [kernel.id, [...kernel.extensions]]),
    );

    expect(shared).toEqual(
      Object.fromEntries(Object.entries(engineExtensions).map(([id, extensions]) => [id, [...extensions]])),
    );
  });

  it('declares exactly the engine kernels plus the publication-only ones', async () => {
    const engineExtensions = await loadEngineKernelExtensions();

    expect(publicationKernelExtensions.map((kernel) => kernel.id).toSorted()).toEqual(
      [...Object.keys(engineExtensions), ...publicationOnlyKernelIds].toSorted(),
    );
  });
});
