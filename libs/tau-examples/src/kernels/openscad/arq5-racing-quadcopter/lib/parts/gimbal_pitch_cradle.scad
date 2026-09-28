$fa = 2;
$fs = 0.4;

module gimbal_pitch_cradle() {
  color("#2c2c32")
    difference() {
      union() {
        hull() {
          translate([0, 8, 0]) rotate([0, 90, 0])
            cylinder(h = 26, d = 18, center = true);
          translate([0, -8, 0]) rotate([0, 90, 0])
            cylinder(h = 26, d = 18, center = true);
        }
        translate([-12, 0, 0])
          rotate([0, 90, 0])
            cylinder(h = 8, d = 16);
      }
      hull() {
        translate([0, 8, 0]) rotate([0, 90, 0])
          cylinder(h = 30, d = 13, center = true);
        translate([0, -8, 0]) rotate([0, 90, 0])
          cylinder(h = 30, d = 13, center = true);
      }
      rotate([0, 90, 0])
        cylinder(h = 30, d = 6, center = true);
    }
}

gimbal_pitch_cradle();
