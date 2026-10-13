/**
 * Planar rigid pose of one part, in millimetres and radians about the gearbox axis.
 * @public
 */
export type PartPose = { readonly x: number; readonly y: number; readonly rotation: number };

/** Planet axes sit on the 96 mm pitch circle at module 2. */
const planetRadius = 48;

/**
 * Rigid pose of an authored part at module 2: fixed ring, sun input, carrier output at a quarter
 * of the sun's turn, and planets (with their bushings) at minus half the sun's turn.
 * Motion is prescribed by the gear ratios, not simulated.
 * @param name - Authored part name.
 * @param sunAngle - Input rotation in radians.
 * @returns The part's pose.
 * @example
 * ```typescript
 * import { partPose } from '@taucad/planetary-gearbox';
 * const carrier = partPose('Carrier Front And Output Hub', 2 * Math.PI); // rotation π/2
 * ```
 * @public
 */
export const partPose = (name: string, sunAngle: number): PartPose => {
  const planet = /^(?:Planet Gear|Flanged Bushing) (\d)$/u.exec(name);
  const carrierAngle = sunAngle / 4;
  if (planet) {
    const bearing = ((Number(planet[1]) - 1) * 2 * Math.PI) / 3 + carrierAngle;
    return { x: planetRadius * Math.cos(bearing), y: planetRadius * Math.sin(bearing), rotation: -sunAngle / 2 };
  }
  return {
    x: 0,
    y: 0,
    rotation: name.startsWith('Internal') ? 0 : name.startsWith('Sun') ? sunAngle : carrierAngle,
  };
};
