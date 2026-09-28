$fa = 2;
$fs = 0.4;

module motor_bearing() {
  color("#6a6a70")
    difference() {
      cylinder(h = 4, d = 11, center = true);
      cylinder(h = 5, d = 5, center = true);
    }
}

motor_bearing();
