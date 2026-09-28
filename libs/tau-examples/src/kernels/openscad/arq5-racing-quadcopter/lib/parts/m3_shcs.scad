$fa = 2;
$fs = 0.4;

module m3_shcs() {
  color("#8a8a90")
    difference() {
      union() {
        cylinder(h = 10, d = 3);
        translate([0, 0, 10])
          cylinder(h = 3, d = 5.5);
      }
      translate([0, 0, 11.2])
        cylinder(h = 2.5, d = 2.5, $fn = 6);
    }
}

m3_shcs();
