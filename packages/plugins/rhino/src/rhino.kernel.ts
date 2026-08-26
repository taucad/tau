import type { RhinoModule } from 'rhino3dm';
import {
  coordinateSystemSchema,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  finalizeRenderOutput,
  unitSchema,
  withoutEmscriptenProcessListeners,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';

import { ThreeDmLoader } from '#rhino-loader.js';

type RhinoFactory = (options: { locateFile(path: string, prefix: string): string }) => Promise<RhinoModule>;

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({ coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up') })
  .strict();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const loadBackend = async (): Promise<RhinoModule> => {
  const { default: importedFactory } = await import('rhino3dm');
  // Rhino3dm's declaration omits the Emscripten Module argument even though
  // the shipped factory accepts it; this adapter binds the package-owned WASM asset.
  return withoutEmscriptenProcessListeners(async () =>
    (importedFactory as unknown as RhinoFactory)({
      locateFile: () => new URL('wasm/rhino3dm.wasm', import.meta.url).href,
    }),
  );
};

/** Rhino 3DM import kernel. @public */
export const rhinoKernel = defineKernel({
  id: 'rhino',
  extensions: ['3dm'],
  name: 'RhinoKernel',
  version: '0.1.0',
  exportFormats: { glb: { optionsSchema: glbOptionsSchema } },

  async initialize() {
    return { rhino: await loadBackend() };
  },

  async getDependencies({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    return { resolved: [...inventory.resolved], unresolved: [...inventory.unresolved] };
  },

  async getParameters() {
    return createKernelSuccess({
      defaultParameters: {},
      jsonSchema: { type: 'object', properties: {}, additionalProperties: false },
    });
  },

  async createGeometry({ entryPath }, { filesystem }, context: { rhino: RhinoModule }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const glb = await new ThreeDmLoader(context.rhino)
      .initialize({ format: '3dm' })
      .load([{ name: basename(entryPath), bytes: inventory.entryBytes }]);
    const normalized = await normalizeGltfGeometryNames(glb, {
      format: 'glb',
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'external-generated',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'external-generated',
    });
    return finalizeRenderOutput({ artifacts: [{ format: 'gltf', content: normalized }], nativeHandle: normalized });
  },

  async exportGeometry(input) {
    if (input.nativeHandle.length === 0) {
      return createKernelError([
        { message: 'No geometry available for export.', code: 'RUNTIME', type: 'runtime', severity: 'error' },
      ]);
    }
    const bytes = await transformGltfExportBytes(input.nativeHandle, {
      format: 'glb',
      coordinateSystem: input.options.coordinateSystem,
      unit: input.options.unit,
    });
    return createKernelSuccess([createExportFile('glb', 'model.glb', bytes)]);
  },

  serializeNativeHandle: ({ nativeHandle }) => new Uint8Array(nativeHandle),
  deserializeNativeHandle: ({ serializedNativeHandle }) => new Uint8Array(serializedNativeHandle),
});
