/**
 * Rigid transforms for the frozen example at module 2 and inputAngle 0.
 * @internal
 * @param name - Authored part name.
 * @param sunAngle - Input rotation in radians.
 * @returns Planar rigid pose.
 * @type {(name: string, sunAngle: number) => {x: number, y: number, rotation: number}}
 */
export const partPose = (name, sunAngle) => {
  const planet = /^(?:Planet Gear|Flanged Bushing) (\d)$/u.exec(name);
  const carrierAngle = sunAngle / 4;
  if (planet) {
    const bearing = ((Number(planet[1]) - 1) * 2 * Math.PI) / 3 + carrierAngle;
    return { x: 48 * Math.cos(bearing), y: 48 * Math.sin(bearing), rotation: -sunAngle / 2 };
  }
  return { x: 0, y: 0, rotation: name.startsWith('Internal') ? 0 : name.startsWith('Sun') ? sunAngle : carrierAngle };
};
