use <../parts/flight_controller.scad>
use <../parts/esc_stack.scad>
use <../parts/vtx_module.scad>
use <../parts/receiver.scad>

$fa = 2;
$fs = 0.4;

module avionics_assy() {
  esc_stack();
  translate([0, 0, 8])
    flight_controller();
  translate([0, 0, 16])
    vtx_module();
  translate([0, 0, 21])
    receiver();
}

avionics_assy();
