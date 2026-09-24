/* eslint-disable @typescript-eslint/naming-convention -- glTF extension keys use standardized names. */
import { draw, drawCircle } from 'replicad';
import type { Model, Material } from '@taucad/replicad/model';

export const defaultParams = {
  diameter: 280,
  height: 145,
  wallThickness: 1.2,
  roughness: 0.24,
  anisotropy: 0.85,
  brushRotation: 0,
  clearcoat: 0.3,
  glassRoughness: 0.07,
  lightStrength: 4,
};

/** Spun copper shade, porcelain socket and hollow glass globe. Dimensions are millimetres. */
export default function main(p = defaultParams): Model {
  const radius = p.diameter / 2;
  const neck = 20;
  const copper: Material = {
    name: 'Brushed copper',
    pbrMetallicRoughness: {
      baseColorFactor: [0.955, 0.638, 0.538, 1],
      metallicFactor: 1,
      roughnessFactor: p.roughness,
    },
    extensions: {
      KHR_materials_anisotropy: {
        anisotropyStrength: p.anisotropy,
        anisotropyRotation: p.brushRotation,
      },
      KHR_materials_clearcoat: {
        clearcoatFactor: p.clearcoat,
        clearcoatRoughnessFactor: 0.16,
      },
    },
  };
  // The bell is a revolved outer form, shelled inward with both openings removed.
  const shade = draw([0, 0])
    .lineTo([radius, 0])
    .threePointsArcTo([neck, p.height], [radius * 0.8, p.height * 0.65])
    .lineTo([0, p.height])
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .shell(-p.wallThickness, (finder) =>
      finder.either([
        (face) => face.inPlane('XY', 0),
        (face) => face.inPlane('XY', p.height),
      ]),
    );
  const collar = draw([neck - p.wallThickness, p.height])
    .hLine(3.2)
    .vLine(18)
    .hLine(-3.2)
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .chamfer(0.4, (edge) => edge.inPlane('XY', p.height + 18));
  const socket = draw([13.2, p.height - 35])
    .hLine(3.8)
    .vLine(38)
    .hLineTo(5)
    .vLineTo(p.height - 15)
    .hLineTo(13.2)
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .fillet(0.6);
  const cord = drawCircle(2.5)
    .sketchOnPlane('XY', p.height + 3)
    .extrude(110);
  const bulbTop = p.height - 36;
  const glass = draw([0, bulbTop - 74])
    .hLine(0.1)
    .threePointsArcTo([12, bulbTop - 16], [29, bulbTop - 41])
    .lineTo([12, bulbTop])
    .lineTo([0, bulbTop])
    .close()
    .sketchOnPlane('XZ')
    .revolve()
    .shell(-0.8, (finder) => finder.inPlane('XY', bulbTop));
  const bulbCap = draw([10, bulbTop - 3])
    .hLine(3)
    .vLine(10)
    .hLine(-3)
    .close()
    .sketchOnPlane('XZ')
    .revolve();
  const filament = drawCircle(1)
    .sketchOnPlane('XY', bulbTop - 58)
    .extrude(37);

  return {
    shapes: [
      { name: 'Spun copper shade', shape: shade, material: copper },
      {
        name: 'Copper neck collar',
        shape: collar,
        material: {
          ...copper,
          name: 'Polished copper collar',
          pbrMetallicRoughness: {
            ...copper.pbrMetallicRoughness,
            roughnessFactor: 0.13,
          },
          extensions: {
            KHR_materials_clearcoat: {
              clearcoatFactor: 0.65,
              clearcoatRoughnessFactor: 0.1,
            },
          },
        },
      },
      {
        name: 'Porcelain socket',
        shape: socket,
        material: {
          name: 'Glazed porcelain',
          pbrMetallicRoughness: {
            baseColorFactor: [0.82, 0.79, 0.72, 1],
            metallicFactor: 0,
            roughnessFactor: 0.3,
          },
          extensions: {
            KHR_materials_clearcoat: {
              clearcoatFactor: 1,
              clearcoatRoughnessFactor: 0.08,
            },
          },
        },
      },
      {
        name: 'Fabric suspension cord',
        shape: cord,
        material: {
          name: 'Charcoal fabric',
          pbrMetallicRoughness: {
            baseColorFactor: [0.018, 0.02, 0.023, 1],
            metallicFactor: 0,
            roughnessFactor: 0.85,
          },
          extensions: {
            KHR_materials_sheen: {
              sheenColorFactor: [0.2, 0.21, 0.23],
              sheenRoughnessFactor: 0.8,
            },
          },
        },
      },
      {
        name: 'Hollow glass globe',
        shape: glass,
        material: {
          name: 'Clear warm glass',
          pbrMetallicRoughness: {
            baseColorFactor: [1, 1, 1, 1],
            metallicFactor: 0,
            roughnessFactor: p.glassRoughness,
          },
          extensions: {
            KHR_materials_transmission: { transmissionFactor: 1 },
            KHR_materials_ior: { ior: 1.5 },
            KHR_materials_volume: {
              thicknessFactor: 0.0008,
              attenuationColor: [1, 0.95, 0.84],
              attenuationDistance: 0.02,
            },
            KHR_materials_dispersion: { dispersion: 0.03 },
          },
        },
      },
      {
        name: 'Bulb cap',
        shape: bulbCap,
        material: {
          name: 'Nickel cap',
          pbrMetallicRoughness: {
            baseColorFactor: [0.58, 0.56, 0.5, 1],
            metallicFactor: 1,
            roughnessFactor: 0.3,
          },
        },
      },
      ...[-1, 1].map((side) => ({
        name: side < 0 ? 'Left LED filament' : 'Right LED filament',
        shape: filament.clone().translate([side * 9, 0, 0]),
        material: {
          name: 'Warm LED',
          pbrMetallicRoughness: {
            baseColorFactor: [1, 0.65, 0.19, 1],
            metallicFactor: 0,
            roughnessFactor: 0.7,
          },
          emissiveFactor: [1, 0.55, 0.15],
          extensions: {
            KHR_materials_emissive_strength: {
              emissiveStrength: p.lightStrength,
            },
          },
        },
      })),
    ],
  };
}
