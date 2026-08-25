import {
  coordinateSystemSchema,
  createKernelError,
  createKernelSuccess,
  defineKernel,
  finalizeRenderOutput,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';
import { createAssimp } from 'libassimp';
import type { Assimp } from 'libassimp';

const extensions = [
  '3ds',
  '3mf',
  'ac',
  'amf',
  'ase',
  'bvh',
  'cob',
  'dae',
  'dxf',
  'fbx',
  'ifc',
  'lwo',
  'md2',
  'md5mesh',
  'mesh.xml',
  'nff',
  'obj',
  'off',
  'ogex',
  'ply',
  'smd',
  'stl',
  'usda',
  'usdz',
  'wrl',
  'x',
  'x3d',
  'x3db',
  'x3dv',
  'xgl',
] as const;

const glbOptionsSchema = coordinateSystemSchema
  .extend(unitSchema.shape)
  .extend({ coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up') })
  .strict();

const fileExtension = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Assimp-backed mesh import kernel. @public */
export const assimpKernel = defineKernel({
  id: 'assimp',
  extensions: [...extensions],
  name: 'AssimpKernel',
  version: '0.1.0',
  exportFormats: { glb: { optionsSchema: glbOptionsSchema } },

  async initialize() {
    return { assimp: await createAssimp() };
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

  async createGeometry({ entryPath }, { filesystem }, context: { assimp: Assimp }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    const filename = basename(entryPath);
    const { files } = await context.assimp.convert([{ name: filename, bytes: inventory.entryBytes }], {
      to: 'glb',
      resolve: (name) => (inventory.resolver.exists(name) ? inventory.resolver.readFile(name) : undefined),
    });
    const output = files.find(({ name }) => fileExtension(name) === 'glb');
    if (output === undefined) {
      throw new Error(`Failed to import ${fileExtension(filename)} file: libassimp returned no GLB output`);
    }
    const glb = await normalizeGltfGeometryNames(new Uint8Array(output.bytes), {
      format: 'glb',
      rewriteLegacyGeneratedShapeNames: true,
      materialNamePolicy: 'clear-generated',
      materialNameSource: 'external-generated',
      sceneNamePolicy: 'clear-generated',
      sceneNameSource: 'external-generated',
    });
    return finalizeRenderOutput({ artifacts: [{ format: 'gltf', content: glb }], nativeHandle: glb });
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

  async cleanup(context) {
    context.assimp.dispose();
  },
});
