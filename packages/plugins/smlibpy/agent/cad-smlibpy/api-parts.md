# smlibpy — parts

11 top-level symbols. Signatures are verbatim python.

# Category: parts
# A sector of a tube along Z
# Remarks: ``height`` tall, ``arc_size`` degrees (at most 360: a whole tube) from the +X axis counter-clockwise about +Z. An ``inner_radius`` of 0 gives a sector of a cylinder. Centered by its bounding box; ``align=None`` keeps the axis on Z (z from -height/2 to height/2).
# smlibpy.parts.AnnularSector (function)
AnnularSector(inner_radius: float, outer_radius: float, height: float, arc_size: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A box of ``length`` (X) by ``width`` (Y) by ``height`` (Z)
# smlibpy.parts.Box (function)
Box(length: float, width: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A cone (or frustum) along Z
# Remarks: :func:`Cylinder`.
# smlibpy.parts.Cone (function)
Cone(bottom_radius: float, top_radius: float, height: float, *, arc_size: float = 360.0, align: AlignLike = Align.CENTER) -> Part

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
# Remarks: ``arc_size`` (degrees, at most 360) makes a sector: the part of the cylinder from the +X axis counter-clockwise about +Z (planes on its two sides). Like every primitive it is centered by its bounding box, so a sector's axis moves off Z; ``align=None`` keeps it on Z (the sector of the centered cylinder).
# smlibpy.parts.Cylinder (function)
Cylinder(radius: float, height: float, *, arc_size: float = 360.0, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A drilling tool
# smlibpy.parts.Hole (function)
Hole(radius: float, depth: float) -> Part

# Category: parts
# A pyramid
# Remarks: above the rectangle's center; five planes. Centered by its bounding box.
# smlibpy.parts.Pyramid (function)
Pyramid(length: float, width: float, height: float, *, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A sphere, or a part of one
# Remarks: ``arc_size1`` and ``arc_size2`` are the latitudes (degrees, -90 at the bottom pole to 90 at the top) it reaches from and to: planes parallel to XY cut it there. ``arc_size3`` (at most 360) is the longitude it spans, from the +X axis counter-clockwise about +Z (planes through the Z axis on its sides). A part of a sphere is centered by its bounding box; ``align=None`` keeps the sphere's center at the origin.
# smlibpy.parts.Sphere (function)
Sphere(radius: float, *, arc_size1: float = -90.0, arc_size2: float = 90.0, arc_size3: float = 360.0, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A torus around Z
# Remarks: ``major_angle`` (degrees, at most 360) makes a sector of it, from the +X axis counter-clockwise about +Z, with round ends. ``minor_start_angle`` and ``minor_end_angle`` (degrees) keep the part of the tube's circle between them, as build123d does: measured in the tube's section from the side away from the axis (0) towards +Z (90), the section a slice of the circle from its center (cones, planes or cylinders where the slice's straight sides go round). A part of a torus is centered by its bounding box (``align=None`` keeps the torus's center at the origin):: top_half = Torus(20, 5, minor_start_angle=0, minor_end_angle=180) bead = Torus(20, 5, minor_start_angle=-90, minor_end_angle=90) # the outer half
# smlibpy.parts.Torus (function)
Torus(major_radius: float, minor_radius: float, *, minor_start_angle: float = 0.0, minor_end_angle: float = 360.0, major_angle: float = 360.0, align: AlignLike = Align.CENTER) -> Part

# Category: parts
# A ramp
# Remarks: face at x = -length/2; the slope runs down towards +X. ``top_length`` gives a flat top of that length, measured from the -X end.
# smlibpy.parts.Wedge (function)
Wedge(length: float, width: float, height: float, top_length: float = 0.0, *, align: AlignLike = Align.CENTER) -> Part
