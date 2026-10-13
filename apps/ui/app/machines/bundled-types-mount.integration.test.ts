// @vitest-environment node
import { authoringTypeMaps, geospecTypes } from '@taucad/api-extractor/authoring-types';
import {
  jscadModelingTypes,
  kernelTypePackageMaps,
  manifoldTypes,
  opencascadeTypes,
  picovoxelTypes,
} from '@taucad/api-extractor/kernel-types';
import { ChangeEventBus, MountTable, ProviderRegistry, ResourceQueue, WorkspaceFileService } from '@taucad/filesystem';
import { populateBundledTypesMount } from '#machines/bundled-types-mount.js';
import { describe, expect, it } from 'vitest';

const createMemoryFileService = async (): Promise<WorkspaceFileService> => {
  const providerRegistry = new ProviderRegistry();
  const mountTable = new MountTable();
  const storageRootKey = 'memory:bundled-types';
  mountTable.mount('/', await providerRegistry.getProvider({ backend: 'memory', storageRootKey }), {
    class: 'authored',
    backend: 'memory',
    storageRootKey,
  });
  const nodeModulesRootKey = 'memory:bundled-types-node-modules';
  mountTable.mount(
    '/node_modules',
    await providerRegistry.getProvider({ backend: 'memory', storageRootKey: nodeModulesRootKey }),
    {
      class: 'derived',
      backend: 'memory',
      storageRootKey: nodeModulesRootKey,
      providerBasePath: 'tau-node-modules',
    },
  );
  return new WorkspaceFileService({
    providerRegistry,
    resourceQueue: new ResourceQueue(),
    eventBus: new ChangeEventBus(),
    mountTable,
  });
};

describe('bundled kernel types mount', () => {
  it('should mount the generated packages under their canonical package roots', async () => {
    const fileService = await createMemoryFileService();
    try {
      const payload = [...kernelTypePackageMaps, ...authoringTypeMaps].flatMap((typesMap) =>
        Object.entries(typesMap).map(([packageName, entry]) => ({
          packageName,
          content: entry.content,
          files: entry.files,
          packageJson: entry.packageJson,
        })),
      );
      await populateBundledTypesMount(fileService.createRootedFileSystem('/node_modules'), payload);

      await expect(fileService.readFile('/node_modules/@jscad/modeling/index.d.ts', 'utf8')).resolves.toBe(
        jscadModelingTypes['@jscad/modeling'],
      );
      await expect(fileService.readFile('/node_modules/@jscad/modeling/colors/index.d.ts', 'utf8')).resolves.toBe(
        jscadModelingTypes['@jscad/modeling/colors'],
      );
      await expect(fileService.readFile('/node_modules/manifold-3d/manifoldCAD/index.d.ts', 'utf8')).resolves.toBe(
        manifoldTypes['manifold-3d/manifoldCAD'],
      );
      await expect(fileService.readFile('/node_modules/libcascade/index.d.ts', 'utf8')).resolves.toBe(
        opencascadeTypes['libcascade'],
      );
      const picovoxelPackage = picovoxelTypes['picovoxel'];
      if (picovoxelPackage === undefined) {
        throw new TypeError('Generated PicoVoxel declarations are missing.');
      }
      await expect(fileService.readFile('/node_modules/picovoxel/index.d.ts', 'utf8')).resolves.toBe(
        picovoxelPackage.content,
      );
      await expect(fileService.readFile('/node_modules/picovoxel/shapekernel.d.ts', 'utf8')).resolves.toBe(
        picovoxelPackage.files?.['shapekernel.d.ts'],
      );
      // Unbundled declarations keep picovoxel's directories, so relative imports resolve in the editor.
      await expect(fileService.readFile('/node_modules/picovoxel/shapekernel/baseBox.d.ts', 'utf8')).resolves.toBe(
        picovoxelPackage.files?.['shapekernel/baseBox.d.ts'],
      );
      // Session internals and the untyped three bridge are not authoring surface.
      await expect(fileService.exists('/node_modules/picovoxel/multi.d.ts')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/picovoxel/raw.d.ts')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/picovoxel/three.d.ts')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/opencascade/index.d.ts')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/opencascade.js/index.d.ts')).resolves.toBe(false);

      const geospecPackage = geospecTypes['geospec'];
      const geospecRunnerNative = geospecPackage?.files?.['runner/native/index.d.ts'];
      if (geospecRunnerNative === undefined) {
        throw new TypeError('Generated GeoSpec runner/native declarations are missing.');
      }
      await expect(fileService.readFile('/node_modules/geospec/runner/native/index.d.ts', 'utf8')).resolves.toBe(
        geospecRunnerNative,
      );

      await Promise.all(
        [
          'libcascade',
          'replicad',
          '@jscad/modeling',
          'manifold-3d',
          'picovoxel',
          'geospec',
          '@taucad/kinematics',
          '@taucad/spatial',
        ].map(async (packageName) => {
          const packageJson = await fileService.readFile(`/node_modules/${packageName}/package.json`, 'utf8');
          if (typeof packageJson !== 'string') {
            throw new TypeError(`Expected text package metadata for ${packageName}`);
          }
          expect(JSON.parse(packageJson)).toMatchObject({ name: packageName });
        }),
      );
      await expect(fileService.exists('/node_modules/@jscad/modeling/colors/package.json')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/manifold-3d/manifoldCAD/package.json')).resolves.toBe(false);
      await expect(fileService.exists('/node_modules/geospec/runner/native/package.json')).resolves.toBe(false);
    } finally {
      fileService.dispose();
    }
  });
});
