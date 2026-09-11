import type { CalculixCantileverJobOptions } from '#calculix-definition.js';

const glbMagic = 0x46_54_6c_67;
const glbVersion = 2;
const jsonChunkType = 0x4e_4f_53_4a;
const binaryChunkType = 0x00_4e_49_42;
const floatComponentType = 5126;
const unsignedShortComponentType = 5123;
const arrayBufferTarget = 34_962;
const elementArrayBufferTarget = 34_963;
const triangleMode = 4;
const positionAttribute = 'POSITION';
const unlitMaterialExtension = 'KHR_materials_unlit';

const padToFourBytes = (length: number): number => Math.ceil(length / 4) * 4;

/**
 * Create a viewer-openable GLB of the authored, undeformed cantilever input volume.
 *
 * This is deliberately not an FRD result conversion and contains no inferred
 * displacement or stress field. Its embedded extras retain that distinction.
 *
 * @internal
 * @param options - Resolved cantilever geometry and solver metadata.
 * @returns A self-contained GLB 2.0 surface mesh in metres.
 */
export const createCalculixCantileverInputGlb = (options: CalculixCantileverJobOptions): Uint8Array<ArrayBuffer> => {
  const positions = new Float32Array([
    0,
    0,
    0,
    options.length,
    0,
    0,
    options.length,
    options.width,
    0,
    0,
    options.width,
    0,
    0,
    0,
    options.height,
    options.length,
    0,
    options.height,
    options.length,
    options.width,
    options.height,
    0,
    options.width,
    options.height,
  ]);
  const indices = new Uint16Array([
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 0, 4, 7, 0, 7, 3, 1, 2, 6, 1, 6, 5,
  ]);
  const positionBytes = new Uint8Array(positions.buffer);
  const indexOffset = padToFourBytes(positionBytes.byteLength);
  const binaryLength = padToFourBytes(indexOffset + indices.byteLength);
  const binary = new Uint8Array(new ArrayBuffer(binaryLength));
  binary.set(positionBytes);
  binary.set(new Uint8Array(indices.buffer), indexOffset);

  const gltf = {
    asset: {
      version: '2.0',
      generator: '@taucad/jobs-solvers',
      extras: {
        solver: `CalculiX ${options.solverVersion}`,
        geometryState: 'undeformed-input',
        source: 'job-parameters',
        coordinateUnit: 'metre',
        deformationApplied: false,
        resultFieldsIncluded: false,
        note: 'Surface mesh of the authored cantilever input volume; not a conversion of CalculiX FRD results.',
      },
    },
    extensionsUsed: [unlitMaterialExtension],
    scene: 0,
    scenes: [{ name: 'CalculiX cantilever input', nodes: [0] }],
    nodes: [{ name: 'Undeformed cantilever input', mesh: 0 }],
    meshes: [
      {
        name: 'Undeformed cantilever input surface',
        primitives: [{ attributes: { [positionAttribute]: 0 }, indices: 1, material: 0, mode: triangleMode }],
        extras: { geometryState: 'undeformed-input', deformationApplied: false },
      },
    ],
    materials: [
      {
        name: 'Undeformed input geometry',
        extensions: { [unlitMaterialExtension]: {} },
        pbrMetallicRoughness: {
          baseColorFactor: [0.18, 0.48, 0.8, 1],
          metallicFactor: 0,
          roughnessFactor: 0.65,
        },
      },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positionBytes.byteLength, target: arrayBufferTarget },
      { buffer: 0, byteOffset: indexOffset, byteLength: indices.byteLength, target: elementArrayBufferTarget },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: floatComponentType,
        count: positions.length / 3,
        type: 'VEC3',
        min: [0, 0, 0],
        max: [options.length, options.width, options.height],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: unsignedShortComponentType,
        count: indices.length,
        type: 'SCALAR',
        min: [0],
        max: [7],
      },
    ],
  };
  const json = Uint8Array.from(new TextEncoder().encode(JSON.stringify(gltf)));
  const jsonLength = padToFourBytes(json.byteLength);
  const totalLength = 12 + 8 + jsonLength + 8 + binary.byteLength;
  const glb = new Uint8Array(new ArrayBuffer(totalLength));
  const view = new DataView(glb.buffer);
  view.setUint32(0, glbMagic, true);
  view.setUint32(4, glbVersion, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, jsonChunkType, true);
  glb.fill(0x20, 20, 20 + jsonLength);
  glb.set(json, 20);
  const binaryHeaderOffset = 20 + jsonLength;
  view.setUint32(binaryHeaderOffset, binary.byteLength, true);
  view.setUint32(binaryHeaderOffset + 4, binaryChunkType, true);
  glb.set(binary, binaryHeaderOffset + 8);
  return glb;
};
