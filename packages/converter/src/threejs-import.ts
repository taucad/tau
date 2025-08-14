/* eslint-disable @typescript-eslint/naming-convention -- formats can be valid identifiers */
import type { Object3D } from 'three';
import type { InputFile, InputFormat } from '#types.js';
import type { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { DracoLoader } from '#loaders/draco.loader.js';
import { GcodeLoader } from '#loaders/gcode.loader.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import { KmzLoader } from '#loaders/kmz.loader.js';
import { PcdLoader } from '#loaders/pcd.loader.js';
import { ThreeDmLoader } from '#loaders/3dm.loader.js';
import { VoxLoader } from '#loaders/vox.loader.js';
import { VtkLoader } from '#loaders/vtk.loader.js';
import { XyzLoader } from '#loaders/xyz.loader.js';
import { OcctLoader } from '#loaders/occt.loader.js';
import { AssimpLoader } from '#loaders/assimp.loader.js';

const loaderFromInputFormat = {
  '3dm': new ThreeDmLoader(),
  '3mf': new AssimpLoader(),
  '3ds': new AssimpLoader(),
  amf: new AssimpLoader(),
  bvh: new AssimpLoader(),
  dae: new AssimpLoader(),
  drc: new DracoLoader(),
  fbx: new AssimpLoader(),
  gcode: new GcodeLoader(),
  gltf: new GltfLoader(),
  glb: new GltfLoader(),
  kmz: new KmzLoader(),
  lwo: new AssimpLoader(),
  md2: new AssimpLoader(),
  obj: new AssimpLoader(),
  pcd: new PcdLoader(),
  ply: new AssimpLoader(),
  stl: new AssimpLoader(),
  step: new OcctLoader(),
  stp: new OcctLoader(),
  iges: new OcctLoader(),
  igs: new OcctLoader(),
  brep: new OcctLoader(),
  usda: new AssimpLoader(),
  usdc: new AssimpLoader(),
  usdz: new AssimpLoader(),
  vox: new VoxLoader(),
  vtk: new VtkLoader(),
  vtp: new VtkLoader(),
  wrl: new AssimpLoader(),
  xyz: new XyzLoader(),
  off: new AssimpLoader(),
  x: new AssimpLoader(),
  dxf: new AssimpLoader(),
  x3d: new AssimpLoader(),
  x3db: new AssimpLoader(),
  x3dv: new AssimpLoader(),
  ifc: new AssimpLoader(),

  blend: new AssimpLoader(),
  cd: new AssimpLoader(),
  dwg: new AssimpLoader(),
  exr: new AssimpLoader(),
  gdf: new AssimpLoader(),
  gts: new AssimpLoader(),
  inc: new AssimpLoader(),
  ldr: new AssimpLoader(),
  max: new AssimpLoader(),
  mtl: new AssimpLoader(),
  udo: new AssimpLoader(),
  pov: new AssimpLoader(),
  rib: new AssimpLoader(),
  nrrd: new AssimpLoader(),
  pdb: new AssimpLoader(),
  shapr: new AssimpLoader(),
  sldprt: new AssimpLoader(),
  skp: new AssimpLoader(),
  svg: new AssimpLoader(),
  vda: new AssimpLoader(),
  x_t: new AssimpLoader(),
  xaml: new AssimpLoader(),
  xgl: new AssimpLoader(),
} as const satisfies Record<InputFormat, ThreeJsBaseLoader>;

export type ThreejsImportFormat = keyof typeof loaderFromInputFormat;

export const threejsImportFomats = Object.keys(loaderFromInputFormat) as ThreejsImportFormat[];

export const importThreeJs = async (file: InputFile, format: ThreejsImportFormat): Promise<Object3D> => {
  const loader = loaderFromInputFormat[format];

  loader.initialize({ format });

  const result = await loader.loadAsync(file.data);

  return result;
};
