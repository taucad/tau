// D5 — a multi-loop profile. The inner rim only survives if cap membership comes
// from geometry rather than from a presumed ring layout: inferring the layer
// from the vertex index files the side wall into the caps, and both rims cancel.
linear_extrude(4) difference() {
  circle(10, $fn = 48);
  circle(5, $fn = 48);
}
