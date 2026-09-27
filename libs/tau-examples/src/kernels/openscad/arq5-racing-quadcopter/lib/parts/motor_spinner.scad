include <params.scad>
use <naca.scad>

$fa = 2;
$fs = 0.4;

module motor_spinner() {
  color("#c8ccd2")
    // Coaxial shaft bore and nut counterbore are cut from the profile.
    rotate_extrude(convexity = 8)
      difference() {
        polygon(naca_revolution_profile(spinner_t, spinner_chord, 18), convexity = 6);
        translate([-1, -1]) square([4.1, spinner_chord + 2]);
        translate([-1, spinner_chord - 5]) square([6, 8]);
      }
}

motor_spinner();
