import { createKernelError, createKernelSuccess, defineKernel, finalizeRenderOutput } from '@taucad/runtime/kernel';
import type { GeometryResponse } from '@taucad/runtime/types';
import { z } from 'zod';

type MyContext = {
  engine: unknown;
};

type MyNativeHandle = null;

export const myKernel = defineKernel({
  id: 'my-kernel',
  extensions: ['myformat'],
  name: 'MyKernel',
  version: '1.0.0',
  exportFormats: {
    glb: { optionsSchema: z.object({}).strict() },
  },

  async initialize(_options, _runtime): Promise<MyContext> {
    return { engine: null };
  },

  async getDependencies({ entryPath }, _runtime, _context) {
    return { resolved: [entryPath], unresolved: [] };
  },

  async getParameters() {
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    });
  },

  async createGeometry({ entryPath }, { filesystem }, _context) {
    const code = await filesystem.readFile(entryPath, 'utf8');
    const geometry: GeometryResponse = {
      format: 'svg',
      content: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><text>${code.length}</text></svg>`,
    };
    const nativeHandle: MyNativeHandle = null;
    return finalizeRenderOutput({ artifacts: [geometry], nativeHandle });
  },

  async exportGeometry({ format }) {
    if (format !== 'glb') {
      return createKernelError([
        {
          message: `Unsupported export format: ${format}`,
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
      ]);
    }
    return createKernelSuccess([{ name: 'model.glb', bytes: new Uint8Array(), mimeType: 'model/gltf-binary' }]);
  },
});
