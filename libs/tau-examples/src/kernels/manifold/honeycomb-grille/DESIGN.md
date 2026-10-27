# Honeycomb Grille

A speaker or fan grille: round plate, hexagonal cells, solid rim.

Manifold is the showcase because each cell is a separate boolean and the cuts tile. OpenCascade pays BRep cost per hex. OpenSCAD will do it and then sit in CGAL. The cells here are six-segment cylinders, so the opening is a hex prism rather than a meshed polygon.

Parameters: `diameter`, `thickness`, `cellSize`, `border`, `opening`. `opening` is the hole diameter as a fraction of the pitch; keep it under about 0.9 so neighbouring hexes do not merge into a non-manifold web.
