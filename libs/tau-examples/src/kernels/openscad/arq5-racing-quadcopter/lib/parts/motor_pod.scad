include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module motor_pod() {
  color("#1c1c22")
    difference() {
      // Coaxial counterbore and bore are cut from the profile before revolving.
      rotate_extrude(convexity = 8)
        difference() {
          polygon(naca_revolution_profile(pod_t, pod_chord, 20), convexity = 6);
          translate([-1, 6]) square([15, pod_chord]);
          translate([-1, -1]) square([7, 10]);
        }
      for (sx = [-1, 1], sy = [-1, 1])
        translate([sx * 8, sy * 9.5, -1])
          cylinder(h = 14, d = m3_clr);
      rotate([90, 0, 0])
        translate([0, 10, 0])
          cylinder(h = 40, d = arm_duct_d, center = true);
    }
}

motor_pod();
