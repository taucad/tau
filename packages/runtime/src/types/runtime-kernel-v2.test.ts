import { describe, expect, it } from 'vitest';
import { defineKernel } from '#plugins/kernel-plugin-entry.js';
import { runtimePluginDefinitionSymbol } from '#plugins/plugin-runtime-definition.js';

describe('v2 kernel registration metadata', () => {
  it('serializes import detection and declarations without executable state', () => {
    const kernel = defineKernel({
      id: 'serializable',
      name: 'Serializable',
      version: '1.0.0',
      extensions: ['ts'],
      detectImport: /from 'example'/i,
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
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
        return { handle: {}, views: ['model'] };
      },
      async render() {
        return { content: new Uint8Array([1]) };
      },
    });
    const registration = kernel();
    // oxlint-disable-next-line unicorn/prefer-structured-clone -- verify the actual JSON transport form.
    const metadata: unknown = JSON.parse(JSON.stringify(registration));
    expect(metadata).toEqual({
      id: 'serializable',
      extensions: ['ts'],
      detectImport: { source: "from 'example'", flags: 'i' },
      views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
      exports: {},
    });
    expect(Object.getOwnPropertyDescriptor(registration, runtimePluginDefinitionSymbol)?.enumerable).toBe(false);
    expect(
      Object.values(registration).every((value) => typeof value !== 'function' && !(value instanceof RegExp)),
    ).toBe(true);
    expect(JSON.stringify(metadata)).not.toContain('render');
    const pattern = (metadata as { detectImport: { source: string; flags: string } }).detectImport;
    expect(new RegExp(pattern.source, pattern.flags).test("FROM 'example'")).toBe(true);
  });
});
