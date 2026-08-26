import { makeBaseBox, makeCylinder } from 'replicad';

export default function main() {
  const plate = makeBaseBox(80, 40, 10)
    .fuse(makeCylinder(6, 15, [-20, 0, 10]))
    .fuse(makeCylinder(6, 15, [20, 0, 10]));

  return [{ shape: plate, name: 'twinBosses' }];
}
