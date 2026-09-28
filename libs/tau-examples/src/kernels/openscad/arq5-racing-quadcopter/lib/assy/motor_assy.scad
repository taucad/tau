use <../parts/motor_stator.scad>
use <../parts/motor_bell.scad>
use <../parts/motor_shaft.scad>
use <../parts/motor_bearing.scad>
use <../parts/motor_magnet_ring.scad>
use <../parts/motor_base.scad>

$fa = 2;
$fs = 0.4;

module motor_assy() {
  motor_base();
  translate([0, 0, 7.5])
    motor_stator();
  translate([0, 0, 8])
    motor_magnet_ring();
  translate([0, 0, 6])
    motor_bearing();
  translate([0, 0, 13])
    motor_bearing();
  translate([0, 0, 8])
    motor_bell();
  translate([0, 0, 21])
    motor_shaft();
}

motor_assy();
