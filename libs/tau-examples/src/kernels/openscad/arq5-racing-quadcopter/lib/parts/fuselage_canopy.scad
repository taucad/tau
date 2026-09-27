include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module canopy_outer() {
  naca_fuselage_body(
    fuselage_m, fuselage_p, fuselage_t,
    fuselage_chord, fuselage_width, fuselage_nose_x,
    fuselage_ns, fuselage_nc
  );
}

module canopy_inner() {
  naca_fuselage_body(
    fuselage_m, fuselage_p,
    fuselage_t - 2 * fuselage_wall / fuselage_chord,
    fuselage_chord - 4, fuselage_width - 4, fuselage_nose_x - 2,
    fuselage_ns, fuselage_nc
  );
}

module canopy_inserts() {
  for (x = [40, 10, -30], y = [-14, 14])
    translate([x, y, split_z - 1])
      cylinder(h = 8, d = m3_clr);
}

module fuselage_canopy() {
  color("#2a3344")
    difference() {
      intersection() {
        canopy_outer();
        translate([0, 0, 120 + split_z])
          cube([400, 200, 240], center = true);
        translate([-40, 0, 0])
          cube([200, 200, 200], center = true);
      }
      canopy_inner();
      canopy_inserts();
    }
}

fuselage_canopy();
