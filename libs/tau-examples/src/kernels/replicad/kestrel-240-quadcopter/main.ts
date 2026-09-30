import { buildAirframe } from './assemblies/airframe.js';
import { buildGimbal } from './assemblies/gimbal.js';
import { buildPropulsion } from './assemblies/propulsion.js';
import { buildAvionics } from './assemblies/avionics.js';

export { mechanism } from './lib/kinematics.js';

export const defaultParams = { pitchDeg: 0, yawDeg: 0 };

export default function main(p: Partial<typeof defaultParams> = defaultParams) {
  const articulation = { ...defaultParams, ...p };
  return [
    ...buildAirframe(),
    ...buildPropulsion(),
    ...buildAvionics(),
    ...buildGimbal(articulation),
  ];
}
