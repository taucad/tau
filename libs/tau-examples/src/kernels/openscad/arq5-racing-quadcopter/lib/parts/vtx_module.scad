$fa = 2;
$fs = 0.4;

module vtx_module() {
  color("#1a1a22")
    hull() {
      cube([16, 12, 4], center = true);
      translate([0, 0, 0])
        cube([18, 14, 2], center = true);
      translate([8, 0, 2])
        sphere(d = 6);
    }
}

vtx_module();
