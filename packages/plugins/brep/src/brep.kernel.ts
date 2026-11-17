import {
  coordinateSystemSchema,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';

import { loadOcctBackend, meshOcctFile } from '#occt.js';
import type { OcctBackend } from '#occt.js';

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .strict();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const extension = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase();

/** BRep-family import kernel. @public */
export const brepKernel = defineKernel({
  id: 'brep',
  extensions: ['step', 'stp', 'iges', 'igs', 'brep'],
  name: 'BrepKernel',
  version: '0.1.0',
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {
    glb: { title: 'glTF binary', mimeType: 'model/gltf-binary', extension: 'glb', optionsSchema: glbOptionsSchema },
  },

  async initialize() {
    return { occt: await loadOcctBackend() };
  },

  async resolve({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    return {
      resolved: [...inventory.resolved],
      unresolved: [...inventory.unresolved],
    };
  },

  async describe() {
    return createKernelSuccess({
      parameters: createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        {
          id: 'urn:taucad:brep:parameters',
          name: 'BrepParameters',
        },
      ),
    });
  },

  async evaluate({ entryPath }, { filesystem }, context: { occt: OcctBackend }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const glb = await meshOcctFile(context.occt, {
      name: basename(entryPath),
      bytes: inventory.entryBytes,
      format: extension(entryPath),
    });
    const normalized = await normalizeGltfGeometryNames(glb, {
      format: 'glb',
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'external-generated',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'external-generated',
    });
    return { handle: normalized };
  },

  async render({ handle }) {
    return { content: handle };
  },

  async export(input) {
    if (input.handle.length === 0) {
      throw new Error('No geometry available for export.');
    }
    const bytes = await transformGltfExportBytes(input.handle, {
      format: 'glb',
      coordinateSystem: input.options.coordinateSystem,
      unit: input.options.unit,
    });
    return { files: [createExportFile('glb', 'model.glb', bytes)] };
  },

  serializeHandle: ({ handle }) => new Uint8Array(handle),
  deserializeHandle: ({ serialized }) => new Uint8Array(serialized),

  // Observation only (PR-1b): occt-import-js exports no `WebAssembly.Memory`, so its byte view over the whole
  // linear memory, which Emscripten replaces on every growth, gives the same `buffer.byteLength`.
  observedHeapBytes: (context: { occt: OcctBackend }) => context.occt.HEAPU8.byteLength,
});
