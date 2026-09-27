include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module arm_spar() {
  color("#1c1c22")
    difference() {
      translate([0, arm_span, 0])
        rotate([90, 0, 0])
          linear_extrude(height = arm_span, convexity = 6)
            naca_airfoil(0, 0.4, arm_t, arm_chord, arm_n);
      translate([arm_chord * 0.30, -0.5, 0])
        rotate([-90, 0, 0])
          cylinder(h = arm_span + 1, d = arm_duct_d);
    }
}

arm_spar();
