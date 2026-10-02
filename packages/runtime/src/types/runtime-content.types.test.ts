import { describe, expect, it, vi } from 'vitest';
import {
  normalizeRuntimeContent,
  runtimeContentDefaults,
  runtimeContentSchema,
  RuntimeContentUnsupportedError,
} from '#types/runtime-content.types.js';
import { defineKernelV2 } from '#types/runtime-kernel-v2.types.js';
import { defineMiddleware } from '#plugins/middleware-entry.js';
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
    expect(() =>
      normalizeRuntimeContent('export', ['includeEdges'], {
        includeTopology: false,
      }),
    ).toThrow(RuntimeContentUnsupportedError);
  });

  it('tolerates unknown additive properties at the wire boundary', () => {
    expect(runtimeContentSchema.parse({ includeEdges: true, includeSketches: true })).toEqual({
      includeEdges: true,
      includeSketches: true,
    });
  });
});

const callDefineKernel = defineKernelV2 as unknown as (definition: Record<string, unknown>) => unknown;
const callDefineMiddleware = defineMiddleware as unknown as (definition: Record<string, unknown>) => unknown;
const callDefineTranscoder = defineTranscoder as unknown as (definition: Record<string, unknown>) => unknown;

const kernelBase = (id: string) => ({
  id,
  extensions: ['test'],
  name: id,
  version: '1.0.0',
  views: {},
  exports: {},
  initialize: async () => ({}),
  resolve: async () => ({ resolved: [], unresolved: [] }),
  describe: async () => ({ success: false, issues: [] }),
  evaluate: async () => ({ handle: {} }),
});

type DeclarationBoundary = {
  readonly id: string;
  readonly path: string;
  readonly define: (value: unknown) => unknown;
};

const declarationBoundaries: readonly DeclarationBoundary[] = [
  {
    id: 'kernel-render-validation',
    path: 'views.model.content',
    define: (value) =>
      callDefineKernel({
        ...kernelBase('kernel-render-validation'),
        views: {
          model: {
            title: 'Model',
            mimeType: 'model/gltf+json',
            ...(value === undefined ? {} : { content: value }),
          },
        },
        render: async () => ({ content: new Uint8Array() }),
      }),
  },
  {
    id: 'kernel-export-validation',
    path: 'exports.glb.content',
    define: (value) =>
      callDefineKernel({
        ...kernelBase('kernel-export-validation'),
        exports: {
          glb: {
            title: 'GLB',
            mimeType: 'model/gltf-binary',
            extension: 'glb',
            ...(value === undefined ? {} : { content: value }),
          },
        },
        export: async () => ({
          files: [
            {
              name: 'part.glb',
              mimeType: 'model/gltf-binary',
              bytes: new Uint8Array(),
            },
          ],
        }),
      }),
  },
  {
    id: 'middleware-render-validation',
    path: 'content.views.image/svg+xml',
    define: (value) =>
      callDefineMiddleware({
        id: 'middleware-render-validation',
        name: 'middleware-render-validation',
        content: { views: value === undefined ? {} : { 'image/svg+xml': value } },
      }),
  },
  {
    id: 'middleware-export-validation',
    path: 'content.exports.glb',
    define: (value) =>
      callDefineMiddleware({
        id: 'middleware-export-validation',
        name: 'middleware-export-validation',
        content: { exports: value === undefined ? {} : { glb: value } },
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
        edges: [
          {
            from: 'glb',
            to: 'stl',
            fidelity: 'mesh',
            ...(value === undefined ? {} : { content: value }),
          },
        ],
        initialize: async () => ({}),
        transcode: async (input: { files: unknown[] }) => ({
          success: true,
          data: input.files,
          issues: [],
        }),
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
  it('requires a render hook for declared views', () => {
    expect(() =>
      callDefineKernel({
        ...kernelBase('render-without-hook'),
        views: { model: { title: 'Model', mimeType: 'model/gltf+json' } },
      }),
    ).toThrow('Kernel "render-without-hook" render hook must exist exactly when views are declared.');
  });

  it('allows a kernel with no declared views or exports', () => {
    expect(() => callDefineKernel(kernelBase('no-artifacts'))).not.toThrow();
  });

  it('rejects overlapping evaluate and view option keys before initialization', () => {
    const initialize = vi.fn(async () => ({}));
    expect(() =>
      callDefineKernel({
        ...kernelBase('overlap-options'),
        initialize,
        evaluateOptionsSchema: z.object({ detail: z.number() }),
        views: {
          model: {
            title: 'Model',
            mimeType: 'model/gltf+json',
            optionsSchema: z.object({ detail: z.number() }),
          },
        },
        render: async () => ({ content: new Uint8Array() }),
      }),
    ).toThrow('Kernel "overlap-options" evaluate and view "model" both declare option "detail".');
    expect(initialize).not.toHaveBeenCalled();
  });
});
