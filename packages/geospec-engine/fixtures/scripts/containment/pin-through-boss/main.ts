import { makeBaseBox, makeCylinder } from 'replicad';
import { axis } from '@taucad/replicad/annotations';

export const defaultParams = {
  pinLength: 64, // Mm - full span x ∈ [-32, 32]; 20 reaches only bossA
};

export default function main(p = defaultParams) {
  const alongX = (x: number, radius: number, length: number) => makeCylinder(radius, length, [x, 0, 0], [1, 0, 0]);

  // Two piston bosses and a rod small end; all bores coaxial along X through the origin.
  const bossA = makeBaseBox(16, 30, 30)
    .translate([-22, 0, -15])
    .cut(alongX(-30, 11.03, 16));
  const bossB = makeBaseBox(16, 30, 30)
    .translate([22, 0, -15])
    .cut(alongX(14, 11.03, 16));
  const rod = makeBaseBox(16, 24, 24)
    .translate([0, 0, -12])
    .cut(alongX(-8, 11.025, 16));
  const pin = alongX(-32, 11, p.pinLength);

  const bore = { bore: axis((f) => f.ofSurfaceType('CYLINDRE')) };
  return [
    { shape: bossA, name: 'bossA', interfaces: bore },
    { shape: bossB, name: 'bossB', interfaces: bore },
    { shape: rod, name: 'rodSmallEnd', interfaces: bore },
    { shape: pin, name: 'wristPin', interfaces: { body: axis((f) => f.ofSurfaceType('CYLINDRE')) } },
  ];
}
