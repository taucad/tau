import { makeBaseBox } from 'replicad';
import { face } from '@taucad/runtime/kernels/replicad/annotations';

export default function main() {
  // Boss: x ∈ [-10, 10], y ∈ [-10, 10], z ∈ [0, 40].
  const boss = makeBaseBox(20, 20, 40);

  // L-bracket: vertical arm 2.00 clear of the boss's +X face (x ∈ [12, 20]),
  // top arm 2.00 clear of the boss's top face (z ∈ [42, 50]). The fused AABB
  // spans x ∈ [-10, 20], y ∈ [-10, 10], z ∈ [0, 50] — overlapping the boss everywhere.
  const verticalArm = makeBaseBox(8, 20, 50).translate([16, 0, 0]);
  const topArm = makeBaseBox(30, 20, 8).translate([5, 0, 42]);
  const bracket = verticalArm.fuse(topArm);

  return [
    { shape: boss, name: 'boss', interfaces: { side: face((f) => f.inPlane('YZ', 10)) } },
    { shape: bracket, name: 'bracket', interfaces: { inner: face((f) => f.inPlane('YZ', 12)) } },
  ];
}
