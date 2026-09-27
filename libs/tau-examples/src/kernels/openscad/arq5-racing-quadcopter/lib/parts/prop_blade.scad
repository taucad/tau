use <naca.scad>

$fa = 3;
$fs = 0.6;

module prop_blade() {
  color("#e8e8e8")
    translate([0, 6.5, 0])
      rotate([-90, 0, 0])
        linear_extrude(
          height = 57,
          twist = 51,
          scale = 9 / 22,
          slices = 8,
          convexity = 6
        )
          naca_airfoil(0.04, 0.4, 0.12, 22, 18);
}

prop_blade();
