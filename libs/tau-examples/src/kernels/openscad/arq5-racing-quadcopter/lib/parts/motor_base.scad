$fa = 2;
$fs = 0.4;

module motor_base() {
  color("#b8bcc0")
    difference() {
      hull() {
        for (x = [-9.5, 9.5], y = [-9.5, 9.5])
          translate([x, y, 0])
            cylinder(h = 4, d = 7);
      }
      translate([0, 0, -1])
        cylinder(h = 6, d = 12);
      for (sx = [-1, 1], sy = [-1, 1])
        translate([sx * 8, sy * 9.5, -1])
          cylinder(h = 6, d = 3.3);
    }
}

motor_base();
