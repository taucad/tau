import { NodeIO } from '@gltf-transform/core';
import { unpartition } from '@gltf-transform/functions';
import {
  coordinateSystemSchema,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  finalizeRenderOutput,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import {
  allExtensions,
  createImportFileInventory,
  normalizeGltfGeometryNames,
  transformGltfExportBytes,
} from '@taucad/geometry-core';
import { createFileResolverIo } from '#file-resolver-io.utils.js';

import { dracoDependencies, loadDracoBackend } from '#draco-backend.js';
import type { DracoBackend } from '#draco-backend.js';

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({ coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up') })
  .strict();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** GlTF and GLB import kernel. @public */
export const gltfKernel = defineKernel({
  id: 'gltf',
  extensions: ['glb', 'gltf'],
  name: 'GltfKernel',
  version: '0.1.0',
  exportFormats: { glb: { optionsSchema: glbOptionsSchema } },

  async initialize() {
    return { draco: await loadDracoBackend() };
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

  async createGeometry({ entryPath }, { filesystem }, context: { draco: DracoBackend }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const dependencies = dracoDependencies(context.draco);
    const isJson = entryPath.toLowerCase().endsWith('.gltf');
    const io = isJson
      ? createFileResolverIo(inventory.resolver).registerDependencies(dependencies)
      : new NodeIO().registerExtensions(allExtensions).registerDependencies(dependencies);
    const document = isJson ? await io.read(basename(entryPath)) : await io.readBinary(inventory.entryBytes);
    await document.transform(unpartition());
    const glb = await io.writeBinary(document);
    const normalized = await normalizeGltfGeometryNames(glb, {
      format: 'glb',
      io,
      rewriteLegacyGeneratedShapeNames: false,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'imported',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'imported',
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
