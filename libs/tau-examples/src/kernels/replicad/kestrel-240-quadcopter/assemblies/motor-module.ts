import type { ShapeConfig } from 'replicad';
import { buildMotorBase } from '../parts/propulsion/motor-base.js';
import { buildMotorStator } from '../parts/propulsion/motor-stator.js';
import { buildMotorBell } from '../parts/propulsion/motor-bell.js';
import { buildMotorShaft } from '../parts/propulsion/motor-shaft.js';
import { buildMotorBearing } from '../parts/propulsion/motor-bearing.js';
import { buildMotorScrew } from '../parts/propulsion/motor-screw.js';
import { buildPropeller } from '../parts/propulsion/propeller.js';
import { buildPropNut as buildPropertyNut } from '../parts/propulsion/prop-nut.js';

export const defaultParams = { handedness: 'CW' };

export function buildMotorModule(p = defaultParams): ShapeConfig[] {
  const bearing = buildMotorBearing(),
    screw = buildMotorScrew();
  return [
    {
      shape: buildMotorBase().translate([0, 0, 7]),
      name: 'motor-base',
      color: '#252b33',
      metalness: 0.7,
      roughness: 0.35,
    },
    {
      shape: buildMotorStator().translate([0, 0, 12.4]),
      name: 'motor-stator-envelope',
      color: '#b77539',
      metalness: 0.8,
      roughness: 0.28,
    },
    {
      shape: buildMotorBell().translate([0, 0, 12.3]),
      name: 'motor-bell-envelope',
      color: '#20242b',
      metalness: 0.75,
      roughness: 0.26,
    },
    {
      shape: buildMotorShaft().translate([0, 0, 10]),
      name: 'motor-shaft',
      color: '#b8c1ca',
      metalness: 0.95,
      roughness: 0.18,
    },
    ...[12.5, 27.5].map((z, index) => ({
      shape: bearing.clone().translate([0, 0, z]),
      name: `motor-bearing-${index + 1}`,
      color: '#8c98a3',
      metalness: 0.9,
    })),
    {
      shape: buildPropeller(p).translate([0, 0, 38]),
      name: `propeller-${p.handedness}`,
      color: '#ff4e16',
      metalness: 0.05,
      roughness: 0.28,
    },
    {
      shape: buildPropertyNut().translate([0, 0, 40.5]),
      name: 'prop-nut',
      color: '#d49244',
      metalness: 0.85,
      roughness: 0.22,
    },
    ...[-8, 8].flatMap((x, index) =>
      [-8, 8].map((y, index_) => ({
        shape: screw.clone().translate([x, y, 1]),
        name: `motor-screw-${index * 2 + index_ + 1}`,
        color: '#77818e',
        metalness: 0.9,
      })),
    ),
  ];
}

export default function main(p = defaultParams) {
  return buildMotorModule(p).map((part) => ({
    ...part,
    name: `motor-module/${part.name}`,
  }));
}
