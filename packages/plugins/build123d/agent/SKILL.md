---
name: cad-build123d
description: Guides native Build123d BRep authoring in main.py. Use when creating or editing trusted Python CAD projects in Tau Desktop.
---

# Build123d authoring

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
