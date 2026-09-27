include <../params.scad>
use <../parts/arm_spar.scad>
use <../parts/motor_pod.scad>
use <../parts/motor_stator.scad>
use <../parts/motor_bell.scad>
use <../parts/motor_shaft.scad>
use <../parts/motor_bearing.scad>
use <../parts/motor_magnet_ring.scad>
use <../parts/motor_base.scad>
use <../parts/prop_hub.scad>
use <../parts/prop_blade.scad>
use <../parts/prop_nut.scad>
use <../parts/motor_spinner.scad>

$fa = 3;
$fs = 0.6;

module arm_propulsion() {
  motor_base();
  translate([0, 0, 7.5]) motor_stator();
  translate([0, 0, 8]) motor_magnet_ring();
  translate([0, 0, 6]) motor_bearing();
  translate([0, 0, 13]) motor_bearing();
  translate([0, 0, 8]) motor_bell();
  translate([0, 0, 21]) motor_shaft();
  translate([0, 0, 24]) {
    prop_hub();
    for (a = [0, 120, 240])
      rotate([0, 0, a])
        prop_blade();
    translate([0, 0, 8]) prop_nut();
  }
  translate([0, 0, 32]) motor_spinner();
}

module arm_assy() {
  translate([-arm_chord / 2, 0, 0])
    arm_spar();
  translate([0, arm_span + 10, 0])
    motor_pod();
  translate([0, arm_span + 10, 6])
    arm_propulsion();
}

arm_assy();
