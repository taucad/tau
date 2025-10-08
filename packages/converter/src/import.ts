/**
 * Lists all supported formats and their loaders.
 *
 * For a list of many 3D file formats, see:
 * @see https://en.wikipedia.org/wiki/List_of_file_formats#Graphics
 */

/* eslint-disable @typescript-eslint/naming-convention -- formats can be valid identifiers */
import type { File, InputFormat } from '#types.js';
import type { BaseLoader } from '#loaders/base.loader.js';
import { DracoLoader } from '#loaders/draco.loader.js';
import { GltfLoader } from '#loaders/gltf.loader.js';
import { ThreeDmLoader } from '#loaders/3dm.loader.js';
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
  cob: new AssimpLoader(),
  dae: new AssimpLoader(),
  drc: new DracoLoader(),
  dxf: new AssimpLoader(),
  fbx: new AssimpLoader(),
  glb: new GltfLoader(),
  gltf: new GltfLoader(),
  ifc: new AssimpLoader(),
  iges: new OcctLoader(),
  igs: new OcctLoader(),
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
  wrl: new AssimpLoader(),
  x: new AssimpLoader(),
  x3d: new AssimpLoader(),
  x3db: new AssimpLoader(),
  x3dv: new AssimpLoader(),
  xgl: new AssimpLoader(),

  // Need fixing
  // kmz: new KmzLoader(),
  // blend: new UnimplementedLoader('Blender .blend files are not supported due to lack of support for newer Blender file formats in the current loader.'),

  // TODO formats
  // dwg: new UnimplementedLoader('AutoCAD .dwg files are not implemented. This proprietary format requires specialized CAD file parsing capabilities.'),
  // gdf: new UnimplementedLoader('Graphics Data Format .gdf files are not implemented. This format requires additional development work.'),
  // gts: new UnimplementedLoader('GNU Triangulated Surface .gts files are not implemented. This format requires specialized mesh processing capabilities.'),
  // inc: new UnimplementedLoader('Include .inc files are not implemented. This format is typically used for data inclusion rather than standalone 3D models.'),
  // ldr: new UnimplementedLoader('LEGO Digital Designer .ldr files are not implemented. This format requires specialized LEGO brick processing capabilities.'),
  // pdb: new UnimplementedLoader('Protein Data Bank .pdb files are not implemented. This format is designed for molecular data, not 3D models.'),
  // udo: new UnimplementedLoader('User Defined Object .udo files are not implemented. This format requires additional development work.'),
  // xaml: new UnimplementedLoader('Extensible Application Markup Language .xaml files are not implemented for 3D model conversion.'),

  // Proprietary formats
  // max: new UnimplementedLoader('3ds Max .max files are not implemented. This proprietary format requires specialized Autodesk file parsing capabilities.'),
  // shapr: new UnimplementedLoader('Shapr3D .shapr files are not implemented. This proprietary format requires specialized CAD file parsing capabilities.'),
  // skp: new UnimplementedLoader('SketchUp .skp files are not implemented. This proprietary format requires specialized SketchUp file parsing capabilities.'),
  // sldprt: new UnimplementedLoader('SolidWorks .sldprt files are not implemented. This proprietary format requires specialized CAD file parsing capabilities.'),
  // x_t: new UnimplementedLoader('Parasolid .x_t files are not implemented. This proprietary format requires specialized CAD kernel integration.'),
} as const satisfies Partial<Record<InputFormat, BaseLoader>>;

export type SupportedImportFormat = keyof typeof loaderFromInputFormat;

export const supportedImportFormats = Object.keys(loaderFromInputFormat) as SupportedImportFormat[];

export const importFiles = async (files: File[], format: SupportedImportFormat): Promise<Uint8Array> => {
  const loader = loaderFromInputFormat[format];

  loader.initialize({ format });

  const result = await loader.loadAsync(files);

  return result;
};
