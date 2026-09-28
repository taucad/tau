include <../params.scad>
use <../parts/fuselage_keel.scad>
use <../parts/fuselage_canopy.scad>
use <../parts/nose_fairing.scad>
use <../parts/arm_spar.scad>
use <../parts/motor_pod.scad>
use <../parts/landing_skid.scad>
use <../parts/antenna_fairing.scad>
use <../parts/heat_insert.scad>

$fa = 3;
$fs = 0.6;

module airframe_arm(a) {
  rotate([0, 0, a])
    translate([0, arm_root_r, 0]) {
      translate([-arm_chord / 2, 0, 0])
        arm_spar();
      translate([0, motor_r - arm_root_r, 0])
        motor_pod();
    }
}

module airframe_assy() {
  fuselage_keel();
  fuselage_canopy();
  nose_fairing();
  for (a = [45, 135, 225, 315])
    airframe_arm(a);
  for (s = [-1, 1])
    translate([-20, s * skid_y, -16])
      landing_skid();
  translate([-70, 0, 6])
    antenna_fairing();
  for (x = [40, 10, -30], y = [-14, 14])
    translate([x, y, split_z - 4])
      heat_insert();
}

airframe_assy();
