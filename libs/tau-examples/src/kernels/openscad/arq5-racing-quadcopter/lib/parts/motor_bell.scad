$fa = 2;
$fs = 0.4;

module motor_bell() {
  color("#c0c4c8")
    difference() {
      cylinder(h = 16, d = 27.8);
      translate([0, 0, -0.2])
        cylinder(h = 13.2, d = 24.6);
      translate([0, 0, -1])
        cylinder(h = 20, d = 5.2);
      for (a = [0:90:270])
        rotate([0, 0, a])
          translate([8, 0, 14])
            cylinder(h = 4, d = 4);
    }
}

motor_bell();
