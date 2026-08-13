import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ExportFile, GeometryResponse } from '@taucad/types';
import { createRuntimeClient } from '#client/runtime-client.js';
import { fromMemoryFs } from '#filesystem/runtime-filesystem.js';
import { inProcessTransport } from '#transport/in-process-transport.js';
import type { imageEdgeSchemas } from '#transcoders/image/image-export-options.js';
import { imageTranscoder } from '#transcoders/image/image.transcoder.js';
import { defineKernel } from '#types/runtime-kernel.types.js';
import { defineRuntime } from '#worker/runtime-definition.js';

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

describe('image export option types', () => {
  it('should infer a defaultable input and mandatory output discriminator', () => {
    expectTypeOf<Record<never, never>>().toExtend<WebpInput>();
    expectTypeOf<WebpOutput['mode']>().toEqualTypeOf<'single' | 'batch'>();
  });

  it('should narrow branch-specific properties', () => {
    const narrow = (options: WebpOutput): void => {
      if (options.mode === 'batch') {
        expectTypeOf(options.views).toExtend<ReadonlyArray<{ id: string; phi: number; theta: number }>>();
        // @ts-expect-error phi belongs to the single branch.
        void options.phi;
        return;
      }
      expectTypeOf(options.phi).toBeNumber();
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
        includeAxes: true,
        includeLabel: true,
        includeScale: true,
        views: [{ id: 'front', label: 'Front', phi: 90, theta: 0 }],
      },
    });
    if (result.success) {
      expectTypeOf(result.data).toEqualTypeOf<ExportFile[]>();
    }

    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [{ id: 'front', phi: 90, theta: 0 }],
        // @ts-expect-error top-level angles belong to the single branch.
        phi: 90,
      },
    });
    void client.export('png', {
      source,
      exportOptions: {
        mode: 'single',
        // @ts-expect-error views belong to the batch branch.
        views: [{ id: 'front', phi: 90, theta: 0 }],
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'single',
        includeLabel: true,
        // @ts-expect-error enabled singular labels require label content.
        label: undefined,
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        includeLabel: true,
        // @ts-expect-error enabled batch labels require every view label.
        views: [{ id: 'front', phi: 90, theta: 0 }],
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        mode: 'batch',
        views: [
          {
            id: 'front',
            phi: 90,
            theta: 0,
            // @ts-expect-error includeAxes is shared at the operation level.
            includeAxes: true,
          },
        ],
      },
    });
    void client.export('png', {
      source,
      exportOptions: {
        // @ts-expect-error quality is JPEG-only.
        quality: 0.8,
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
        views: [{ id: 'front', phi: 90, theta: 0 }],
        // @ts-expect-error unrelated export settings are rejected.
        binary: true,
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        // @ts-expect-error the image route pins its private source coordinate system.
        coordinateSystem: 'z-up',
      },
    });
    void client.export('webp', {
      source,
      exportOptions: {
        // @ts-expect-error the image route pins its private source unit.
        unit: { length: 'meter' },
      },
    });
  });
});
