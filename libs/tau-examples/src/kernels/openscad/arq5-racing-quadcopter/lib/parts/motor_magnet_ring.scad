$fa = 2;
$fs = 0.4;

module motor_magnet_ring() {
  color("#2a2a30")
    difference() {
      cylinder(h = 7, d = 26, center = true);
      cylinder(h = 8, d = 23, center = true);
    }
}

motor_magnet_ring();
