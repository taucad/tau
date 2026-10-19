"""A walnut box whose lid opens on a three-knuckle brass hinge.

The model is built closed; the module's `mechanism(params)` returns Tau's shared kinematics source (the same schema as
the SMLib WebAssembly, Replicad and PicoVoxel kernels) with a revolute hinge and an open-and-close animation.
"""

from dataclasses import dataclass

from smlibpy import Align, Box, Cylinder, Pos, Rot, Sphere, Z

STANDING = (Align.CENTER, Align.CENTER, Align.MIN)
BODY = "Box body"
LEFT_KNUCKLE = "Left body knuckle"
RIGHT_KNUCKLE = "Right body knuckle"
PIN = "Hinge pin"
LID = "Lid"
LID_KNUCKLE = "Lid knuckle"
KNOB = "Lid knob"

WALNUT = {
    "pbrMetallicRoughness": {"baseColorFactor": [0.23, 0.11, 0.05, 1], "metallicFactor": 0, "roughnessFactor": 0.55},
    "extensions": {"KHR_materials_clearcoat": {"clearcoatFactor": 0.6, "clearcoatRoughnessFactor": 0.2}},
}
BRASS = {"pbrMetallicRoughness": {"baseColorFactor": [0.9, 0.68, 0.3, 1], "metallicFactor": 1, "roughnessFactor": 0.25}}
STEEL = {"pbrMetallicRoughness": {"baseColorFactor": [0.7, 0.72, 0.75, 1], "metallicFactor": 1, "roughnessFactor": 0.3}}


@dataclass(frozen=True)
class Params:
    length: float = 90.0
    width: float = 60.0
    height: float = 36.0
    wall: float = 2.5
    lid_thickness: float = 5.0
    hinge_radius: float = 3.0
    max_opening: float = 110.0


def validate(p: Params) -> None:
    if min(p.length, p.width, p.height, p.wall, p.lid_thickness, p.hinge_radius) <= 0:
        raise ValueError("Box dimensions, wall and hinge radius must be positive.")
    if p.wall * 4 >= min(p.length, p.width, p.height):
        raise ValueError("wall must be under a quarter of the smallest box side.")
    if p.length < 40 or p.hinge_radius * 2 > p.height:
        raise ValueError("Use length >= 40 mm and hinge_radius <= height / 2.")
    if not 0 < p.max_opening <= 180:
        raise ValueError("max_opening must be in (0, 180] degrees.")


def hinge_axis(p: Params) -> tuple[float, float, float]:
    """The hinge line: along X behind the back wall, level with the top of the body."""

    return (0.0, p.width / 2 + p.hinge_radius, p.height)


def knuckle(p: Params, x0: float, x1: float, radius: float):
    """A cylinder along X from `x0` to `x1` on the hinge line."""

    _, y, z = hinge_axis(p)
    return Pos((x0 + x1) / 2, y, z) * (Rot(0, 90, 0) * Cylinder(radius, x1 - x0))


def main(params: Params):
    p = params
    validate(p)
    body = Box(p.length, p.width, p.height, align=STANDING)
    body = body.fillet(body.edges().parallel_to(Z), p.wall * 1.5)
    body = body.shell(p.wall, body.faces().top())

    lid = Pos(0, 0, p.height) * Box(p.length, p.width, p.lid_thickness, align=STANDING)
    lid = lid.fillet(lid.edges().parallel_to(Z), p.wall * 1.5)
    lid = lid.fillet(lid.edges().group_by(Z)[-1], min(1.5, p.lid_thickness / 3))

    half, third, gap = p.length / 2, p.length / 6, 0.5
    pin_radius = p.hinge_radius / 2.5
    bore = knuckle(p, -half, half, pin_radius)
    knob = Pos(0, -p.width / 2 + 10, p.height + p.lid_thickness) * Sphere(4)
    return [
        {"name": BODY, "shape": body, "material": WALNUT},
        {"name": LEFT_KNUCKLE, "shape": knuckle(p, -half + 6, -third - gap, p.hinge_radius) - bore, "material": BRASS},
        {"name": RIGHT_KNUCKLE, "shape": knuckle(p, third + gap, half - 6, p.hinge_radius) - bore, "material": BRASS},
        {"name": PIN, "shape": knuckle(p, -half + 5, half - 5, pin_radius), "material": STEEL},
        {"name": LID, "shape": lid, "material": WALNUT},
        {"name": LID_KNUCKLE, "shape": knuckle(p, -third, third, p.hinge_radius) - bore, "material": BRASS},
        {"name": KNOB, "shape": knob, "material": BRASS},
    ]


def mechanism(params: Params):
    validate(params)
    return {
        "schemaVersion": 1,
        "units": {"length": "mm", "angle": "deg"},
        "root": "body",
        "links": {
            "body": {"shapes": [BODY, LEFT_KNUCKLE, RIGHT_KNUCKLE, PIN]},
            "lid": {"shapes": [LID, LID_KNUCKLE, KNOB]},
        },
        "joints": {
            "hinge": {
                "type": "revolute",
                "name": "Lid hinge",
                "parent": "body",
                "child": "lid",
                "origin": list(hinge_axis(params)),
                # Positive angles lift the front of the lid.
                "axis": [-1, 0, 0],
                "limits": {"lower": 0, "upper": params.max_opening},
            }
        },
        "animations": [
            {
                "id": "open-close",
                "name": "Open and close",
                "duration": 4,
                "loop": "repeat",
                "keyframes": [
                    {"time": 0, "coordinates": {"hinge": 0}},
                    {"time": 1.5, "coordinates": {"hinge": params.max_opening}},
                    {"time": 2.5, "coordinates": {"hinge": params.max_opening}},
                    {"time": 4, "coordinates": {"hinge": 0}},
                ],
            }
        ],
    }
