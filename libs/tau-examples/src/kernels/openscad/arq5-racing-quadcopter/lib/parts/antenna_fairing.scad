use <naca.scad>

$fa = 2;
$fs = 0.4;

module antenna_fairing() {
  color("#1c1c22")
    rotate([0, 90, 0])
      rotate_extrude(convexity = 8)
        difference() {
          polygon(naca_revolution_profile(0.55, 18, 16), convexity = 6);
          // Coaxial 4 mm antenna bore.
          translate([-1, -1]) square([3, 20]);
        }
}

antenna_fairing();
