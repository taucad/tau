import type { ShapeConfig } from 'replicad';
import { buildMotorModule } from './motor-module.js';
import { sparAngle } from '../lib/airframe-geometry.js';

export const defaultParams = {};
export const motorStations = [
  { name: 'front-left', x: -85, y: -85, handedness: 'CW' },
  { name: 'front-right', x: -85, y: 85, handedness: 'CCW' },
  { name: 'rear-left', x: 85, y: -85, handedness: 'CCW' },
  { name: 'rear-right', x: 85, y: 85, handedness: 'CW' },
];

export function buildPropulsion(): ShapeConfig[] {
  const prototype = buildMotorModule();
  return motorStations.flatMap(({ name, x, y, handedness }) =>
    prototype.map((part) => {
      let shape = part.shape.clone();
      if (part.name === 'propeller-CW' && handedness === 'CCW') {
        shape = shape.mirror('XZ');
      }
      return {
        ...part,
        shape: shape
          .rotate(sparAngle(Math.sign(x), Math.sign(y)))
          .translate([x, y, 0]),
        name: `${name}/${part.name === 'propeller-CW' ? `propeller-${handedness}` : part.name}`,
      };
    }),
  );
}

export default function main() {
  return buildPropulsion();
}
