// D4 — a convex hull, then bored. A hull carries no authored surface, so before
// its faces were keyed by the operands their corners came from, the bore mouth
// and the nose rim both broke into disconnected arcs.
difference() {
  hull() {
    sphere(r = 6, $fn = 24);
    translate([0, 0, 18]) sphere(r = 9, $fn = 24);
  }
  translate([0, 0, -1]) cylinder(h = 30, r = 4, $fn = 24);
}
