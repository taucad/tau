use <../parts/battery_pack.scad>
use <../parts/battery_latch.scad>

$fa = 3;
$fs = 0.6;

module power_assy() {
  battery_pack();
  translate([18, 0, 8])
    battery_latch();
}

power_assy();
