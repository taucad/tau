/**
 * Qualification fixture (Tau-authored, no external rights): booleans whose operands are retained and used
 * again afterwards. A boolean that consumed or altered an operand in place (a destructive batch boolean) or a
 * cache that returned a shape sharing state with a retained operand changes a later result, so the history-
 * independence gate fails on it.
 *
 * Replicad booleans and transforms consume their receiver, so model code keeps an operand by cloning it:
 * - `plate` is cloned into two cuts and then used itself, so neither cut may touch it;
 * - `pin` lives at module scope: it is built once per module execution and survives parameter-only rebuilds
 *   that reuse the executed module, so every build clones the same native shape.
 */
import { makeBaseBox, makeCylinder } from 'replicad';

export const defaultParams = { width: 60, hole: 6, offset: 12 };

const pin = makeCylinder(3, 30, [0, 0, -5], [0, 0, 1]);

export default function main(p = defaultParams) {
  const plate = makeBaseBox(p.width, 40, 10);
  const left = plate.clone().cut(makeCylinder(p.hole, 20, [-p.offset, 0, -5], [0, 0, 1]));
  const right = plate.clone().cut(makeCylinder(p.hole, 20, [p.offset, 0, -5], [0, 0, 1]));
  const both = left.intersect(right).fuse(pin.clone().translate([0, 15, 0]));
  return [
    { shape: both, name: 'Both', color: '#79808a' },
    { shape: plate.translate([0, 0, 20]), name: 'Plate', color: '#9aa1ab' },
    { shape: pin.clone().translate([p.width, 0, 0]), name: 'Pin', color: '#5b6470' },
  ];
}
