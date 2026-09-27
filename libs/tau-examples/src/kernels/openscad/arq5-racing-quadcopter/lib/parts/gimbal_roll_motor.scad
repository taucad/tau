$fa = 2;
$fs = 0.4;

module gimbal_roll_motor() {
  color("#3a3a42")
    rotate([0, 90, 0])
      union() {
        cylinder(h = 10, d = 14, center = true);
        // Output hub joins the can (it floated 1 mm off it).
        translate([0, 0, 4.9])
          cylinder(h = 2, d = 8);
      }
}

gimbal_roll_motor();
