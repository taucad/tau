## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults. Use bundled Build123D 0.13 native geometry and joints.
2. Define synchronous `main(params: Params)` returning a native `Shape` (including `tau_assembly.Assembly`), list/tuple of shapes, or `None`/an empty list.
3. For articulated reusable modules, import `Assembly` from `tau_assembly`. It is Tau's native `Compound` subclass, not upstream Build123D. Name distinct child occurrences with `children={"name": shape}`; use `.parts` to retrieve them. Native `Compound` remains suitable for static grouping. Labels are display text.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}` using paths from the project root. Imported modules may declare resources; texture-only edits must invalidate the model.
5. Tau owns tessellation and exact BRep edges. UVs are native face-local charts, not a whole-part atlas. No render tolerance in `Params`.

## Reusable native mechanisms

```python
from copy import copy
from dataclasses import dataclass
from build123d import Axis, Box, Location, RevoluteJoint, RigidJoint
from tau_assembly import Assembly
@dataclass(frozen=True)
class Params:
    angle: float = 30
def gearbox(*, angle=30):
    housing, rotor, follower = Box(60, 40, 6), Box(20, 8, 4), Box(16, 8, 4)
    cover = Box(60, 40, 1).locate(Location((0, 0, 3.5)))
    RevoluteJoint("input", housing, axis=Axis.Z, angular_range=(-2000, 2000))
    RevoluteJoint("output", housing, axis=Axis((30, 0, 0), (0, 0, 1)), angular_range=(-4000, 4000))
    RigidJoint("shaft", rotor)
    RigidJoint("shaft", follower)
    RigidJoint("mount", housing)
    RigidJoint("tool", follower)
    module = Assembly(children={"housing": housing, "rotor": rotor, "follower": follower, "cover": cover}, base=housing, label="Gearbox")
    drive = module.connect("input", housing.joints["input"], rotor.joints["shaft"], angle=angle)
    output = module.connect("output", housing.joints["output"], follower.joints["shaft"], angle=-2 * angle + 15)
    module.couple(driver=(drive, "angle"), follower=(output, "angle"), ratio=-2, offset=15)
    module.expose_joint("mount", housing.joints["mount"])
    module.expose_joint("output", follower.joints["tool"])
    return module
def main(params: Params):
    prototype = gearbox(angle=params.angle)
    left, right = copy(prototype), copy(prototype)
    base = Box(200, 80, 6)
    RigidJoint("left", base, Location((-60, 0, 0)))
    RigidJoint("right", base, Location((60, 0, 0)))
    machine = Assembly(children={"base": base, "left": left, "right": right})
    machine.connect("left_mount", base.joints["left"], left.interfaces["mount"])
    machine.connect("right_mount", base.joints["right"], right.interfaces["mount"])
    return machine
def motion(model):
    drive = model.parts["left"].connections["input"]
    start = drive.coordinates["angle"]
    return {"ground": model.parts["base"],
        "animations": [{
            "id": "turn", "duration": 4,
            "keyframes": [
                {"time": 0, "coordinates": {(drive, "angle"): start}},
                {"time": 4, "coordinates": {(drive, "angle"): start + 360}},
            ],
        }]}
```

`Assembly.connect(name, source, target, **coordinates)` retains the relationship and performs native placement. Native `connect_to` itself remains one-time placement. Use native `RigidJoint`, `RevoluteJoint`, `LinearJoint`, `CylindricalJoint` and `BallJoint`; do not invent replacement joint classes. Native connection keywords are `angle`, `position` and `angles` as appropriate to the pair.

`Assembly.couple` owns `follower = ratio * driver + offset`; initial native placement must already satisfy this equation. References are `(connection, "angle")`, `(connection, "distance")`, or `(connection, "x"/"y"/"z")` for Ball's final composed intrinsic XYZ chart. A mixed-dimensional ratio carries the corresponding native unit quotient. The assembly validates finite values, phase consistency and competing/cyclic drivers. It does not solve a closed mechanism loop.

`expose_joint` publishes a descendant endpoint in read-only `.interfaces`. Connect through that interface to move the whole target module coherently. Never assign a descendant joint into another native `.joints` dictionary: assignment can transfer its native ownership. `.parts`, `.connections` and `.interfaces` are read-only named registries. Copies rebind their own internal references; retrieve a copied connection from the copy. Fresh factories and `copy`/`deepcopy` produce independent instances. Do not insert one shape object twice or reference a prototype's endpoint from its copy.

Use `Assembly(children={...}, base=housing)` when otherwise unjointed passive parts (for example a cover) belong to the housing body. This local base is not global ground and moves with its parent. Do not infer it from connection direction or the interface used for mounting: a module may be mounted through its moving output. Without a unique passive owner, supply `base` or group passive parts under a connected native `Compound`. Copies rebind the base to their copied occurrence. The worker discovers nested Assembly relationships automatically. Parent code connects public interfaces and does not repeat a child's internal ratios. Keep root `ground` and optional `animations` in `motion(model)`; do not add `connections`, `couplings` or `occurrence_ids` to that hook. A nested housing is not independently grounded to world. Ground is inferable for an unambiguous native graph; otherwise name the actual root occurrence.

Author placement, coupling offsets and keyframes use **absolute native degrees and millimetres**. Use `connection.coordinates` for the authored reference. Export converts once to metre/degree deltas; do not subtract phase yourself. Migrating an older Tau hook requires replacing delta keyframes with absolute native coordinates and metre distances with millimetres. The clip structure is unchanged; no extra Motion/Track/decorator API is needed.

On `ValueError` for an external/stale endpoint, reconnect actual returned children. For a duplicate interface/connection name, choose a distinct name. For phase mismatch, correct the initial native placement to satisfy the declared ratio and offset. Valid unsupported graphs retain intent with diagnostics; inspect them rather than claiming executable playback. The helper is bundled in Tau. Outside Tau, make the shipped `tau_assembly.py` module importable alongside Build123D 0.13; do not invent a pip dependency or `build123d.Assembly` import.

## Native materials

`Shape.material` uses native `bd_materials` finished materials. Built-in textured materials carry their packaged images. Use `Shape.color` for a simple color without a material. Engineering physical-property publication is separate from appearance.

For a custom image, use native `threejs_materials.PbrProperties`, `PbrValues`, `PbrMaps(color="finish.png")` with `maps_dir=Path(__file__).parent`, then `bd_materials.FinishedMaterial(metals.aluminum().material, pbr=pbr)`. Add `finish.png` to `__tau__.dependencies` (project-relative, even when the Python module lives in a subdirectory). Native image data URIs are also supported. Exported GLB embeds its images; remote URLs and paths outside the project are rejected.

## Native modeling

Prefer Build123d features and sketches. Builder mode (`with BuildPart() as part:` … `part.part`) and algebra mode (`Pos(x, y, z) * Box(...) - Cylinder(...)`) both work. Use native `Select.NEW` and `Select.LAST` for operation history; Tau recomputes operations whose native semantics cannot survive BRep cache restoration.

Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: `Pos(0, 0, 5) * Cylinder(4, 10)`, or `Locations` in builder mode. Read the native API reference before assuming an OCP call or a method from another kernel.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`. Inspect assembly hierarchy, exact edges, materials and joint playback in Tau. For sharing, export the Tau GLB so topology, interfaces, mechanism intent and embedded textures travel together. Current native STEP export carries geometry, hierarchy and supported native appearance; do not claim it embeds editable source or mechanism data.
