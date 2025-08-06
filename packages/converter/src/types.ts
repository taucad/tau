export const supportedInputFormats = [
  '3dm',
  '3ds',
  '3mf',
  'amf',
  'brep',
  'bvh',
  'cd',
  'dae',
  'drc',
  'dwg',
  'dxf',
  'exr',
  'fbx',
  'gcode',
  'gdf',
  'glb',
  'gltf',
  'gts',
  'ifc',
  'iges',
  'igs',
  'inc',
  'kmz',
  'ldr',
  'lwo',
  'max',
  'md2',
  'mtl',
  'nrrd',
  'obj',
  'pcd',
  'pdb',
  'ply',
  'pov',
  'rib',
  'shapr',
  'skp',
  'step',
  'stl',
  'stp',
  'svg',
  'udo',
  'usda',
  'usdc',
  'usdz',
  'vda',
  'vox',
  'vtk',
  'vtp',
  'wrl',
  'x_t',
  'x',
  'x3dv',
  'xaml',
  'xgl',
  'xyz',
] as const;

export const supportedOutputFormats = [
  '3dm',
  '3ds',
  '3mf',
  'amf',
  'dae',
  'fbx',
  'glb',
  'gltf',
  'obj',
  'ply',
  'stl',
  'usdz',
] as const;

export type InputFormat = (typeof supportedInputFormats)[number];
export type OutputFormat = (typeof supportedOutputFormats)[number];

export type InputFile = {
  name: string;
  data: Uint8Array;
};

export type ConvertOptions = {
  outputFormat: OutputFormat;
  onProgress?: (progress: number, message: string) => void;
};

export type OutputFile = {
  name: string;
  data: Uint8Array | ArrayBuffer;
};

export const getSupportedInputFormats = (): readonly InputFormat[] => {
  return supportedInputFormats;
};

export const getSupportedOutputFormats = (): readonly OutputFormat[] => {
  return supportedOutputFormats;
};

export const getBaseName = (fileName: string): string => {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex === -1 ? fileName : fileName.slice(0, lastDotIndex);
};

export const getExtension = (fileName: string): InputFormat => {
  const lastDotIndex = fileName.lastIndexOf('.');
  if (lastDotIndex === -1) {
    throw new Error(`File "${fileName}" has no extension`);
  }

  const extension = fileName.slice(lastDotIndex + 1).toLowerCase();

  if (!supportedInputFormats.includes(extension as InputFormat)) {
    throw new Error(
      `Unsupported file format: "${extension}". Supported formats are: ${supportedInputFormats.join(', ')}`,
    );
  }

  return extension as InputFormat;
};

export const isValidInputFormat = (extension: string): extension is InputFormat => {
  return supportedInputFormats.includes(extension.toLowerCase() as InputFormat);
};

export const isValidOutputFormat = (extension: string): extension is OutputFormat => {
  return supportedOutputFormats.includes(extension.toLowerCase() as OutputFormat);
};

export const getOutputFileName = (inputFileName: string, outputFormat: OutputFormat): string => {
  const baseName = getBaseName(inputFileName);
  return `${baseName}.${outputFormat}`;
};
