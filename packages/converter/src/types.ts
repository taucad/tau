export const supportedInputFormats = [
  '3dm',
  '3ds',
  '3mf',
  'ac',
  'ase',
  'amf',
  'brep',
  'bvh',
  'cob',
  'dae',
  'drc',
  'dxf',
  'fbx',
  'glb',
  'gltf',
  'ifc',
  'iges',
  'igs',
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
  'step',
  'stl',
  'stp',
  'usda',
  'usdc',
  'usdz',
  'wrl',
  'x',
  'x3d',
  'x3db',
  'x3dv',
  'xgl',
] as const;

export const supportedOutputFormats = [
  '3ds',
  'dae',
  'fbx',
  'glb',
  'gltf',
  'obj',
  'ply',
  'stl',
  'stp',
  'x',
  'x3d',
] as const;

export type InputFormat = (typeof supportedInputFormats)[number];
export type OutputFormat = (typeof supportedOutputFormats)[number];

export type File = {
  name: string;
  data: Uint8Array;
};
