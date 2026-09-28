$fa = 2;
$fs = 0.4;

module battery_latch() {
  color("#3a3a44")
    difference() {
      hull() {
        translate([0, 0, 0]) sphere(r = 3);
        translate([16, 0, 0]) sphere(r = 3);
        translate([14, 0, 7]) sphere(r = 2.4);
        translate([2, 0, 6]) sphere(r = 2.4);
        translate([8, 4.5, 2]) sphere(r = 2);
        translate([8, -4.5, 2]) sphere(r = 2);
      }
      translate([3, 0, 2])
        rotate([0, 90, 0])
          cylinder(h = 8, d = 3.3);
    }
}

battery_latch();
