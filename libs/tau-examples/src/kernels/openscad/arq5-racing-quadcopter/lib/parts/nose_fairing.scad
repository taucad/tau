include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module nose_outer() {
  naca_fuselage_body(
    fuselage_m, fuselage_p, fuselage_t,
    fuselage_chord, fuselage_width, fuselage_nose_x,
    fuselage_ns, fuselage_nc
  );
}

module nose_inner() {
  naca_fuselage_body(
    fuselage_m, fuselage_p,
    fuselage_t - 2 * fuselage_wall / fuselage_chord,
    fuselage_chord - 4, fuselage_width - 4, fuselage_nose_x - 2,
    fuselage_ns, fuselage_nc
  );
}

module nose_fairing() {
  color("#1c1c22")
    difference() {
      intersection() {
        nose_outer();
        translate([nose_split_x + 80, 0, 0])
          cube([160, 120, 120], center = true);
      }
      nose_inner();
      translate([78, 0, 2])
        rotate([0, 90, 0])
          cylinder(h = 30, d = 16);
    }
}

nose_fairing();
