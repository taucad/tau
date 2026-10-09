// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { manifoldKernel } from '#manifold.kernel.js';

// Initialising the WebAssembly module takes seconds on a loaded host.
vi.setConfig({ testTimeout: 60_000 });

/** Manifest of the package this plugin resolves for `import 'manifold-3d'`. */
const readInstalledManifold = async (): Promise<{ name: string; version: string }> =>
  JSON.parse(await readFile(new URL('../node_modules/manifold-3d/package.json', import.meta.url), 'utf8')) as {
    name: string;
    version: string;
  };

describe('manifold package identity', () => {
  it('declares the installed upstream package by plain version for the root and subpath modules', async () => {
    const installed = await readInstalledManifold();
    const definition = await resolveRuntimePluginDefinition('kernel', manifoldKernel());
    const runtime = createMockKernelRuntime();
    const registerModule = vi.spyOn(runtime.bundler, 'registerModule');

    await definition.initialize({}, runtime);

    expect(installed.name).toBe('manifold-3d');
    expect(manifoldKernel().builtinDependencies).toEqual({ 'manifold-3d': installed.version });
    expect(registerModule.mock.calls.map(([name, entry]) => [name, entry.package])).toEqual([
      ['manifold-3d', { name: 'manifold-3d', spec: installed.version }],
      ['manifold-3d/manifoldCAD', { name: 'manifold-3d', spec: installed.version }],
    ]);
  });
});
