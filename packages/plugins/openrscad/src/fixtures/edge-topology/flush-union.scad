// The guard against under-merging: two cubes stacked flush. The shared face is
// coplanar, so the union must not draw a seam across it.
union() {
  cube([20, 20, 10]);
  translate([0, 0, 10]) cube([20, 20, 10]);
}
