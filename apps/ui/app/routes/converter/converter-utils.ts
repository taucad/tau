import type { InputFormat, OutputFormat } from '@taucad/converter';
import { isInputFormatSupported } from '@taucad/converter';

/**
 * Extract file format from filename extension
 */
export function getFormatFromFilename(filename: string): InputFormat {
  const extension = filename.split('.').pop()?.toLowerCase();
  
  if (!extension) {
    throw new Error('File has no extension');
  }

  if (!isInputFormatSupported(extension)) {
    throw new Error(`Unsupported file format: .${extension}`);
  }

  return extension as InputFormat;
}

/**
 * Get human-readable display name for format
 */
export function formatDisplayName(format: string): string {
  const formatNames: Record<string, string> = {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- format name
    '3dm': '3D Manufacturing (3DM)',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- format name
    '3ds': '3D Studio (3DS)',
    // eslint-disable-next-line @typescript-eslint/naming-convention -- format name
    '3mf': '3D Manufacturing Format (3MF)',
    ac: 'AC3D (AC)',
    ase: 'Autodesk ASCII (ASE)',
    amf: 'Additive Manufacturing (AMF)',
    brep: 'BREP',
    bvh: 'Biovision Hierarchy (BVH)',
    cob: 'Caligari Object (COB)',
    dae: 'COLLADA (DAE)',
    drc: 'Draco (DRC)',
    dxf: 'Drawing Exchange Format (DXF)',
    fbx: 'Filmbox (FBX)',
    glb: 'GL Transmission Format Binary (GLB)',
    gltf: 'GL Transmission Format (GLTF)',
    ifc: 'Industry Foundation Classes (IFC)',
    iges: 'Initial Graphics Exchange Specification (IGES)',
    igs: 'Initial Graphics Exchange Specification (IGS)',
    lwo: 'LightWave Object (LWO)',
    md2: 'Quake 2 Model (MD2)',
    md5mesh: 'Doom 3 Model (MD5MESH)',
    'mesh.xml': 'Mesh XML',
    nff: 'Neutral File Format (NFF)',
    obj: 'Wavefront Object (OBJ)',
    off: 'Object File Format (OFF)',
    ogex: 'Open Game Engine Exchange (OGEX)',
    ply: 'Polygon File Format (PLY)',
    smd: 'Source Engine Model (SMD)',
    step: 'STEP',
    stl: 'Stereolithography (STL)',
    stp: 'STEP (STP)',
    usda: 'Universal Scene Description ASCII (USDA)',
    usdc: 'Universal Scene Description Crate (USDC)',
    usdz: 'Universal Scene Description ZIP (USDZ)',
    wrl: 'Virtual Reality Modeling Language (WRL)',
    x: 'DirectX (X)',
    x3d: 'Extensible 3D (X3D)',
    x3db: 'Extensible 3D Binary (X3DB)',
    x3dv: 'Extensible 3D VRML (X3DV)',
    xgl: 'XGL',
  };

  return formatNames[format] ?? format.toUpperCase();
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get file extension for output format
 */
export function getFileExtension(format: OutputFormat): string {
  return format;
}

