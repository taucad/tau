$fa = 2;
$fs = 0.4;

module motor_stator() {
  color("#c47a20")
    difference() {
      cylinder(h = 7, d = 22, center = true);
      cylinder(h = 8, d = 12, center = true);
      for (a = [0:45:315])
        rotate([0, 0, a])
          translate([8.2, 0, 0])
            cube([4, 1.2, 8], center = true);
    }
}

motor_stator();
