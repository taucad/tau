import type { Object3D } from 'three';
import type { InputFile, InputFormat } from '#types.js';
import type { ThreeJsBaseLoader } from '#loaders/threejs.base.loader.js';
import { AmfLoader } from '#loaders/amf.loader.js';
import { BvhLoader } from '#loaders/bvh.loader.js';
import { ColladaLoader } from '#loaders/collada.loader.js';
import { DracoLoader } from '#loaders/draco.loader.js';
import { FbxLoader } from '#loaders/fbx.loader.js';
import { GcodeLoader } from '#loaders/gcode.loader.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import { KmzLoader } from '#loaders/kmz.loader.js';
import { LwoLoader } from '#loaders/lwo.loader.js';
import { Md2Loader } from '#loaders/md2.loader.js';
import { ObjLoader } from '#loaders/obj.loader.js';
import { PcdLoader } from '#loaders/pcd.loader.js';
import { PlyLoader } from '#loaders/ply.loader.js';
import { StlLoader } from '#loaders/stl.loader.js';
import { ThreeDmLoader } from '#loaders/3dm.loader.js';
import { ThreeDsLoader } from '#loaders/3ds.loader.js';
import { ThreeMfLoader } from '#loaders/3mf.loader.js';
import { UsdLoader } from '#loaders/usd.loader.js';
import { VoxLoader } from '#loaders/vox.loader.js';
import { VrmlLoader } from '#loaders/vrml.loader.js';
import { VtkLoader } from '#loaders/vtk.loader.js';
import { XyzLoader } from '#loaders/xyz.loader.js';

const loaderFromInputFormat = {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 3dm is a valid format
  '3dm': new ThreeDmLoader(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 3mf is a valid format
  '3mf': new ThreeMfLoader(),
  // eslint-disable-next-line @typescript-eslint/naming-convention -- 3ds is a valid format
  '3ds': new ThreeDsLoader(),
  amf: new AmfLoader(),
  bvh: new BvhLoader(),
  dae: new ColladaLoader(),
  drc: new DracoLoader(),
  fbx: new FbxLoader(),
  gcode: new GcodeLoader(),
  gltf: new GltfLoader(),
  glb: new GltfLoader(),
  kmz: new KmzLoader(),
  lwo: new LwoLoader(),
  md2: new Md2Loader(),
  obj: new ObjLoader(),
  pcd: new PcdLoader(),
  ply: new PlyLoader(),
  stl: new StlLoader(),
  usda: new UsdLoader(),
  usdc: new UsdLoader(),
  usdz: new UsdLoader(),
  vox: new VoxLoader(),
  vtk: new VtkLoader(),
  vtp: new VtkLoader(),
  wrl: new VrmlLoader(),
  xyz: new XyzLoader(),
} as const satisfies Partial<Record<InputFormat, ThreeJsBaseLoader>>;

export type ThreejsImportFormat = keyof typeof loaderFromInputFormat;

export const threejsImportFomats = Object.keys(loaderFromInputFormat) as ThreejsImportFormat[];

export const importThreeJs = async (file: InputFile, format: ThreejsImportFormat): Promise<Object3D> => {
  const loader = loaderFromInputFormat[format];

  const result = await loader.loadAsync(file.data);

  return result;
};
