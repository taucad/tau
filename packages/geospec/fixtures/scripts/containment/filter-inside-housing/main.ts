import { makeCylinder } from 'replicad';
import { axis } from 'replicad/annotations';

// Audit rows `containment.filter-inside-housing-positive`,
// `containment.sidewall-intersection-negative` (axisOffset 5 pierces the
// cavity wall while the cartridge AABB stays inside the housing AABB), and
// `containment.aabb-inside-false-positive` (cornerPlacement puts a small
// cartridge in the housing AABB's corner region — fully inside the target
// AABB yet entirely outside the cylindrical housing volume).
export const defaultParams = {
  axisOffset: 0, // Mm - cartridge axis offset along +X
  cornerPlacement: false, // True: small cartridge at the AABB corner, outside the housing solid
};

export default function main(p = defaultParams) {
  // Housing: open cup — outer r30, z ∈ [0, 60]; cavity r27 open at the top,
  // z ∈ [3, 60] (3 mm side walls and floor). A fully closed internal void
  // currently loses its subshape name through the reader (recorded SB1
  // finding in the SB5 Implementation Status), so the cup form carries the
  // authored cavity interface.
  const housing = makeCylinder(30, 60).cut(makeCylinder(27, 57, [0, 0, 3]));

  // Cartridge: r24, z ∈ [6, 54] — radial clearance 3.0 and floor/top
  // clearance 3.0, all inside the audit's [1.0, 4.0] band.
  const cartridge = p.cornerPlacement ? makeCylinder(2, 10, [27, 27, 20]) : makeCylinder(24, 48, [p.axisOffset, 0, 6]);

  return [
    {
      shape: housing,
      name: 'housing',
      interfaces: { cavity: axis((f) => f.ofSurfaceType('CYLINDRE').containsPoint([27, 0, 30])) },
    },
    {
      shape: cartridge,
      name: 'cartridge',
      interfaces: { body: axis((f) => f.ofSurfaceType('CYLINDRE')) },
    },
  ];
}
