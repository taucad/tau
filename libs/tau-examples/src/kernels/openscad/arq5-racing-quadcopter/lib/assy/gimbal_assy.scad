use <../parts/gimbal_pitch_cradle.scad>
use <../parts/gimbal_roll_ring.scad>
use <../parts/gimbal_pitch_motor.scad>
use <../parts/gimbal_roll_motor.scad>
use <../parts/gimbal_damper.scad>
use <../parts/camera_body.scad>
use <../parts/camera_lens.scad>
use <../parts/optical_window.scad>

$fa = 2;
$fs = 0.4;

module gimbal_assy() {
  gimbal_pitch_cradle();
  gimbal_roll_ring();
  translate([0, 16, 0])
    rotate([90, 0, 0])
      gimbal_pitch_motor();
  translate([0, -16, 0])
    rotate([-90, 0, 0])
      gimbal_pitch_motor();
  translate([12, 0, 0])
    gimbal_roll_motor();
  for (y = [-10, 10], z = [-10, 10])
    translate([-12, y, z])
      gimbal_damper();
  camera_body();
  translate([6, 0, 0]) camera_lens();
  translate([14, 0, 0]) optical_window();
}

gimbal_assy();
