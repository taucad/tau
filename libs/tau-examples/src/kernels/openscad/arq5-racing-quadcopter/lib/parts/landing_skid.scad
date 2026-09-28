include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module landing_skid() {
  color("#1c1c22")
    hull() {
      translate([0, 0, 0])
        rotate([90, 0, 90])
          linear_extrude(height = skid_len, convexity = 4)
            naca_airfoil(0, 0.4, skid_t, skid_chord, 16);
      translate([8, 0, -4])
        rotate([0, 90, 0])
          cylinder(h = skid_len - 16, d = 6);
    }
}

landing_skid();
