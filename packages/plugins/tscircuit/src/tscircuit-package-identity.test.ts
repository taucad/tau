// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { createMockKernelRuntime } from '@taucad/runtime-testing';
import { resolveRuntimePluginDefinition } from '@taucad/runtime/plugin';

import { tscircuitKernel } from '#tscircuit.kernel.js';

vi.setConfig({ testTimeout: 60_000 });

/** Manifest of the package this plugin resolves for a bare import of `name`. */
const readInstalled = async (
  name: string,
): Promise<{ name: string; version: string; peerDependencies?: Record<string, string> }> =>
  JSON.parse(
    await readFile(
      new URL(
        name === 'typescript'
          ? '../../../../node_modules/typescript/package.json'
          : `../node_modules/${name}/package.json`,
        import.meta.url,
      ),
      'utf8',
    ),
  ) as {
    name: string;
    version: string;
    peerDependencies?: Record<string, string>;
  };

const additionalRuntimePackages = [
  '@tscircuit/soup-util',
  'connectivity-map',
  '@tscircuit/copper-pour-solver',
  '@tscircuit/image-utils',
  '@tscircuit/infer-cable-insertion-point',
  '@tscircuit/miniflex',
  '@tscircuit/schematic-trace-solver',
  '@tscircuit/solver-utils',
  'calculate-elbow',
  'graphics-debug',
  'minicssgrid',
  'spicey',
];

describe('tscircuit package identity', () => {
  it('should pin every required engine peer to the installed project version', async () => {
    const core = await readInstalled('@tscircuit/core');
    const dependencies = tscircuitKernel().builtinDependencies;
    await Promise.all(
      [...Object.keys(core.peerDependencies ?? {}), ...additionalRuntimePackages].map(async (name) => {
        const installed = await readInstalled(name);
        expect(dependencies?.[name], name).toBe(installed.version);
        expect(dependencies?.[name], name).toMatch(/^\d+\.\d+\.\d+$/);
      }),
    );
  });

  it('declares the installed engine packages, with tscircuit as an alias of @tscircuit/core', async () => {
    const [core, props, react] = await Promise.all(
      ['@tscircuit/core', '@tscircuit/props', 'react'].map(async (name) => readInstalled(name)),
    );
    const definition = await resolveRuntimePluginDefinition('kernel', tscircuitKernel());
    const runtime = createMockKernelRuntime();
    const registerModule = vi.spyOn(runtime.bundler, 'registerModule');

    await definition.initialize({}, runtime);

    const peers = Object.fromEntries(
      await Promise.all(
        [...Object.keys(core!.peerDependencies ?? {}), ...additionalRuntimePackages].map(
          async (name): Promise<readonly [string, string]> => {
            const installed = await readInstalled(name);
            return [name, installed.version];
          },
        ),
      ),
    );
    expect(tscircuitKernel().builtinDependencies).toEqual({
      ...peers,
      tscircuit: `npm:${core!.name}@${core!.version}`,
      '@tscircuit/core': core!.version,
      '@tscircuit/props': props!.version,
      react: react!.version,
      'react-dom': react!.version,
      '@biomejs/biome': '2.5.15',
      debug: '4.4.3',
      flatbush: '4.6.2',
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
