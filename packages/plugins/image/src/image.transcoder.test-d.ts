import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ExportFile, GeometryResponse } from '@taucad/runtime/types';
import { createRuntimeClient } from '@taucad/runtime/client';
import { fromMemoryFs } from '@taucad/runtime/filesystem';
import { defineKernel } from '@taucad/runtime/kernel';
import { inProcessTransport } from '@taucad/runtime/transport/in-process';
import { defineRuntime } from '@taucad/runtime/worker';
import type { imageEdgeSchemas } from '#image-export-options.js';
import { imageTranscoder } from '#image.transcoder.js';

type WebpInput = z.input<typeof imageEdgeSchemas.webp>;
type WebpOutput = z.output<typeof imageEdgeSchemas.webp>;

const geometry = { format: 'gltf', content: new Uint8Array([1]) } satisfies GeometryResponse;
const kernel = defineKernel({
  id: 'imageTypeKernel',
  extensions: ['ts'],
  name: 'Image type kernel',
  version: '1.0.0',
  exportFormats: {
    glb: {
      optionsSchema: z.object({
        coordinateSystem: z.enum(['y-up', 'z-up']).default('y-up'),
        unit: z.object({ length: z.enum(['meter', 'millimeter']).default('meter') }).default({ length: 'meter' }),
      }),
      content: ['includeEdges'],
    },
  },
  async initialize() {
    return {};
  },
  async getDependencies() {
    return { resolved: [], unresolved: [] };
  },
  async getParameters() {
    return { success: true, data: { defaultParameters: {}, jsonSchema: {} }, issues: [] };
  },
  async createGeometry() {
    return { geometry, nativeHandle: {} };
  },
  async exportGeometry() {
    return { success: true, data: [], issues: [] };
  },
});
const runtime = defineRuntime({ kernels: [kernel()], transcoders: [imageTranscoder()] });
const transport = inProcessTransport({ runtime, fileSystem: fromMemoryFs() });
const client = createRuntimeClient({ transport });
const entryPath = 'main.ts';
const source = { files: { [entryPath]: 'export default () => null' } };
const frontCamera = {
  framing: 'fit',
  direction: [0, -1, 0],
  up: [0, 0, 1],
} satisfies { framing: 'fit'; direction: [number, number, number]; up: [number, number, number] };
const topCamera = {
  framing: 'fit',
  direction: [0, 0, 1],
  up: [0, 1, 0],
} satisfies { framing: 'fit'; direction: [number, number, number]; up: [number, number, number] };

describe('image export option types', () => {
  it('should infer a defaultable input and mandatory output discriminator', () => {
    expectTypeOf<Record<never, never>>().toExtend<WebpInput>();
    expectTypeOf<WebpOutput['mode']>().toEqualTypeOf<'single' | 'batch'>();
  });

  it('should narrow branch-specific properties', () => {
    const narrow = (options: WebpOutput): void => {
      if (options.mode === 'batch') {
        expectTypeOf(options.views).toExtend<
          ReadonlyArray<{ id: string; camera: { framing: 'fit' | 'bounds' | 'fixed' } }>
        >();
        // @ts-expect-error camera belongs to each batch view.
        void options.camera;
        return;
      }
      expectTypeOf(options.camera).toExtend<{ framing: 'fit' | 'bounds' | 'fixed' }>();
      // @ts-expect-error views belongs to the batch branch.
      void options.views;
    };
    void narrow;
  });

  it('should infer exact public client options and plural results', async () => {
    const result = await client.export('webp', {
      source,
      content: { includeEdges: true },
      exportOptions: {
        mode: 'batch',
        quality: 1,
        axes: true,
        scaleBar: true,
        surfaces: false,
        lighting: {
          lights: [{ direction: [0, 1, 0], color: [2, 2, 2] }],
          space: 'world',
          exposure: 1.5,
        },
        visiblePrimitives: [{ nodeIndex: 0, meshIndex: 0, primitiveIndex: 0 }],
        sections: {
          planes: [
            { point: [0, 0, 0], normal: [0, 0, 1] },
            { point: [1, 0, 0], normal: [-1, 0, 0] },
          ],
          clipLines: false,
        },
        views: [{ id: 'front', label: 'Front', camera: frontCamera, width: 400, height: 300, quality: 0.9 }],
      },
    });
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<ExportFile[]>();
    }

    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [{ id: 'front', camera: frontCamera }],
        // @ts-expect-error a shared camera would make per-view precedence ambiguous.
        camera: frontCamera,
      },
    });
    void client.export('png', {
      source,
      exportOptions: {
        mode: 'single',
        // @ts-expect-error views belong to the batch branch.
        views: [{ id: 'front', camera: frontCamera }],
      },
    });
    // A label's presence is its own switch — optional at both altitudes, with no
    // separate enable flag to keep in sync.
    void client.export('webp', { source, exportOptions: { mode: 'single', label: 'Front' } });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [
          { id: 'front', label: 'Front', camera: frontCamera },
          { id: 'top', camera: topCamera, quality: 0.9 },
        ],
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'single',
        // @ts-expect-error the deleted enable flag is no longer part of the surface.
        includeLabel: true,
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [
          {
            id: 'front',
            camera: frontCamera,
            // @ts-expect-error axes is shared at the operation level.
            axes: true,
          },
        ],
      },
    });
    void client.export('png', {
      source,
      exportOptions: {
        // @ts-expect-error quality is not a PNG option.
        quality: 0.8,
      },
    });
    void client.export('png', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [
          {
            id: 'front',
            camera: frontCamera,
            // @ts-expect-error per-view quality is not a PNG option.
            quality: 0.8,
          },
        ],
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [
          {
            id: 'front',
            camera: frontCamera,
            // @ts-expect-error runtime routes stay homogeneous.
            format: 'png',
          },
        ],
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'single',
        // @ts-expect-error misspelled image settings are rejected.
        widht: 800,
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [{ id: 'front', camera: frontCamera }],
        // @ts-expect-error unrelated export settings are rejected.
        binary: true,
      },
    });
  });
});
