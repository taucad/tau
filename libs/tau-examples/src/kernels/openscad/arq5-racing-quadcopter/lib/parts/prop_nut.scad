$fa = 2;
$fs = 0.4;

module prop_nut() {
  color("#c0c0c4")
    difference() {
      cylinder(h = 6, d = 9.24, $fn = 6);
      translate([0, 0, -1])
        cylinder(h = 8, d = 5);
    }
}

prop_nut();
