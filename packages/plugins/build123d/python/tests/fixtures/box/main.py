from dataclasses import dataclass

from build123d import Box, Color


@dataclass(frozen=True)
class Params:
    width: float = 40.0
    depth: float = 30.0
    height: float = 20.0


__tau__ = {
    "parameters": {
        "width": {"minimum": 1.0, "maximum": 200.0, "description": "Box width in millimeters"},
        "depth": {"minimum": 1.0, "maximum": 200.0},
        "height": {"minimum": 1.0, "maximum": 200.0},
    }
}


def main(params: Params):
    result = Box(params.width, params.depth, params.height)
    result.label = "Housing"
    result.color = Color("royalblue")
    return result
