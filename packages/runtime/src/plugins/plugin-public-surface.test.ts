import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineMiddleware } from '#plugins/middleware-entry.js';
import { defineBundler } from '#types/runtime-bundler.types.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { resolveRuntimePluginDefinition } from '#plugins/plugin-runtime-definition.js';

describe('plugin factory public surface', () => {
  it('keeps implementation details hidden on one-call plugin registrations', async () => {
    const permissions = {
      network: ['https://plugins.example.test'],
      filesystemWrite: true,
    } as const;
    const kernel = defineKernelV2({
      id: 'kernel',
      extensions: ['ts'],
      permissions,
      name: 'KernelDefinition',
      version: '1.0.0',
      views: {
        model: {
          title: 'Model',
          mimeType: 'model/gltf+json',
          optionsSchema: z.object({ detail: z.number().default(1) }),
        },
      },
      exports: {},
      async initialize() {
        return {};
      },
      async resolve() {
        return { resolved: [], unresolved: [] };
      },
      async describe() {
        return { success: false, issues: [] };
      },
      async evaluate() {
        return { handle: {}, views: ['model'] as const };
      },
      async render() {
        return { content: new Uint8Array([1]) };
      },
    });

    const middleware = defineMiddleware({
      id: 'middleware',
      permissions,
      name: 'MiddlewareDefinition',
      version: '1.0.0',
      async wrapDescribe(input, handler) {
        return handler(input);
      },
    });

    const bundler = defineBundler({
      id: 'bundler',
      extensions: ['ts'],
      permissions,
      name: 'BundlerDefinition',
      version: '1.0.0',
      async initialize() {
        return {};
      },
      async detectImports() {
        return { detectedModules: [], dependencies: [] };
      },
      async bundle() {
        return {
          code: '',
          issues: [],
          success: true,
          dependencies: [],
          unresolvedPaths: [],
        };
      },
      async execute() {
        return { success: true, value: undefined };
      },
      registerModule() {
        throw new Error('registerModule is not used by this public-surface test.');
      },
    });

    const transcoder = defineTranscoder({
      id: 'transcoder',
      permissions,
      edges: [{ from: 'glb', to: 'stl', fidelity: 'mesh' }] as const,
      name: 'TranscoderDefinition',
      version: '1.0.0',
      async initialize() {
        return {};
      },
      async transcode(input) {
        return { success: true, data: input.files, issues: [] };
      },
      async onDispose() {
        await Promise.resolve();
      },
    });

    const kernelPlugin = kernel();
    const middlewarePlugin = middleware();
    const bundlerPlugin = bundler();
    const transcoderPlugin = transcoder();
    const plugins = [kernelPlugin, middlewarePlugin, bundlerPlugin, transcoderPlugin];
    const moduleUrlProperty = ['module', 'Url'].join('');

    for (const plugin of plugins) {
      expect(plugin).not.toHaveProperty('createModule');
      expect(plugin).not.toHaveProperty(moduleUrlProperty);
      expect(Object.getOwnPropertySymbols(plugin)).toHaveLength(1);
    }

    expect(Object.keys(kernelPlugin)).toEqual(['id', 'extensions', 'permissions', 'views', 'exports']);
    expect(Object.keys(middlewarePlugin)).toEqual(['id', 'permissions']);
    expect(Object.keys(bundlerPlugin)).toEqual(['id', 'extensions', 'permissions', 'options']);
    expect(Object.keys(transcoderPlugin)).toEqual(['id', 'edges', 'permissions', 'options']);

    for (const plugin of plugins) {
      expect(plugin).toMatchObject({ permissions });
    }

    await expect(resolveRuntimePluginDefinition('kernel', kernelPlugin)).resolves.toMatchObject({
      name: 'KernelDefinition',
    });
    await expect(resolveRuntimePluginDefinition('middleware', middlewarePlugin)).resolves.toMatchObject({
      name: 'MiddlewareDefinition',
    });
    await expect(resolveRuntimePluginDefinition('bundler', bundlerPlugin)).resolves.toMatchObject({
      name: 'BundlerDefinition',
      extensions: ['ts'],
    });
    await expect(resolveRuntimePluginDefinition('transcoder', transcoderPlugin)).resolves.toMatchObject({
      name: 'TranscoderDefinition',
      edges: [{ from: 'glb', to: 'stl', fidelity: 'mesh' }],
    });
  });
});
