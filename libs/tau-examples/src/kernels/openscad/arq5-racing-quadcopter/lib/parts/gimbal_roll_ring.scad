$fa = 2;
$fs = 0.4;

module gimbal_roll_ring() {
  color("#3a3a42")
    difference() {
      rotate([0, 90, 0])
        cylinder(h = 10, d = 28, center = true);
      rotate([0, 90, 0])
        cylinder(h = 12, d = 20, center = true);
      for (a = [0, 180])
        rotate([a, 0, 0])
          translate([0, 0, 10])
            cylinder(h = 8, d = 3.2, center = true);
    }
}

gimbal_roll_ring();
