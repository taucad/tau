/* eslint-disable @typescript-eslint/naming-convention -- formats can be valid identifiers */
import type { Object3D } from 'three';
import type { InputFile, InputFormat } from '#types.js';
import type { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { DracoLoader } from '#loaders/draco.loader.js';
import { GcodeLoader } from '#loaders/gcode.loader.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import { KmzLoader } from '#loaders/kmz.loader.js';
import { ThreeDmLoader } from '#loaders/3dm.loader.js';
import { VoxLoader } from '#loaders/vox.loader.js';
import { VtkLoader } from '#loaders/vtk.loader.js';
import { OcctLoader } from '#loaders/occt.loader.js';
import { AssimpLoader } from '#loaders/assimp.loader.js';

const loaderFromInputFormat = {
  '3dm': new ThreeDmLoader(),
  '3ds': new AssimpLoader(),
  '3mf': new AssimpLoader(),
  ac: new AssimpLoader(),
  ase: new AssimpLoader(),
  amf: new AssimpLoader(),
  brep: new OcctLoader(),
  bvh: new AssimpLoader(),
  dae: new AssimpLoader(),
  drc: new DracoLoader(),
  dxf: new AssimpLoader(),
  fbx: new AssimpLoader(),
  gcode: new GcodeLoader(),
  glb: new GltfLoader(),
  gltf: new GltfLoader(),
  ifc: new AssimpLoader(),
  iges: new OcctLoader(),
  igs: new OcctLoader(),
  kmz: new KmzLoader(),
  lwo: new AssimpLoader(),
  md2: new AssimpLoader(),
  md5mesh: new AssimpLoader(),
  'mesh.xml': new AssimpLoader(),
  nff: new AssimpLoader(),
  obj: new AssimpLoader(),
  off: new AssimpLoader(),
  ogex: new AssimpLoader(),
  ply: new AssimpLoader(),
  step: new OcctLoader(),
  stl: new AssimpLoader(),
  stp: new OcctLoader(),
  smd: new AssimpLoader(),
  usda: new AssimpLoader(),
  usdc: new AssimpLoader(),
  usdz: new AssimpLoader(),
  vox: new VoxLoader(),
  vtk: new VtkLoader(),
  vtp: new VtkLoader(),
  wrl: new AssimpLoader(),
  x: new AssimpLoader(),
  x3d: new AssimpLoader(),
  x3db: new AssimpLoader(),
  x3dv: new AssimpLoader(),
  xgl: new AssimpLoader(),

  blend: new AssimpLoader(),
  cd: new AssimpLoader(),
  dwg: new AssimpLoader(),
  gdf: new AssimpLoader(),
  gts: new AssimpLoader(),
  inc: new AssimpLoader(),
  ldr: new AssimpLoader(),
  max: new AssimpLoader(),
  mtl: new AssimpLoader(),
  pdb: new AssimpLoader(),
  rib: new AssimpLoader(),
  shapr: new AssimpLoader(),
  skp: new AssimpLoader(),
  sldprt: new AssimpLoader(),
  svg: new AssimpLoader(),
  udo: new AssimpLoader(),
  vda: new AssimpLoader(),
  x_t: new AssimpLoader(),
  xaml: new AssimpLoader(),
} as const satisfies Record<InputFormat, ThreeJsBaseLoader>;

export type ThreejsImportFormat = keyof typeof loaderFromInputFormat;

export const threejsImportFomats = Object.keys(loaderFromInputFormat) as ThreejsImportFormat[];

export const importThreeJs = async (file: InputFile, format: ThreejsImportFormat): Promise<Object3D> => {
  const loader = loaderFromInputFormat[format];

  loader.initialize({ format });

  const result = await loader.loadAsync(file.data);

  return result;
};
