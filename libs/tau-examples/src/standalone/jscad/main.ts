// @jscad/modeling is CommonJS: Node's ESM loader cannot name its exports, so take them from the default export.
import jscad from '@jscad/modeling';

const { booleans, primitives } = jscad;

export const defaultParams = { width: 20, depth: 10, height: 5, hole: 4 };

export default function main(p = defaultParams) {
  const block = primitives.cuboid({ size: [p.width, p.depth, p.height] });
  const hole = primitives.cuboid({ size: [p.hole, p.hole, p.height * 2], center: [3, 0, 0] });
  return booleans.subtract(block, hole);
}
