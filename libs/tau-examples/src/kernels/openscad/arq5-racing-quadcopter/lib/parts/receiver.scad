$fa = 2;
$fs = 0.4;

module receiver() {
  color("#1e4a1e")
    hull() {
      cube([11, 8, 2], center = true);
      translate([0, 0, 0.5])
        cube([13, 10, 1], center = true);
    }
}

receiver();
