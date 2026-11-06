// Cube with a through cylinder cutout and all 12 edges chamfered.
$fa = 2;
$fs = 0.4;

size = 40;      // cube edge length (mm)
chamfer = 3;    // 45° edge chamfer leg (mm)
bore_d = 20;    // through-bore diameter along Z (mm)

// Octagonal section: a square of side `l` with its four corners cut by `c`.
module chamfer_octagon(l, c) {
  h = l / 2;
  polygon([
    [ h,     h - c], [ h - c,  h], [-h + c,  h], [-h,     h - c],
    [-h,    -h + c], [-h + c, -h], [ h - c, -h], [ h,    -h + c]
  ]);
}

// Chamfered block = intersection of three octagonal prisms, one per axis.
// Each prism chamfers the four edges parallel to its extrusion axis.
module chamfered_block(l, c) {
  intersection() {
    linear_extrude(height = l, center = true) chamfer_octagon(l, c);
    rotate([90, 0, 90]) linear_extrude(height = l, center = true) chamfer_octagon(l, c);
    rotate([90, 0, 0]) linear_extrude(height = l, center = true) chamfer_octagon(l, c);
  }
}

module chamfered_cube_cutout() {
  difference() {
    chamfered_block(size, chamfer);
    cylinder(h = size + 2, d = bore_d, center = true, $fn = 96);
  }
}

chamfered_cube_cutout();
