use <../parts/prop_hub.scad>
use <../parts/prop_blade.scad>
use <../parts/prop_nut.scad>

$fa = 3;
$fs = 0.6;

module propeller_assy() {
  prop_hub();
  for (a = [0, 120, 240])
    rotate([0, 0, a])
      prop_blade();
  translate([0, 0, 8])
    prop_nut();
}

propeller_assy();
