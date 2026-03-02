import type { geometries } from '@jscad/modeling';
import { primitives } from '@jscad/modeling';

type Geom3 = geometries.geom3.Geom3;

const { cube } = primitives;

export const defaultParams = {
  size: 20,
};

export default function main(
  p = defaultParams,
): Geom3 {
  return cube({ size: p.size });
}
