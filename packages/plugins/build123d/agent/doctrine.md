## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults.
2. Define `main(params: Params)` returning one `build123d.Shape` or a finite non-empty list or tuple of shapes.
3. Set each root shape's `label` and `color`; labels must be unique. Tau preserves them in the viewer topology and STEP export.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}`.
5. Keep render tessellation out of `Params`; Tau owns display tolerance.

## Canonical pattern

```python
from dataclasses import dataclass
from typing import Literal
from build123d import Box, Color, Shape

@dataclass(frozen=True)
class Params:
    width: float = 80.0
    depth: float = 40.0
    height: float = 12.0
    finish: Literal["blue", "orange"] = "blue"

__tau__ = {
    "parameters": {
        "width": {"minimum": 1.0, "description": "Body width in millimeters"}
    }
}

def main(params: Params) -> Shape:
    body = Box(params.width, params.depth, params.height)
    body.label = "Body"
    body.color = Color(params.finish)
    return body
```

Prefer Build123d features, sketches, joints, and assemblies over primitive-buttings. Diagnose invalid shapes, duplicate labels, coincident booleans, and zero dimensions first.

Both build123d styles work: builder mode (`with BuildPart() as part:` … `part.part`, objects combine by `mode=Mode.ADD`/`Mode.SUBTRACT`) and algebra mode (`Pos(x, y, z) * Box(…) - Cylinder(…)`). Pick one per model.

## Wrong / Correct

- Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: primitives take no position: `Pos(0, 0, 5) * Cylinder(4, 10)`, or place them with `Locations` in builder mode.
- Wrong: assuming an OCP/OCCT call. Correct: use build123d objects and operations; the reference lists build123d's public API only.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`.
