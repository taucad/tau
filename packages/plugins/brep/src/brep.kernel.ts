// oxlint-disable-next-line typescript/triple-slash-reference -- occt-import-js ships no declarations; this is the backend import seam.
/// <reference path='./types/occt-import-js.d.ts' />
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

import { OcctLoader } from '#occt-loader.js';
import type { OcctImportJs } from '#occt-loader.js';

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({ coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up') })
  .strict();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const extension = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

const loadBackend = async (): Promise<OcctImportJs> => {
  const { default: factory } = await import('occt-import-js');
  return withoutEmscriptenProcessListeners(async () =>
    factory({
      print() {
        /* Empty. */
      },
      printErr() {
        /* Empty. */
      },
      locateFile: () => new URL('wasm/occt-import-js.wasm', import.meta.url).href,
    }),
  );
};

/** BRep-family import kernel. @public */
export const brepKernel = defineKernel({
  id: 'brep',
  extensions: ['step', 'stp', 'iges', 'igs', 'brep'],
  name: 'BrepKernel',
  version: '0.1.0',
  exportFormats: { glb: { optionsSchema: glbOptionsSchema } },

  async initialize() {
    return { occt: await loadBackend() };
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

  async createGeometry({ entryPath }, { filesystem }, context: { occt: OcctImportJs }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const glb = await new OcctLoader(context.occt)
      .initialize({ format: extension(entryPath) })
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
