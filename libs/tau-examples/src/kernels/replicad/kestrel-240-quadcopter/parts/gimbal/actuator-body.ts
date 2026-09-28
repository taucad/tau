import { makeCylinder, type Shape3D } from 'replicad';

// Supplier keep-in cylinder only: torque, winding, encoder and retention are unresolved.
export const defaultParams = { radius: 4.4, length: 4 };
export function buildActuatorBody(p = defaultParams): Shape3D {
  if (p.radius <= 0 || p.length <= 0) {
    throw new Error('Actuator keep-in dimensions must be positive.');
  }
  return makeCylinder(p.radius, p.length);
}
export default function main(p = defaultParams) {
  return buildActuatorBody(p);
}
