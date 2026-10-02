import type { RhinoModule } from 'rhino3dm';
import {
  coordinateSystemSchema,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  unitSchema,
  withoutEmscriptenProcessListeners,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';

import { ThreeDmLoader } from '#rhino-loader.js';

type RhinoFactory = (options: { locateFile(path: string, prefix: string): string }) => Promise<RhinoModule>;

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
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
  views: { model: { title: 'Model', mimeType: 'model/gltf-binary' } },
  exports: {
    glb: { title: 'glTF binary', mimeType: 'model/gltf-binary', extension: 'glb', optionsSchema: glbOptionsSchema },
  },

  async initialize() {
    return { rhino: await loadBackend() };
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
          id: 'urn:taucad:rhino:parameters',
          name: 'RhinoParameters',
        },
      ),
    });
  },

  async evaluate({ entryPath }, { filesystem }, context: { rhino: RhinoModule }) {
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
});
