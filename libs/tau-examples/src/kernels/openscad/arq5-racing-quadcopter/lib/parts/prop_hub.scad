$fa = 2;
$fs = 0.4;

module prop_hub() {
  color("#e8e8e8")
    difference() {
      hull() {
        cylinder(h = 7, d = 14);
        translate([0, 0, 8])
          cylinder(h = 0.2, d = 10);
      }
      translate([0, 0, -1])
        cylinder(h = 12, d = 5.2);
    }
}

prop_hub();
