import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  resolveRuntimePluginDefinition,
  runtimePluginDefinitionSymbol,
  runtimePluginFactoryAcceptsOptions,
} from '#plugins/plugin-runtime-definition.js';
import { defineKernelV2, nonemptyExportFiles } from '#types/runtime-kernel-v2.types.js';
import type { ViewDeclaration } from '#types/runtime-kernel-v2.types.js';

const makeKernel = () =>
  defineKernelV2({
    id: 'example',
    extensions: ['tsx'],
    name: 'Example',
    version: '1',
    permissions: { network: [] },
    implementationAssets: [{ id: 'engine', url: 'file:///engine.wasm', sha256: 'digest' }],
    views: {
      board: {
        title: 'Board',
        mimeType: 'model/gltf-binary',
        optionsSchema: z.object({ quality: z.number().default(1) }),
      },
    },
    exports: {
      board: { title: 'Board', mimeType: 'model/gltf-binary', extension: 'glb' },
    },
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
      return { handle: { value: 1 } };
    },
    async render() {
      return { content: new Uint8Array([1]) };
    },
    async export() {
      return {
        files: nonemptyExportFiles([{ name: 'board.glb', mimeType: 'model/gltf-binary', bytes: new Uint8Array([1]) }]),
      };
    },
  });

describe('v2 kernel definition boundary', () => {
  it('should reject overlapping evaluate and view options at authoring', () => {
    for (const optionsSchema of [
      z.object({ quality: z.number() }),
      z.object({ quality: z.number() }).transform((value) => value),
      z.union([z.object({ quality: z.number() }), z.object({ other: z.string() })]),
      z.intersection(z.object({ quality: z.number() }), z.object({ other: z.string() })),
    ]) {
      expect(() =>
        defineKernelV2({
          id: 'overlap',
          extensions: ['txt'],
          name: 'Overlap',
          version: '1',
          evaluateOptionsSchema: z.object({ quality: z.number() }),
          views: { text: { title: 'Text', mimeType: 'text/plain', optionsSchema } },
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
            return { handle: {} };
          },
          async render() {
            return { content: '' };
          },
        }),
      ).toThrow('both declare option "quality"');
    }
  });

  it('should allow loose view keys and reject bounded record overlap', () => {
    const define = (optionsSchema: NonNullable<ViewDeclaration['optionsSchema']>) =>
      defineKernelV2({
        id: 'record',
        extensions: ['txt'],
        name: 'Record',
        version: '1',
        evaluateOptionsSchema: z.object({ quality: z.number() }),
        views: { text: { title: 'Text', mimeType: 'text/plain', optionsSchema } },
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
          return { handle: {} };
        },
        async render() {
          return { content: '' };
        },
      });
    expect(() => define(z.looseObject({}))).not.toThrow();
    expect(() => define(z.record(z.enum(['scale']), z.number()))).not.toThrow();
    expect(() => define(z.record(z.enum(['quality']), z.number()))).toThrow('both declare option "quality"');
  });

  it('should publish only plain metadata while retaining private executable hooks and factory branding', async () => {
    const factory = makeKernel();
    expect(runtimePluginFactoryAcceptsOptions(factory)).toBe(false);
    const plugin = factory();
    expect(plugin.permissions).toEqual({ network: [] });
    expect(plugin.views.board.optionsSchema).toMatchObject({ type: 'object' });
    expect(Object.keys(plugin)).not.toContain('render');
    expect(Object.keys(plugin)).not.toContain('implementationAssets');
    expect(JSON.stringify(plugin)).not.toContain('parse');
    expect(Object.getOwnPropertyDescriptor(plugin, runtimePluginDefinitionSymbol)?.enumerable).toBe(false);
    const loaded = await resolveRuntimePluginDefinition('kernel', plugin);
    expect(loaded.render).toBeTypeOf('function');
    expect(loaded.implementationAssets).toEqual([{ id: 'engine', url: 'file:///engine.wasm', sha256: 'digest' }]);
  });

  it('should reject empty dynamic writes and unknown declaration keys', () => {
    expect(() => nonemptyExportFiles([])).toThrow('at least one file');
    const textView: ViewDeclaration = { title: 'Text', mimeType: 'text/plain' };
    Reflect.set(textView, 'optionSchema', z.object({}));
    expect(() =>
      defineKernelV2({
        id: 'bad',
        extensions: ['txt'],
        name: 'Bad',
        version: '1',
        views: { text: textView },
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
          return { handle: {} };
        },
        async render() {
          return { content: '' };
        },
      }),
    ).toThrow('optionSchema');
    Reflect.deleteProperty(textView, 'optionSchema');
    Reflect.set(textView, 'instances', false);
    expect(() =>
      defineKernelV2({
        id: 'bad-instances',
        extensions: ['txt'],
        name: 'Bad instances',
        version: '1',
        views: { text: textView },
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
          return { handle: {} };
        },
        async render() {
          return { content: '' };
        },
      }),
    ).toThrow('instances must be true');
  });
});
