// D3 — three coarse cylinders intersected. Each seam runs to tangency at its
// ends, so a per-edge crease gate erodes it; merging patch pairs on their
// maximum dihedral keeps every seam whole.
intersection() {
  cylinder(h = 40, r = 10, center = true, $fn = 16);
  rotate([90, 0, 0]) cylinder(h = 40, r = 10, center = true, $fn = 16);
  rotate([0, 90, 0]) cylinder(h = 40, r = 10, center = true, $fn = 16);
}
