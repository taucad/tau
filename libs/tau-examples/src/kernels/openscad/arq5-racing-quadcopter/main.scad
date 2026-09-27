include <lib/params.scad>
use <lib/parts/fuselage_keel.scad>
use <lib/parts/fuselage_canopy.scad>
use <lib/parts/nose_fairing.scad>
use <lib/parts/arm_spar.scad>
use <lib/parts/motor_pod.scad>
use <lib/parts/landing_skid.scad>
use <lib/parts/antenna_fairing.scad>
use <lib/parts/heat_insert.scad>
use <lib/parts/motor_stator.scad>
use <lib/parts/motor_bell.scad>
use <lib/parts/motor_shaft.scad>
use <lib/parts/motor_bearing.scad>
use <lib/parts/motor_magnet_ring.scad>
use <lib/parts/motor_base.scad>
use <lib/parts/prop_hub.scad>
use <lib/parts/prop_blade.scad>
use <lib/parts/prop_nut.scad>
use <lib/parts/motor_spinner.scad>
use <lib/parts/gimbal_pitch_cradle.scad>
use <lib/parts/gimbal_roll_ring.scad>
use <lib/parts/gimbal_pitch_motor.scad>
use <lib/parts/gimbal_roll_motor.scad>
use <lib/parts/gimbal_damper.scad>
use <lib/parts/camera_body.scad>
use <lib/parts/camera_lens.scad>
use <lib/parts/optical_window.scad>
use <lib/parts/flight_controller.scad>
use <lib/parts/esc_stack.scad>
use <lib/parts/vtx_module.scad>
use <lib/parts/receiver.scad>
use <lib/parts/battery_pack.scad>
use <lib/parts/battery_latch.scad>
use <lib/parts/antenna.scad>
use <lib/parts/m3_shcs.scad>
use <lib/assy/airframe_assy.scad>
use <lib/assy/arm_assy.scad>
use <lib/assy/propulsion_unit.scad>
use <lib/assy/gimbal_assy.scad>
use <lib/assy/avionics_assy.scad>
use <lib/assy/power_assy.scad>
use <lib/assy/motor_assy.scad>
use <lib/assy/propeller_assy.scad>
use <lib/assy/camera_assy.scad>

/* [View] */
// Assembly to display
part = "vehicle"; // [vehicle:Complete vehicle, airframe:Airframe, arm:Arm module, propulsion:Propulsion unit, motor:Motor, propeller:Propeller, gimbal:Camera gimbal, camera:Camera, avionics:Avionics stack, power:Battery and power]
// Show propellers and spinners
show_propellers = true;

$fa = 4;
$fs = 0.7;

module vehicle_motor() {
  motor_base();
  translate([0, 0, 7.5]) motor_stator();
  translate([0, 0, 8]) motor_magnet_ring();
  translate([0, 0, 6]) motor_bearing();
  translate([0, 0, 13]) motor_bearing();
  translate([0, 0, 8]) motor_bell();
  translate([0, 0, 21]) motor_shaft();
  if (show_propellers) translate([0, 0, 24]) {
    prop_hub();
    for (a = [0, 120, 240])
      rotate([0, 0, a])
        prop_blade();
    translate([0, 0, 8]) prop_nut();
  }
  if (show_propellers) translate([0, 0, 32]) motor_spinner();
}

module vehicle_arm(a) {
  rotate([0, 0, a])
    translate([0, arm_root_r, 0]) {
      translate([-arm_chord / 2, 0, 0])
        arm_spar();
      translate([0, motor_r - arm_root_r, 0])
        motor_pod();
    }
}

module arq5_vehicle() {
  fuselage_keel();
  fuselage_canopy();
  nose_fairing();
  for (a = [45, 135, 225, 315])
    vehicle_arm(a);
  for (s = [-1, 1])
    translate([-20, s * skid_y, -16])
      landing_skid();
  translate([-70, 0, 6])
    antenna_fairing();
  for (x = [40, 10, -30], y = [-14, 14])
    translate([x, y, split_z - 4])
      heat_insert();
  for (a = [45, 135, 225, 315])
    rotate([0, 0, a])
      translate([0, motor_r, motor_z])
        vehicle_motor();
  translate([72, 0, 4]) {
    gimbal_pitch_cradle();
    gimbal_roll_ring();
    translate([0, 16, 0]) rotate([90, 0, 0]) gimbal_pitch_motor();
    translate([0, -16, 0]) rotate([-90, 0, 0]) gimbal_pitch_motor();
    translate([12, 0, 0]) gimbal_roll_motor();
    for (y = [-10, 10], z = [-10, 10])
      translate([-12, y, z]) gimbal_damper();
    camera_body();
    translate([6, 0, 0]) camera_lens();
    translate([14, 0, 0]) optical_window();
  }
  translate([8, 0, 6]) {
    esc_stack();
    translate([0, 0, 8]) flight_controller();
    translate([0, 0, 16]) vtx_module();
    translate([0, 0, 21]) receiver();
  }
  translate([6, 0, -10]) {
    battery_pack();
    translate([18, 0, 8]) battery_latch();
  }
  translate([-74, 0, 8])
    antenna();
  for (a = [45, 135, 225, 315])
    rotate([0, 0, a])
      translate([0, motor_r, motor_z - 6])
        for (sx = [-1, 1], sy = [-1, 1])
          translate([sx * 8, sy * 9.5, 0])
            m3_shcs();
}

if (part == "airframe") airframe_assy();
else if (part == "arm") arm_assy();
else if (part == "propulsion") propulsion_unit();
else if (part == "motor") motor_assy();
else if (part == "propeller") propeller_assy();
else if (part == "gimbal") gimbal_assy();
else if (part == "camera") camera_assy();
else if (part == "avionics") avionics_assy();
else if (part == "power") power_assy();
else arq5_vehicle();
