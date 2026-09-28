$fa = 2;
$fs = 0.4;

module camera_lens() {
  color("#222228")
    union() {
      rotate([0, 90, 0])
        cylinder(h = 6, d = 14);
      translate([6, 0, 0])
        sphere(d = 8);
    }
}

camera_lens();
