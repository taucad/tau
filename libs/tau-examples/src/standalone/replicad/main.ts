import { drawRectangle } from 'replicad';

export const defaultParams = { width: 20, depth: 10, height: 5, hole: 4 };

export default function main(p = defaultParams) {
  const block = drawRectangle(p.width, p.depth).sketchOnPlane().extrude(p.height);
  const hole = drawRectangle(p.hole, p.hole)
    .translate(3, 0)
    .sketchOnPlane('XY', -p.height)
    .extrude(p.height * 3);
  return block.cut(hole);
}
