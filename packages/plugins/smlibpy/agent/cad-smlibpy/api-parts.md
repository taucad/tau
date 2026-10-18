# smlibpy — parts

9 top-level symbols. Signatures are verbatim python.

# Category: parts
# A box of ``length`` (X) by ``width`` (Y) by ``height`` (Z)
# smlibpy.parts.Box (function)
Box(length: float, width: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A cone (or frustum) along Z
# smlibpy.parts.Cone (function)
Cone(bottom_radius: float, top_radius: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A drilling tool with a counterbore at the top
# smlibpy.parts.CounterBoreHole (function)
CounterBoreHole(radius: float, counter_bore_radius: float, counter_bore_depth: float, depth: float) -> Part

# Category: parts
# A drilling tool with a conical countersink of included ``angle`` at the top
# smlibpy.parts.CounterSinkHole (function)
CounterSinkHole(radius: float, counter_sink_radius: float, depth: float, angle: float = 82.0) -> Part

# Category: parts
# A cylinder along Z
# smlibpy.parts.Cylinder (function)
Cylinder(radius: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A drilling tool
# smlibpy.parts.Hole (function)
Hole(radius: float, depth: float) -> Part

# Category: parts
# A sphere
# smlibpy.parts.Sphere (function)
Sphere(radius: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A torus around Z
# smlibpy.parts.Torus (function)
Torus(major_radius: float, minor_radius: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A ramp
# Remarks: face at x = -length/2; the slope runs down towards +X. ``top_length`` gives a flat top of that length, measured from the -X end.
# smlibpy.parts.Wedge (function)
Wedge(length: float, width: float, height: float, top_length: float = 0.0, *, align: AlignLike = Align.CENTER) -> Part
