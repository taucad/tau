import { packageVersion } from '@taucad/runtime/metadata';

/**
 * Kernel import extensions the publication runtime routes, pinned against
 * `@taucad/geospec-engine`'s `defaultRuntime` by `publication-runtime.parity.test.ts`.
 * `openrscad` and `zoo` are publication-only: they are served by the hosted runtime, not by
 * the engine's default plugin set. Never hand-edit an extension here — change the plugin.
 */
export const publicationKernelExtensions = [
  { id: 'openrscad', extensions: ['scad'] },
  { id: 'zoo', extensions: ['kcl'] },
  { id: 'replicad', extensions: ['ts', 'js'] },
  { id: 'opencascade', extensions: ['ts', 'js'] },
  { id: 'manifold', extensions: ['ts', 'js'] },
  { id: 'jscad', extensions: ['ts', 'js'] },
  { id: 'gltf', extensions: ['glb', 'gltf'] },
  { id: 'brep', extensions: ['step', 'stp', 'iges', 'igs', 'brep'] },
  { id: 'rhino', extensions: ['3dm'] },
  {
    id: 'assimp',
    extensions: [
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
    ],
  },
] as const;

export const runtimePinFromPackageVersion = (version: string): string => {
  const [major = '0', minor = '0'] = version.split('.');
  return `~${major}.${minor}.0`;
};

export const resolveRuntimePin = (): string => runtimePinFromPackageVersion(packageVersion);

/**
 * Infer kernel identifiers from relative paths using the publication app's runtime catalog.
 */
export const detectKernelIdsFromRelativePaths = (paths: string[]): string[] => {
  const ids = new Set<string>();

  for (const relativePath of paths) {
    const lowerPath = relativePath.toLowerCase();
    for (const kernel of publicationKernelExtensions) {
      if (kernel.extensions.some((extension) => lowerPath.endsWith(`.${extension}`))) {
        ids.add(kernel.id);
      }
    }
  }

  return [...ids].sort((a, b) => a.localeCompare(b));
};
