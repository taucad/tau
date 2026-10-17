/* oxlint-disable eslint/new-cap -- smlibwasm's shape constructors are functions (Box, Pos), as in build123d. */
import { Box, Pos } from '@classcad/smlibwasm';

export const defaultParams = { width: 20, depth: 10, height: 5, hole: 4 };

// Planar faces only, so Tau's tessellation and the native one enclose the same volume exactly.
export default function main(p = defaultParams) {
  const block = Box(p.width, p.depth, p.height);
  const hole = Pos(3, 0, 0).mul(Box(p.hole, p.hole, p.height * 3));
  return block.cut(hole);
}
