import {
  assertRootedPath,
  coordinateSystemSchema,
  createKernelError,
  createKernelParameterDeclaration,
  createKernelSuccess,
  defineKernel,
  finalizeRenderOutput,
  isNotFoundError,
  resolveRootedPath,
  unitSchema,
} from '@taucad/runtime/kernel';
import { createExportFile } from '@taucad/runtime/types';
import { createImportFileInventory, normalizeGltfGeometryNames, transformGltfExportBytes } from '@taucad/geometry-core';
import { createAssimp, defaultPostProcess } from 'libassimp';
import type { Assimp, ConvertOptions, ResolveFile } from 'libassimp';

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
  .extend({
    coordinateSystem: coordinateSystemSchema.shape.coordinateSystem.default('y-up'),
  })
  .strict();

const fileExtension = (path: string): string => path.slice(path.lastIndexOf('.') + 1).toLowerCase();
const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const uriSchemePattern = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const toBytes = (content: Uint8Array<ArrayBuffer> | string): Uint8Array<ArrayBuffer> =>
  typeof content === 'string' ? new TextEncoder().encode(content) : content;

/** Assimp-backed mesh import kernel. @public */
export const assimpKernel = defineKernel({
  id: 'assimp',
  extensions: [...extensions],
  name: 'AssimpKernel',
  version: '0.1.1',
  exportFormats: { glb: { optionsSchema: glbOptionsSchema } },

  async initialize() {
    return { assimp: await createAssimp() };
  },

  async getDependencies({ entryPath }, { filesystem }) {
    const inventory = await createImportFileInventory(filesystem, entryPath);
    return {
      resolved: [...inventory.resolved],
      unresolved: [...inventory.unresolved],
    };
  },

  async getParameters() {
    return createKernelSuccess(
      createKernelParameterDeclaration(
        {},
        { type: 'object', properties: {}, additionalProperties: false },
        {
          id: 'urn:taucad:assimp:parameters',
          name: 'AssimpParameters',
        },
      ),
    );
  },

  async createGeometry({ entryPath }, { filesystem, fileContentCache, signal }, context: { assimp: Assimp }) {
    signal.throwIfAborted();
    const canonicalEntryPath = assertRootedPath(entryPath);
    const separator = canonicalEntryPath.lastIndexOf('/');
    const directory = separator === -1 ? '' : canonicalEntryPath.slice(0, separator);
    const cachedEntry = fileContentCache.get(canonicalEntryPath);
    const entryBytes = cachedEntry === undefined ? await filesystem.readFile(canonicalEntryPath) : toBytes(cachedEntry);
    const filename = basename(canonicalEntryPath);
    const options = {
      to: 'glb',
      postProcess: [...defaultPostProcess, 'embedTextures'],
      resolve: (name: string): ReturnType<ResolveFile> => {
        const path =
          name.startsWith('/') || uriSchemePattern.test(name)
            ? resolveRootedPath(name)
            : resolveRootedPath(`${directory ? `${directory}/` : ''}${name}`);
        const cached = fileContentCache.get(path);
        if (cached !== undefined) {
          return toBytes(cached);
        }
        return filesystem.readFile(path).catch((error: unknown) => {
          if (isNotFoundError(error)) {
            return undefined;
          }
          throw error;
        });
      },
      signal,
    } satisfies ConvertOptions<'glb'>;
    const { files } = await context.assimp.convert([{ name: filename, bytes: entryBytes }], options);
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
    return finalizeRenderOutput({
      artifacts: [{ format: 'gltf', content: glb }],
      nativeHandle: glb,
    });
  },

  async exportGeometry(input) {
    if (input.nativeHandle.length === 0) {
      return createKernelError([
        {
          message: 'No geometry available for export.',
          code: 'RUNTIME',
          type: 'runtime',
          severity: 'error',
        },
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
