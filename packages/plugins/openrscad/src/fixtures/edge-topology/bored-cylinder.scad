// D2 — identity through a boolean. At $fn=12 each facet subtends 30 degrees, so
// no dihedral threshold can tell the tessellation from a feature; only patch
// identity surviving the Manifold round trip keeps the side wall smooth.
difference() {
  cylinder(h = 20, r = 10, $fn = 12);
  translate([0, 0, -1]) cylinder(h = 22, r = 5, $fn = 12);
}
