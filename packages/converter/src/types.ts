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
  'vox',
  'vtk',
  'vtp',
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

export type InputFile = {
  name: string;
  data: Uint8Array;
};

export type OutputFile = {
  name: string;
  data: Uint8Array;
};

export type ConvertOptions = {
  outputFormat: OutputFormat;
  onProgress?: (progress: number, message: string) => void;
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
