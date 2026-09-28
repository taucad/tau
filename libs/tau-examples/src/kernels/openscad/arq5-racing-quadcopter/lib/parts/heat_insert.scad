$fa = 2;
$fs = 0.4;

module heat_insert() {
  color("#c4a35a")
    difference() {
      union() {
        cylinder(h = 4, d = 4.6);
        for (z = [0.7, 2.0, 3.3])
          translate([0, 0, z])
            cylinder(h = 0.5, d = 4.7);
      }
      translate([0, 0, -0.5])
        cylinder(h = 5, d = 3);
    }
}

heat_insert();
