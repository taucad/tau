include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module keel_outer() {
  naca_fuselage_body(
    fuselage_m, fuselage_p, fuselage_t,
    fuselage_chord, fuselage_width, fuselage_nose_x,
    fuselage_ns, fuselage_nc
  );
}

module keel_inner() {
  naca_fuselage_body(
    fuselage_m, fuselage_p,
    fuselage_t - 2 * fuselage_wall / fuselage_chord,
    fuselage_chord - 4, fuselage_width - 4, fuselage_nose_x - 2,
    fuselage_ns, fuselage_nc
  );
}

module cooling_duct() {
  hull() {
    translate([38, 0, -15]) rotate([0, 90, 0]) cylinder(h = 3, r = 4.2);
    translate([8, 0, -1]) rotate([0, 90, 0]) cylinder(h = 3, r = 6.2);
    // Aft exit ends at x = -50: running it to -62 cut the thin tail through
    // and left the tail tip as a separate piece.
    translate([-50, 0, 1]) rotate([0, 90, 0]) cylinder(h = 3, r = 5.0);
  }
}

module battery_pocket() {
  translate([5, 0, -12])
    hull() {
      for (x = [-32, 32], y = [-12, 12])
        translate([x, y, 0]) sphere(r = 4);
      for (x = [-32, 32], y = [-12, 12])
        translate([x, y, 8]) sphere(r = 4);
    }
}

module arm_sockets() {
  for (a = [45, 135, 225, 315])
    rotate([0, 0, a])
      rotate([90, 0, 0])
        translate([0, 0, 8])
          // 7.9 mm, not 8: an 8 mm socket's crest lies exactly on the
          // split plane (z = split_z) and leaves a non-manifold edge.
          cylinder(h = 40, d = 7.9);
}

module keel_inserts() {
  for (x = [40, 10, -30], y = [-14, 14])
    translate([x, y, split_z - 4.6])
      cylinder(h = 5, d = m3_insert_d);
}

module fuselage_keel() {
  color("#1c1c22")
    difference() {
      intersection() {
        keel_outer();
        translate([0, 0, -120 + split_z])
          cube([400, 200, 240], center = true);
        translate([-40, 0, 0])
          cube([200, 200, 200], center = true);
      }
      keel_inner();
      cooling_duct();
      battery_pocket();
      arm_sockets();
      keel_inserts();
    }
}

fuselage_keel();
