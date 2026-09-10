# build123d — build_line

1 top-level symbols. Signatures are verbatim python.

// BuildLine
BuildLine

BuildLine(workplane: Face | Plane | Location = Plane.XY, mode: Mode = Mode.ADD)
// workplane: plane used when local coordinates are used and when creating arcs
// mode: combination mode

// Get the current line
line: Curve | None

// faces() not implemented
faces(\*args)

// face() not implemented
face(\*args)

// solids() not implemented
solids(\*args)

// solid() not implemented
solid(\*args)
