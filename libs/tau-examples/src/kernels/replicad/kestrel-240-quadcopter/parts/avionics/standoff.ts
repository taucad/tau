import { makeCylinder } from 'replicad';

export const defaultParams = { height: 7.4 };

/** M2 clearance spacer; lower 3.4 mm and inter-board 7.4 mm occurrences. */
export function buildStandoff(p = defaultParams) {
  if (!Number.isFinite(p.height) || p.height <= 0 || p.height > 20) {
    throw new Error('Standoff height must be 0 < height <= 20 mm.');
  }
  return makeCylinder(2.4, p.height).cut(
    makeCylinder(1.1, p.height + 0.2, [0, 0, -0.1]),
  );
}

export default function main(p = defaultParams) {
  return [
    {
      shape: buildStandoff(p),
      name: `M2-spacer-${p.height}mm`,
      color: '#737c87',
      metalness: 0.65,
      roughness: 0.35,
    },
  ];
}
