// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { tscircuitKernel } from '#tscircuit.kernel.js';

vi.setConfig({ testTimeout: 60_000 });

/** Manifest of the package this plugin resolves for a bare import of `name`. */
const readInstalled = async (name: string): Promise<{ name: string; version: string }> =>
  JSON.parse(await readFile(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')) as {
    name: string;
    version: string;
  };

describe('tscircuit package identity', () => {
  it('declares the installed engine packages, with tscircuit as an alias of @tscircuit/core', async () => {
    const [core, props, react] = await Promise.all(
      ['@tscircuit/core', '@tscircuit/props', 'react'].map(async (name) => readInstalled(name)),
    );
    const definition = await resolveRuntimePluginDefinition('kernel', tscircuitKernel());
    const runtime = createMockKernelRuntime();
    const registerModule = vi.spyOn(runtime.bundler, 'registerModule');

    await definition.initialize({}, runtime);

    expect(tscircuitKernel().builtinDependencies).toEqual({
      tscircuit: `npm:${core!.name}@${core!.version}`,
      '@tscircuit/core': core!.version,
      '@tscircuit/props': props!.version,
      react: react!.version,
    });
    expect(Object.fromEntries(registerModule.mock.calls.map(([name, entry]) => [name, entry.package]))).toEqual({
      react: { name: 'react', spec: react!.version },
      'react/jsx-runtime': { name: 'react', spec: react!.version },
      '@tscircuit/core': { name: '@tscircuit/core', spec: core!.version },
      tscircuit: { name: 'tscircuit', spec: `npm:${core!.name}@${core!.version}` },
      '@tscircuit/props': { name: '@tscircuit/props', spec: props!.version },
    });
  });
});
