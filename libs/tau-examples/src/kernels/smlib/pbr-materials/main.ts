/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Pos), as in build123d. */
import {
  Align,
  Box,
  Cone,
  Cylinder,
  Pos,
  Sphere,
  Torus,
  Z,
} from '@classcad/smlibwasm';
import type { Material, Model } from '@taucad/smlib/model';

export const defaultParams = {
  spacing: 34,
  glassIor: 1.5,
  clearcoat: 1,
  brushStrength: 0.8,
  glowStrength: 4,
};

const validate = (p: typeof defaultParams): void => {
  if (!Number.isFinite(p.spacing) || p.spacing < 28 || p.spacing > 60) {
    throw new RangeError('spacing must be in [28, 60] mm.');
  }
  if (!Number.isFinite(p.glassIor) || p.glassIor < 1 || p.glassIor > 2.5) {
    throw new RangeError('glassIor must be in [1, 2.5].');
  }
  for (const [name, value] of [
    ['clearcoat', p.clearcoat],
    ['brushStrength', p.brushStrength],
  ] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new RangeError(`${name} must be in [0, 1].`);
    }
  }
  if (!Number.isFinite(p.glowStrength) || p.glowStrength < 1) {
    throw new RangeError('glowStrength must be at least 1.');
  }
};

/** Matte slate: a rough dielectric for the plinth. */
const slate: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.05, 0.055, 0.06, 1],
    metallicFactor: 0,
    roughnessFactor: 0.85,
  },
};

const brushedSteel = (strength: number): Material => ({
  pbrMetallicRoughness: {
    baseColorFactor: [0.75, 0.76, 0.78, 1],
    metallicFactor: 1,
    roughnessFactor: 0.3,
  },
  extensions: {
    KHR_materials_anisotropy: { anisotropyStrength: strength },
  },
});

const carPaint = (clearcoat: number): Material => ({
  pbrMetallicRoughness: {
    baseColorFactor: [0.45, 0.01, 0.02, 1],
    metallicFactor: 0.4,
    roughnessFactor: 0.45,
  },
  extensions: {
    KHR_materials_clearcoat: {
      clearcoatFactor: clearcoat,
      clearcoatRoughnessFactor: 0.04,
    },
  },
});

const glass = (ior: number): Material => ({
  pbrMetallicRoughness: {
    baseColorFactor: [0.92, 0.97, 1, 1],
    metallicFactor: 0,
    roughnessFactor: 0.02,
  },
  extensions: {
    KHR_materials_transmission: { transmissionFactor: 1 },
    KHR_materials_ior: { ior },
    // Volume distances are metres; the block is about 24 mm thick.
    KHR_materials_volume: {
      thicknessFactor: 0.024,
      attenuationDistance: 0.05,
      attenuationColor: [0.75, 0.95, 0.9],
    },
  },
});

const gold: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [1, 0.77, 0.34, 1],
    metallicFactor: 1,
    roughnessFactor: 0.12,
  },
};

const velvet: Material = {
  pbrMetallicRoughness: {
    baseColorFactor: [0.12, 0.03, 0.25, 1],
    metallicFactor: 0,
    roughnessFactor: 0.9,
  },
  extensions: {
    KHR_materials_sheen: {
      sheenColorFactor: [0.75, 0.55, 1],
      sheenRoughnessFactor: 0.4,
    },
  },
};

const glow = (strength: number): Material => ({
  pbrMetallicRoughness: {
    baseColorFactor: [0.1, 0.6, 0.55, 1],
    metallicFactor: 0,
    roughnessFactor: 0.5,
  },
  emissiveFactor: [0.1, 1, 0.85],
  extensions: {
    KHR_materials_emissive_strength: { emissiveStrength: strength },
  },
});

/**
 * Six specimens on a slate plinth, one standard glTF material each: brushed steel (anisotropy),
 * clear-coated paint, glass (transmission, IOR and volume), polished gold, velvet (sheen) and a
 * glowing ring (emissive strength).
 */
export default function main(p = defaultParams): Model {
  validate(p);
  const standing = [Align.CENTER, Align.CENTER, Align.MIN];
  const top = 6;
  const s = p.spacing;
  const columns = [-s, 0, s];
  const rows = [s / 2, -s / 2];
  const at = (column: number, row: number) =>
    Pos(columns[column], rows[row], top);

  let plinth = Box(s * 3 + 10, s * 2 + 10, top, { align: standing });
  plinth = plinth.fillet(plinth.edges().parallelTo(Z), 6);
  plinth = plinth.fillet(plinth.edges().maxBy(Z), 1.5);

  const steel = Cylinder(10, 26, { align: standing });
  const sphere = Sphere(12, { align: standing });
  let block = Box(22, 22, 24, { align: standing });
  block = block.fillet(block.edges(), 2);
  let ingot = Box(24, 14, 10, { align: standing });
  ingot = ingot.chamfer(ingot.edges().maxBy(Z), 2.5);
  const cone = Cone(12, 3, 24, { align: standing });
  const ring = Torus(10, 3, { align: standing });

  return {
    shapes: [
      { name: 'Plinth', shape: plinth, material: slate },
      {
        name: 'Brushed steel',
        shape: at(0, 0).mul(steel),
        material: brushedSteel(p.brushStrength),
      },
      {
        name: 'Clear-coated paint',
        shape: at(1, 0).mul(sphere),
        material: carPaint(p.clearcoat),
      },
      {
        name: 'Glass',
        shape: at(2, 0).mul(block),
        material: glass(p.glassIor),
      },
      { name: 'Polished gold', shape: at(0, 1).mul(ingot), material: gold },
      { name: 'Velvet', shape: at(1, 1).mul(cone), material: velvet },
      {
        name: 'Glowing ring',
        shape: at(2, 1).mul(ring),
        material: glow(p.glowStrength),
      },
    ],
  };
}
