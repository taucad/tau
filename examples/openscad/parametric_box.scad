// Parametric Hollow Box Example
// Demonstrates OpenSCAD Customizer parameters
// and basic CSG operations.

// [size] = 40                // Overall box size (mm)
// [wall] = 3                 // Wall thickness (mm)
// [round] = 2                // Fillet radius on outer edges

$fn = 48; // smooth circles for fillets

module roundedCube(sz, r=0, center=true) {
  if (r <= 0)
    cube(sz, center=center);
  else
    minkowski() {
      cube(sz - 2*r, center=center);
      sphere(r = r);
    }
}

// Outer shell
roundedCube(size, round);

// Subtract inner cavity
translate([0,0,0])
  roundedCube(size - 2*wall, round > wall ? round - wall : 0)
    ;