import { describe, expect, it, vi } from 'vitest';
import {
  normalizeRuntimeContent,
  runtimeContentDefaults,
  runtimeContentSchema,
  RuntimeContentUnsupportedError,
} from '#types/runtime-content.types.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineMiddleware } from '#middleware/runtime-middleware.js';
import { defineTranscoder } from '#types/runtime-transcoder.types.js';
import { z } from 'zod';

describe('runtime content', () => {
  it('uses render defaults only for properties owned by the route', () => {
    expect(normalizeRuntimeContent('render', ['includeEdges', 'includeTopology'], undefined)).toEqual(
      runtimeContentDefaults.render,
    );
    expect(normalizeRuntimeContent('render', ['includeEdges'], undefined)).toEqual({ includeEdges: false });
  });

  it('uses false export defaults and canonicalizes explicit defaults', () => {
    const omitted = normalizeRuntimeContent('export', ['includeEdges', 'includeTopology'], undefined);
    const explicit = normalizeRuntimeContent('export', ['includeEdges', 'includeTopology'], {
      includeEdges: false,
      includeTopology: false,
    });

    expect(omitted).toEqual(runtimeContentDefaults.export);
    expect(explicit).toEqual(omitted);
  });

  it('rejects a known property that the concrete route does not own', () => {
    expect(() => normalizeRuntimeContent('export', ['includeEdges'], { includeTopology: false })).toThrow(
      RuntimeContentUnsupportedError,
    );
  });

  it('rejects unknown framework properties before projection', () => {
    expect(() => runtimeContentSchema.parse({ includeEdges: true, includeSketches: true })).toThrow();
  });
});

const callDefineKernel = defineKernel as unknown as (definition: Record<string, unknown>) => unknown;
const callDefineMiddleware = defineMiddleware as unknown as (definition: Record<string, unknown>) => unknown;
const callDefineTranscoder = defineTranscoder as unknown as (definition: Record<string, unknown>) => unknown;

const kernelBase = (id: string) => ({
  id,
  extensions: ['test'],
  name: id,
  version: '1.0.0',
  exportFormats: {},
  initialize: async () => ({}),
  getDependencies: async () => ({ resolved: [], unresolved: [] }),
  getParameters: async () => ({
    success: true,
    data: { defaultParameters: {}, jsonSchema: {} },
    issues: [],
  }),
  createGeometry: async () => ({ nativeHandle: {}, geometry: { format: 'gltf', content: new Uint8Array() } }),
  exportGeometry: async () => ({ success: true, data: [], issues: [] }),
});

type DeclarationBoundary = {
  readonly id: string;
  readonly path: string;
  readonly define: (value: unknown) => unknown;
};

const declarationBoundaries: readonly DeclarationBoundary[] = [
  {
    id: 'kernel-render-validation',
    path: 'render.content',
    define: (value) =>
      callDefineKernel({
        ...kernelBase('kernel-render-validation'),
        render: value === undefined ? {} : { content: value },
        meshGeometry: async () => ({ geometry: { format: 'gltf', content: new Uint8Array() } }),
      }),
  },
  {
    id: 'kernel-export-validation',
    path: 'exportFormats.glb.content',
    define: (value) =>
      callDefineKernel({
        ...kernelBase('kernel-export-validation'),
        exportFormats: { glb: { optionsSchema: z.object({}), ...(value === undefined ? {} : { content: value }) } },
      }),
  },
  {
    id: 'middleware-render-validation',
    path: 'content.render',
    define: (value) =>
      callDefineMiddleware({
        id: 'middleware-render-validation',
        name: 'middleware-render-validation',
        content: value === undefined ? {} : { render: value },
      }),
  },
  {
    id: 'middleware-export-validation',
    path: 'content.exportFormats.glb',
    define: (value) =>
      callDefineMiddleware({
        id: 'middleware-export-validation',
        name: 'middleware-export-validation',
        content: { exportFormats: value === undefined ? {} : { glb: value } },
      }),
  },
  {
    id: 'transcoder-edge-validation',
    path: 'edges.0.content',
    define: (value) =>
      callDefineTranscoder({
        id: 'transcoder-edge-validation',
        name: 'transcoder-edge-validation',
        version: '1.0.0',
        edges: [{ from: 'glb', to: 'stl', fidelity: 'mesh', ...(value === undefined ? {} : { content: value }) }],
        initialize: async () => ({}),
        transcode: async (input: { files: unknown[] }) => ({ success: true, data: input.files, issues: [] }),
        cleanup: async () => undefined,
      }),
  },
];

describe.each(declarationBoundaries)('$id declaration validation', ({ define, id, path }) => {
  it('constructs for omission and a valid positive declaration', () => {
    expect(() => define(undefined)).not.toThrow();
    expect(() => define(['includeEdges'])).not.toThrow();
  });

  it('rejects a non-array declaration', () => {
    expect(() => define('includeEdges')).toThrow(`Plugin "${id}" content declaration "${path}" must be an array.`);
  });

  it('rejects an empty declaration', () => {
    expect(() => define([])).toThrow(`Plugin "${id}" content declaration "${path}" must not be empty.`);
  });

  it('rejects duplicate keys', () => {
    expect(() => define(['includeEdges', 'includeEdges'])).toThrow('duplicate key "includeEdges"');
  });

  it('rejects unknown keys', () => {
    expect(() => define(['includeSketches'])).toThrow('unknown key includeSketches');
  });
});

describe('kernel definition invariants', () => {
  it('rejects native render content without meshGeometry', () => {
    expect(() =>
      callDefineKernel({
        ...kernelBase('render-without-mesh'),
        render: { content: ['includeEdges'] },
      }),
    ).toThrow('Kernel "render-without-mesh" render.content requires meshGeometry.');
  });

  it('allows an inline kernel with omitted render metadata', () => {
    expect(() => callDefineKernel(kernelBase('inline-without-render'))).not.toThrow();
  });

  it('rejects a type-erased non-object create options schema before initialization', () => {
    const initialize = vi.fn(async () => ({}));
    expect(() =>
      callDefineKernel({
        ...kernelBase('invalid-create-schema'),
        initialize,
        createOptionsSchema: z.string(),
      }),
    ).toThrow('Kernel "invalid-create-schema" createOptionsSchema must be a Zod object schema.');
    expect(initialize).not.toHaveBeenCalled();
  });
});
