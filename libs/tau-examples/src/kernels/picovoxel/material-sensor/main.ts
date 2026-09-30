import type { Pico } from 'picovoxel';
import { BaseBox, localFrame } from 'picovoxel/shapekernel';
import type { PicovoxelModel } from '@taucad/picovoxel';

export const defaultParams = { voxelSize: 0.75 };

// Original 8×8 painted stripe PNG; encoded bytes, not raw pixels or a remote asset.
const finishPng = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 8, 0,
  0, 0, 8, 8, 2, 0, 0, 0, 75, 109, 41, 220, 0, 0, 0, 9, 112, 72, 89, 115, 0, 0,
  3, 232, 0, 0, 3, 232, 1, 181, 123, 82, 107, 0, 0, 0, 25, 73, 68, 65, 84, 120,
  156, 99, 224, 51, 182, 225, 51, 182, 177, 171, 106, 132, 35, 136, 8, 195, 208,
  146, 0, 0, 86, 227, 54, 193, 187, 252, 193, 135, 0, 0, 0, 0, 73, 69, 78, 68,
  174, 66, 96, 130,
]);

export default function main(pico: Pico): PicovoxelModel {
  const enclosure = new BaseBox(
    localFrame.create([0, 0, 0]),
    24,
    32,
    20,
  ).voxConstruct(pico);
  const lens = pico.createVoxels({
    shape: 'sphere',
    center: [0, -11, 15],
    radius: 5,
  });
  const connector = pico.createVoxels({
    shape: 'beam',
    start: [0, 10, 10],
    end: [0, 19, 10],
    radius: 3,
  });
  return {
    images: [
      { name: 'Painted stripes', mimeType: 'image/png', data: finishPng },
    ],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [
      { wrapS: 10_497, wrapT: 10_497, magFilter: 9729, minFilter: 9987 },
    ],
    shapes: [
      {
        shape: enclosure,
        name: 'Painted enclosure',
        material: {
          pbrMetallicRoughness: {
            metallicFactor: 0.25,
            roughnessFactor: 0.38,
            baseColorTexture: {
              index: 0,
              extensions: { KHR_texture_transform: { scale: [2, 2] } },
            },
          },
          extensions: {
            KHR_materials_clearcoat: {
              clearcoatFactor: 0.8,
              clearcoatRoughnessFactor: 0.2,
            },
          },
        },
      },
      {
        shape: lens,
        name: 'Glass lens',
        material: {
          pbrMetallicRoughness: {
            baseColorFactor: [0.9, 0.98, 1, 1],
            metallicFactor: 0,
            roughnessFactor: 0.1,
          },
          extensions: {
            KHR_materials_transmission: { transmissionFactor: 0.9 },
            KHR_materials_ior: { ior: 1.5 },
            KHR_materials_volume: {
              thicknessFactor: 0.003,
              attenuationDistance: 0.04,
              attenuationColor: [0.7, 0.95, 1],
            },
          },
        },
      },
      {
        shape: connector,
        name: 'Brushed connector',
        material: {
          pbrMetallicRoughness: {
            baseColorFactor: [0.65, 0.36, 0.13, 1],
            metallicFactor: 1,
            roughnessFactor: 0.3,
          },
          extensions: {
            KHR_materials_anisotropy: {
              anisotropyStrength: 0.65,
              anisotropyRotation: Math.PI / 2,
            },
          },
        },
      },
    ],
  };
}
