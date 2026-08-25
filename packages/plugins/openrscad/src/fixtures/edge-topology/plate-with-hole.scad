// D6 — a 2D boolean used as an extrusion profile. `profile_boundary` recognised
// only literal primitives, so a difference of two shapes reported `Unknown` and
// sent the whole side wall through unclassified.
linear_extrude(3) difference() {
  square(20, center = true);
  circle(6, $fn = 32);
}
