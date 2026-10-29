"""608 bearing pillow block.

A slip-fit seat for a 608 (22 mm outside diameter, 7 mm wide) on a filleted
foot with two M4 clearance holes. The bore, the fillet and the STEP body are
what build123d's native OpenCascade session is for. A mesh kernel can look
like this and then forget the cylinder was a cylinder.
"""

from dataclasses import dataclass

from build123d import Axis, Box, Cylinder, Pos, Rot, fillet


@dataclass(frozen=True)
class Params:
    """Millimetres."""

    bearing_od: float = 22.0
    bore_clearance: float = 0.2
    base_length: float = 68.0
    base_width: float = 36.0
    base_thickness: float = 6.0
    housing_length: float = 28.0
    housing_height: float = 32.0
    top_wall: float = 3.0
    fillet_radius: float = 1.6
    hole_diameter: float = 4.3
    hole_spacing: float = 52.0


def main(params: Params):
    """Foot, housing, through bore and two mounting holes."""
    if min(
        params.bearing_od,
        params.base_length,
        params.base_width,
        params.base_thickness,
        params.housing_length,
        params.housing_height,
        params.top_wall,
        params.hole_diameter,
        params.hole_spacing,
    ) <= 0:
        raise ValueError("Pillow-block dimensions must be positive.")
    if params.bore_clearance < 0 or params.fillet_radius < 0:
        raise ValueError("Clearance and fillet radius must be zero or positive.")

    base = Pos(0, 0, params.base_thickness / 2) * Box(
        params.base_length, params.base_width, params.base_thickness
    )
    housing = Pos(0, 0, params.base_thickness + params.housing_height / 2) * Box(
        params.housing_length, params.base_width, params.housing_height
    )
    bore_radius = params.bearing_od / 2 + params.bore_clearance
    bore_center = params.base_thickness + params.housing_height - params.top_wall - bore_radius
    if bore_center - bore_radius <= params.base_thickness:
        raise ValueError("The bore breaks through the foot. Raise housing_height or lower top_wall.")
    if params.hole_spacing / 2 - params.hole_diameter / 2 <= params.housing_length / 2:
        raise ValueError("Mounting holes collide with the housing.")

    bore = Pos(0, 0, bore_center) * Rot(90, 0, 0) * Cylinder(
        bore_radius, params.base_width + 4
    )
    hole_z = params.base_thickness / 2
    hole = Cylinder(params.hole_diameter / 2, params.base_thickness + 2)
    holes = Pos(-params.hole_spacing / 2, 0, hole_z) * hole + Pos(
        params.hole_spacing / 2, 0, hole_z
    ) * hole
    block = base + housing - bore - holes
    vertical = block.edges().filter_by(Axis.Z)
    if params.fillet_radius > 0 and len(vertical) > 0:
        block = fillet(vertical, params.fillet_radius)
    block.label = "Pillow block"
    return block
