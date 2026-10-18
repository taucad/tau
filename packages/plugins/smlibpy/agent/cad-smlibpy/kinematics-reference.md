# SMLibPy kinematics reference

Use this reference when a smlibpy model has parts intended to move relative to one another: hinges, lids, doors, sliders, shafts, gears, linkages, articulated arms or fans. Define a mechanism for the **modeled moving assembly**, including an animation that exercises every intended independent motion. A single rigid part has no mechanism.

## Authoring contract

smlibpy has no native joints. The entry module defines `main(params)` as usual and also a module-level `mechanism` dict or a synchronous `mechanism(params)` function, called with the same validated `Params` as `main`. It returns plain JSON data matching Tau's shared `MechanismSource` schema (`@taucad/kinematics`), the same schema the SMLib WebAssembly, Replicad and PicoVoxel kernels use. Returning `None` declares no mechanism.

Return moving bodies as **separate, uniquely named** shapes: config dicts with `"name"`, or bodies named with `.named("Lid")`. Do not fuse parts that move relative to each other. `links` groups names of shapes that move rigidly together; a named shape belongs to at most one link. `root` is the grounded link; it may have `"shapes": []`. Every non-root link has exactly one incoming joint, giving a connected tree. Include every returned shape whose pose matters, including pins that ride a moving link, and keep names consistent with the shapes `main` returns for the current parameters.

Use the **as-built geometry frame**: `origin` is a point in the model's coordinates at the rendered pose; `axis`, `normal` and `xAxis` are directions in that frame. smlibpy geometry is millimetres, Z-up, and primitives are centered on the origin unless aligned, so compute hinge origins from the positions you actually built. State `"schemaVersion": 1` and explicit `"units": {"length": "mm", "angle": "deg"}`; the kernel transforms the mechanism with the vertices into the GLB frame and units. Joint coordinates are **deltas** from the rendered pose, so zero means Reset, and every limit must contain zero.

## Complete hinged model

```python
from dataclasses import dataclass

from smlibpy import Align, Box

CORNER = (Align.MIN, Align.MIN, Align.MIN)


@dataclass(frozen=True)
class Params:
    width: float = 60.0
    depth: float = 40.0
    max_open: float = 110.0


def main(p: Params):
    if min(p.width, p.depth, p.max_open) <= 0:
        raise ValueError("width, depth and max_open must be positive.")
    # Both boxes start at the origin corner: the base fills z 0–4, the lid z 4–7.
    return [
        {"name": "Base", "shape": Box(p.width, p.depth, 4, align=CORNER), "color": "#52677a"},
        {"name": "Lid", "shape": Box(p.width, p.depth, 3, align=CORNER).translate(0, 0, 4), "color": "#c78b52"},
    ]


def mechanism(p: Params):
    return {
        "schemaVersion": 1,
        "units": {"length": "mm", "angle": "deg"},
        "root": "base",
        "links": {"base": {"shapes": ["Base"]}, "lid": {"shapes": ["Lid"]}},
        "joints": {
            "hinge": {
                "type": "revolute",
                "name": "Lid hinge",
                "parent": "base",
                "child": "lid",
                "origin": [0, 0, 4],
                "axis": [1, 0, 0],
                "limits": {"lower": 0, "upper": p.max_open},
            }
        },
        "animations": [
            {
                "id": "open-close",
                "name": "Open and close",
                "duration": 2,
                "loop": "pingPong",
                "keyframes": [{"time": 0, "coordinates": {"hinge": 0}}, {"time": 2, "coordinates": {"hinge": p.max_open}}],
            }
        ],
    }
```

The lid stays closed in `main`; the Kinematics pane rotates it about the X axis through `[0, 0, 4]`, the lid's back edge on the base's top face.

## Joints and degree-of-freedom IDs

Every joint has a stable key, optional human `name`, `parent`, `child` and `origin: [x, y, z]`. The key is used by couplings and animation coordinates. Axes must be finite, nonzero vectors.

| `type`        | Additional fields                                                        | Coordinate IDs                              |
| ------------- | ------------------------------------------------------------------------ | ------------------------------------------- |
| `fixed`       | None                                                                     | None; welds the child to the parent.        |
| `revolute`    | `axis`, optional `limits`                                                | The joint key.                              |
| `prismatic`   | `axis`, optional `limits`                                                | The joint key.                              |
| `cylindrical` | `axis`, optional `limits: {angle?, distance?}`                           | `<joint>/angle`, `<joint>/distance`.        |
| `screw`       | `axis`, nonzero `lead`, `handedness` (`right`/`left`), optional `limits` | The joint key; one turn advances by `lead`. |
| `spherical`   | Optional symmetric `limits`                                              | `<joint>/x`, `<joint>/y`, `<joint>/z`.      |
| `planar`      | `normal`, perpendicular `xAxis`, optional `limits: {x?, y?, angle?}`     | `<joint>/x`, `<joint>/y`, `<joint>/angle`.  |

## Couplings and animations

`couplings` derive a follower coordinate from a driver: `{"driver": "pinion", "follower": "wheel", "ratio": -teeth_pinion / teeth_wheel}` means `follower = ratio × driver + offset`; a periodic `{"driver": "crank", "follower": "slider", "curve": {"driverPeriod": 360, "values": [0, 8, 0, -8]}}` samples one period and wraps. The graph must be acyclic, each follower has one coupling, and followers are not keyed in animations.

An animation is `{"id", "name"?, "duration", "loop"?, "keyframes"}` with `loop` `"none"`, `"repeat"` or `"pingPong"`; keyframes are ordered, inside `[0, duration]`, and key **driver** coordinate IDs. Keep every keyed value inside its limits. Author at least one meaningful clip that keys every independent driver.

## Verify and export

Render the entry and read the result: a geometry success can carry a `Mechanism ...` warning, in which case geometry is written without motion; an unknown shape name reports `UNKNOWN_COMPONENT` at `/links/<link>/shapes/<index>`. Open the Kinematics pane, play each clip, check directions and travel, then Reset. A GLB/glTF export keeps the mechanism only with `content: { includeTopology: true }`; STEP and STL carry no mechanism.
