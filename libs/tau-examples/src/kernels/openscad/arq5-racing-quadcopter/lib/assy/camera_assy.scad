use <../parts/camera_body.scad>
use <../parts/camera_lens.scad>
use <../parts/optical_window.scad>

$fa = 2;
$fs = 0.4;

module camera_assy() {
  camera_body();
  translate([6, 0, 0])
    camera_lens();
  translate([14, 0, 0])
    optical_window();
}

camera_assy();
