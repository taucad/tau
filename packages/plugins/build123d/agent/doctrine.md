## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults. Use the bundled Build123d 0.13 native API.
2. Define `main(params: Params)` returning a native `Shape`, a list/tuple of shapes, or `None`/an empty list for an empty scene.
3. Use native `Part`/`Solid` values and `Compound(children=[...])` for assemblies. Each occurrence must be a distinct native object; copy before placing a reused part. Labels are display names and may repeat; they do not define occurrence identity.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}` using paths from the project root. Imported part modules may declare their own assets. Project texture files must be declared so image-only edits invalidate the model.
5. Keep render tessellation out of `Params`; Tau owns display tolerance, native UV generation and exact BRep edge rendering. UVs use native face-local [0, 1] charts; this does not promise a whole-part texture atlas.

## Native parts, materials and joints

```python
from dataclasses import dataclass
from bd_materials import metals, wood
from build123d import Axis, Box, Compound, RevoluteJoint, RigidJoint

@dataclass(frozen=True)
class Params:
    angle: float = 22.5

def main(params: Params):
    base = Box(40, 40, 6)
    base.label = "Base"
    base.material = metals.aluminum()
    arm = Box(60, 12, 4)
    arm.label = "Arm"
    arm.material = wood.walnut()
    RevoluteJoint("shaft", base, axis=Axis.Z, angle_reference=(1, 1, 0))
    RigidJoint("mount", arm)
    base.joints["shaft"].connect_to(arm.joints["mount"], angle=params.angle)
    return Compound(label="Pivot", children=[base, arm])

def motion(model):
    base, arm = model.children
    shaft = base.joints["shaft"]
    return {
        "ground": base,
        "occurrence_ids": {"base": base, "arm": arm},
        "animations": [{
            "id": "turn",
            "name": "Turn",
            "duration": 2,
            "keyframes": [
                {"time": 0, "coordinates": {shaft: 0}},
                {"time": 2, "coordinates": {shaft: 90}},
            ],
        }],
    }
```

`Shape.material` uses native `bd_materials` finished materials. Built-in textured materials carry their packaged images. Use `Shape.color` for a simple color without a material. Engineering physical-property publication is separate from appearance.

For a custom image, use native `threejs_materials.PbrProperties`, `PbrValues`, `PbrMaps(color="finish.png")` with `maps_dir=Path(__file__).parent`, then `bd_materials.FinishedMaterial(metals.aluminum().material, pbr=pbr)`. Add `finish.png` to `__tau__.dependencies` (project-relative, even when the Python module lives in a subdirectory). Native image data URIs are also supported. Exported GLB embeds its images; remote URLs and paths outside the project are rejected.

Attach named interfaces with native `RigidJoint`, `RevoluteJoint`, `LinearJoint`, `CylindricalJoint` or `BallJoint`; connect them with native `connect_to`. Unconnected interfaces remain portable. Native angle references, local placement and joint limits are retained; do not subtract a reference angle to compensate for older Build123d behavior.

Connect the final child instances before constructing their `Compound`. If a connection moves a child after containment, refresh the native aggregate with `assembly.children = assembly.children` before placing it in a parent or exporting it; otherwise the Compound's cached BRep can retain the old child geometry. Expose a moving descendant's named joint through the ordinary mapping, for example `module.joints["output"] = rotor.joints["output"]`. Consumers can connect through that public name without indexing private children, and the interface stays owned by the moving rotor.

`motion(model)` is Tau's optional declaration hook, not a released Build123d API. Use it only for facts native placement does not retain: `ground`, stable `occurrence_ids`, explicit `connections`, coupled motion and animation. Return a dictionary referencing the actual objects returned by `main`; no imports from an invented `build123d.mechanisms` module.

- `connections`: list of `(source_joint, target_joint)` pairs, useful when native `connected_to` has been overwritten by another connection.
- `couplings`: list of `{"driver": joint, "follower": other_joint, "ratio": -2.0}`; optional `offset`. For a joint with multiple coordinates, use `(joint, "angle")` or `(joint, "distance")`.
- Animation keyframe coordinates are **deltas from the exported assembled pose** in degrees and meters. Native `connect_to` uses Build123d degrees and millimeters. For a ball joint, use `(joint, "x")`, `(joint, "y")`, `(joint, "z")`; these deltas apply to the final composed intrinsic XYZ chart native Build123d range-checks, including its reference frame.
- Each reusable subassembly's occurrences need separate objects and identifiers. Set one assembly ground; an embedded module must not introduce another global ground.
- Tau preserves valid mechanical intent even when its viewer cannot execute that graph; inspect mechanism diagnostics. Native `connect_to` is placement, not a general closed-loop or dynamics solver.

## Native modeling

Prefer Build123d features and sketches. Builder mode (`with BuildPart() as part:` … `part.part`) and algebra mode (`Pos(x, y, z) * Box(...) - Cylinder(...)`) both work. Use native `Select.NEW` and `Select.LAST` for operation history; Tau recomputes operations whose native semantics cannot survive BRep cache restoration.

Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: `Pos(0, 0, 5) * Cylinder(4, 10)`, or `Locations` in builder mode. Read the native API reference before assuming an OCP call or a method from another kernel.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`. Inspect assembly hierarchy, exact edges, materials and joint playback in Tau. For sharing, export the Tau GLB so topology, interfaces, mechanism intent and embedded textures travel together. Current native STEP export carries geometry, hierarchy and supported native appearance; do not claim it embeds editable source or mechanism data.
