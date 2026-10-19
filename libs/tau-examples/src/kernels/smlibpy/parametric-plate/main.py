"""A mounting plate: rounded corners, a grid of through holes and softened top edges, on the SMLib NURBS kernel."""

from dataclasses import dataclass

from smlibpy import Align, Box, Cylinder, GridLocations, Z

STANDING = (Align.CENTER, Align.CENTER, Align.MIN)


@dataclass(frozen=True)
class Params:
    length: float = 80.0
    width: float = 60.0
    thickness: float = 8.0
    corner_radius: float = 8.0
    edge_radius: float = 1.0
    hole_diameter: float = 6.0
    hole_columns: int = 3
    hole_rows: int = 2
    hole_spacing: float = 24.0


def validate(p: Params) -> None:
    if min(p.length, p.width, p.thickness, p.corner_radius, p.hole_diameter, p.hole_spacing) <= 0:
        raise ValueError("Plate dimensions, radii and spacing must be positive.")
    if p.hole_columns < 1 or p.hole_rows < 1:
        raise ValueError("Use at least one hole column and one hole row.")
    if p.corner_radius * 2 >= min(p.length, p.width):
        raise ValueError("corner_radius must be less than half the shorter side.")
    if p.edge_radius < 0 or p.edge_radius * 2 >= p.thickness:
        raise ValueError("edge_radius must be in [0, thickness / 2).")
    margin = p.hole_diameter / 2 + p.edge_radius + 2
    span_x = (p.hole_columns - 1) * p.hole_spacing
    span_y = (p.hole_rows - 1) * p.hole_spacing
    if span_x / 2 + margin > p.length / 2 or span_y / 2 + margin > p.width / 2:
        raise ValueError("The hole grid does not fit on the plate.")
    if p.hole_spacing <= p.hole_diameter + 2:
        raise ValueError("hole_spacing must leave at least 2 mm between holes.")


def main(params: Params):
    validate(params)
    plate = Box(params.length, params.width, params.thickness, align=STANDING)
    plate = plate.fillet(plate.edges().parallel_to(Z), params.corner_radius)
    drill = Cylinder(params.hole_diameter / 2, params.thickness, align=STANDING)
    plate = plate - GridLocations(params.hole_spacing, params.hole_spacing, params.hole_columns, params.hole_rows) * drill
    if params.edge_radius > 0:
        plate = plate.fillet(plate.edges().group_by(Z)[-1], params.edge_radius)
    return {
        "name": "Mounting plate",
        "shape": plate,
        "material": {
            "pbrMetallicRoughness": {"baseColorFactor": [0.6, 0.63, 0.66, 1], "metallicFactor": 1, "roughnessFactor": 0.35}
        },
    }
