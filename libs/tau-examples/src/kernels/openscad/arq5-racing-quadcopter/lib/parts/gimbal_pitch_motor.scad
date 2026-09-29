$fa = 2;
$fs = 0.4;

module gimbal_pitch_motor() {
  color("#3a3a42")
    union() {
      cylinder(h = 10, d = 14);
      translate([0, 0, 10])
        cylinder(h = 2, d = 8);
    }
}

gimbal_pitch_motor();
