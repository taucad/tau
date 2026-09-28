$fa = 2;
$fs = 0.4;

module motor_shaft() {
  color("#888890")
    difference() {
      cylinder(h = 22, d = 5, center = true);
      translate([2.2, 0, 8])
        cube([1.2, 6, 8], center = true);
    }
}

motor_shaft();
