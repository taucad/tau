import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { publicationKernelExtensions } from '#api/publications/publication-runtime.utils.js';

/*
 * `createCliRuntime` is the Tau CLI's composition, the runtime `tau export`, `tau test` and `@taucad/cli/geospec`'s
 * `tauExporter` serve. It is not a published subpath of `@taucad/cli`, so the parity test resolves it through the
 * package root the devDependency already provides. The API keeps its own table because it must not import plugin
 * packages at runtime — this test is what stops that table from drifting.
 */
const loadCliKernelExtensions = async (): Promise<Readonly<Record<string, readonly string[]>>> => {
  const requireFromHere = createRequire(import.meta.url);
  const cliRoot = dirname(requireFromHere.resolve('@taucad/cli/package.json'));
  const moduleUrl = pathToFileURL(resolve(cliRoot, 'src/cli-runtime.ts')).href;
  const { createCliRuntime } = (await import(/* @vite-ignore */ moduleUrl)) as {
    createCliRuntime: () => Promise<{
      readonly kernels: ReadonlyArray<{ readonly id: string; readonly extensions: readonly string[] }>;
    }>;
  };
  const runtime = await createCliRuntime();
  return Object.fromEntries(
    runtime.kernels
      .filter((kernel) => !cliOnlyKernelIds.has(kernel.id))
      .map((kernel) => [kernel.id, kernel.extensions]),
  );
};

/**
 * Native kernels the CLI lists, each binding a sealed closure from the local payload store; the hosted publication
 * runtime prepares no native closure, so it serves none of them.
 */
const cliOnlyKernelIds = new Set(['smlibpy', 'build123d', 'picogk']);

describe('publicationKernelExtensions parity', () => {
  it('matches the CLI runtime for every shared kernel', { timeout: 30_000 }, async () => {
    const cliExtensions = await loadCliKernelExtensions();

    const shared = Object.fromEntries(
      publicationKernelExtensions
        .filter((kernel) => kernel.id in cliExtensions)
        .map((kernel) => [kernel.id, [...kernel.extensions]]),
    );

    expect(shared).toEqual(
      Object.fromEntries(Object.entries(cliExtensions).map(([id, extensions]) => [id, [...extensions]])),
    );
  });

  it('declares exactly the CLI kernels the hosted runtime can serve', { timeout: 30_000 }, async () => {
    const cliExtensions = await loadCliKernelExtensions();

    expect(publicationKernelExtensions.map((kernel) => kernel.id).toSorted()).toEqual(
      Object.keys(cliExtensions).toSorted(),
    );
  });
});
