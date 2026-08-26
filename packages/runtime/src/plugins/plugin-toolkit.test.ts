import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { BundlerPlugin, KernelPlugin, MiddlewarePlugin, TranscoderPlugin } from '#plugins/plugin-types.js';
import { definePlugin, isPluginFactory } from '#plugins/plugin.js';
import type { PluginFactory } from '#plugins/plugin.js';
import { attachRuntimePluginFactoryOptions } from '#plugins/plugin-runtime-definition.js';
import { defineRuntime, resolveRuntimeDefinition } from '#worker/runtime-definition.js';

const defineUncheckedPlugin = definePlugin as unknown as (definition: unknown) => PluginFactory;
const defineUncheckedRuntime = defineRuntime as unknown as (options: {
  readonly plugins: readonly unknown[];
}) => unknown;

const alphaKernel = (): KernelPlugin<Record<never, never>, unknown, 'alpha'> => ({
  id: 'alpha',
  extensions: ['alpha'],
});
const noOptionsAlphaKernel = attachRuntimePluginFactoryOptions(alphaKernel, false);
const betaKernel = (): KernelPlugin<Record<never, never>, unknown, 'beta'> => ({
  id: 'beta',
  extensions: ['beta'],
});
const directKernel = (): KernelPlugin<Record<never, never>, unknown, 'direct'> => ({
  id: 'direct',
  extensions: ['direct'],
});
const cacheMiddleware = (): MiddlewarePlugin<'cache'> => ({ id: 'cache' });
const testBundler = (): BundlerPlugin<'test-bundler'> => ({ id: 'test-bundler', extensions: ['ts'] });
const meshTranscoder = (): TranscoderPlugin<Record<never, never>, 'glb', 'mesh'> => ({ id: 'mesh' });
const configuredKernel = vi.fn((options?: { readonly mode?: 'fast' | 'exact' }) => ({
  id: 'configured',
  extensions: ['cfg'],
  options,
}));
const configuredTranscoder = vi.fn((options?: { readonly quality?: number }) => ({
  id: 'configured-transcoder',
  options,
}));

const toolkit = definePlugin({
  meta: { name: '@test/toolkit' },
  kernels: { alpha: noOptionsAlphaKernel, beta: betaKernel },
  middleware: { cache: cacheMiddleware },
  bundlers: { test: testBundler },
  transcoders: { mesh: meshTranscoder },
  presets: {
    default: ['kernels.beta', 'middleware.cache', 'kernels.alpha', 'bundlers.test'],
    export: ['transcoders.mesh'],
  },
});

const configurableToolkit = definePlugin({
  meta: { name: '@test/configurable' },
  kernels: { default: configuredKernel },
  transcoders: { export: configuredTranscoder },
  presets: {
    default: ['kernels.default'],
    export: ['transcoders.export'],
  },
});

describe('definePlugin', () => {
  it('expands presets deterministically before direct capability buckets', () => {
    const runtime = defineRuntime({
      plugins: [toolkit()],
      kernels: [directKernel()],
      middleware: [{ id: 'direct-middleware' }],
    });

    expect(runtime.kernels.map(({ id }) => id)).toEqual(['beta', 'alpha', 'direct']);
    expect(runtime.middleware.map(({ id }) => id)).toEqual(['cache', 'direct-middleware']);
    expect(runtime.bundlers.map(({ id }) => id)).toEqual(['test-bundler']);
    expect(runtime.transcoders).toEqual([]);
  });

  it('selects a non-default preset without rewriting flat capability ids', () => {
    const runtime = defineRuntime({ plugins: [toolkit({ preset: 'export' })] });

    expect(runtime.transcoders.map(({ id }) => id)).toEqual(['mesh']);
  });

  it('forwards role-nested options only to selected capability factories', () => {
    configuredKernel.mockClear();
    configuredTranscoder.mockClear();

    const defaultPlugin = configurableToolkit({ kernels: { default: { mode: 'exact' } } });
    const exportPlugin = configurableToolkit({
      preset: 'export',
      transcoders: { export: { quality: 75 } },
    });

    expect(configuredKernel).toHaveBeenCalledWith({ mode: 'exact' });
    expect(configuredTranscoder).toHaveBeenCalledWith({ quality: 75 });
    expect(defaultPlugin.capabilities.kernels[0].options).toEqual({ mode: 'exact' });
    expect(exportPlugin.capabilities.transcoders[0].options).toEqual({ quality: 75 });
  });

  it('rejects unknown, missing, and unselected option paths before expansion', () => {
    const invokeUnchecked = configurableToolkit as unknown as (options: unknown) => unknown;

    expect(() => invokeUnchecked({ kernel: { default: {} } })).toThrow(
      '@test/configurable received unknown plugin option "kernel".',
    );
    expect(() => invokeUnchecked({ kernels: { missing: {} } })).toThrow(
      '@test/configurable preset "default" received options for missing capability "kernels.missing".',
    );
    expect(() => invokeUnchecked({ transcoders: { export: {} } })).toThrow(
      '@test/configurable preset "default" received options for unselected capability "transcoders.export".',
    );
    const invokeToolkitUnchecked = toolkit as unknown as (options: unknown) => unknown;
    expect(() => invokeToolkitUnchecked({ kernels: { alpha: {} } })).toThrow(
      '@test/toolkit preset "default" capability "kernels.alpha" does not accept options.',
    );
  });

  it('recognizes only branded callable factories with package identity', () => {
    expect(isPluginFactory(configurableToolkit)).toBe(true);
    expect(isPluginFactory(Object.assign(() => undefined, { meta: { name: '@test/incomplete' } }))).toBe(false);
    expect(isPluginFactory({ meta: configurableToolkit.meta })).toBe(false);
  });

  it('normalizes config-backed plugin runtimes', async () => {
    const runtime = defineRuntime({
      configSchema: z.object({}),
      createRuntime: async () => ({ plugins: [toolkit()] }),
    });

    const resolved = await resolveRuntimeDefinition(runtime, {});
    expect(resolved.kernels.map(({ id }) => id)).toEqual(['beta', 'alpha']);
  });

  it('diagnoses duplicate ids with both plugin origins', () => {
    const duplicate = definePlugin({
      meta: { name: '@test/duplicate' },
      kernels: { alpha: alphaKernel },
      presets: { default: ['kernels.alpha'] },
    });

    expect(() => defineRuntime({ plugins: [toolkit(), duplicate()] })).toThrow(
      'Duplicate runtime kernels id "alpha": first supplied by @test/toolkit (path "@test/toolkit/kernels.alpha"); second supplied by @test/duplicate (path "@test/duplicate/kernels.alpha").',
    );
  });

  it('diagnoses collisions between plugins and direct buckets', () => {
    expect(() => defineRuntime({ plugins: [toolkit()], kernels: [betaKernel()] })).toThrow(
      'Duplicate runtime kernels id "beta": first supplied by @test/toolkit (path "@test/toolkit/kernels.beta"); second supplied by <host> (path "direct.kernels").',
    );
  });

  it('diagnoses invalid preset entries and uninvoked factories', () => {
    const unknownKind = defineUncheckedPlugin({
      meta: { name: '@test/invalid' },
      presets: { default: ['unknown.value'] },
    });
    const missingCapability = defineUncheckedPlugin({
      meta: { name: '@test/missing' },
      presets: { default: ['kernels.absent'] },
    });

    expect(() => unknownKind()).toThrow(
      '@test/invalid preset "default" contains unknown capability kind in "unknown.value".',
    );
    expect(() => missingCapability()).toThrow(
      '@test/missing preset "default" references missing capability "kernels.absent".',
    );
    expect(() => defineUncheckedRuntime({ plugins: [toolkit] })).toThrow(
      'Tau plugin factory "@test/toolkit" was passed to defineRuntime({ plugins }); invoke it as plugin().',
    );
    expect(() => defineUncheckedRuntime({ plugins: [alphaKernel()] })).toThrow(
      'defineRuntime({ plugins }) accepts invoked Tau plugin factories such as plugin(), not individual capabilities; put invoked capability factories in kernels, middleware, bundlers, or transcoders.',
    );
  });
});
