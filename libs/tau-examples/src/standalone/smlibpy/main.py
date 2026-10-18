import sys
from dataclasses import dataclass

from smlibpy import Box, Part, Pos, export_stl


@dataclass(frozen=True)
class Params:
    width: float = 20
    depth: float = 10
    height: float = 5
    hole: float = 4


def main(params: Params) -> Part:
    block = Box(params.width, params.depth, params.height)
    hole = Pos(3, 0, 0) * Box(params.hole, params.hole, params.height * 3)
    return block - hole


# Outside Tau: `uv run main.py out.stl` writes the model. Tau imports the module and calls main itself.
if __name__ == "__main__":
    export_stl(main(Params()), sys.argv[1])
