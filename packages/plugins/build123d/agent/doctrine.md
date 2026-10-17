## Contract

1. Author `main.py` with a top-level `@dataclass(frozen=True) class Params` whose fields have scalar or `Literal` annotations and defaults. Use bundled Build123D 0.13 native geometry and joints.
2. Define synchronous `main(params: Params)` returning a native `Shape`/`Compound`, list/tuple of shapes, or `None`/an empty sequence.
3. Author reusable models with native `Compound`, ordinary functions or domain classes. Models run with Build123D outside Tau. Do not import or recreate a Tau Assembly/Motion framework.
4. Use static project-relative Python imports. Declare non-Python assets in `__tau__ = {"dependencies": [...]}` using paths from the project root. Imported modules may declare resources; texture-only edits must invalidate the model.
5. Labels are display text; repeated instances need distinct native objects. Tau owns tessellation and exact BRep edges; UVs are native face-local charts, not a whole-part atlas.

## Tessellation

Views and exports take `options.tessellation` as a preset or an explicit object, never both. Presets scale with the shape's bounding-box diagonal D: `low` (D/500, 30°) for a first look or a large assembly; `medium` (D/2000, 20°), the default for `evaluate_model`, `screenshot` and the viewer; `high` (D/8000, 12°), the export default; `extra-high` (D/32000, 6°) only when asked. The explicit `{ linearTolerance, angularTolerance }` is absolute, in millimetres and degrees, and does not scale with size; an omitted field keeps the kernel default (0.02 mm and 20° to view, 0.01 mm and 20° to export). Both forms together, such as `{ quality: 'high', linearTolerance: 0.01 }`, fail with `VALIDATION_ERROR`. A model cannot declare a tessellation hint yet, so keep it out of model parameters. Results report the effective `tessellation` (requested form, tolerances, triangles, vertices, elapsed); a view over 2 M triangles is re-meshed up to three steps coarser with a `TESSELLATION_DOWNGRADED` warning, and an export over 20 M fails with suggested tolerances.

## Reusable native mechanisms

```python
# Author call site: ordinary domain class using only native Build123D.
from dataclasses import dataclass
from build123d import Axis, Box, Compound, Location, RevoluteJoint, RigidJoint


@dataclass(frozen=True)
class Params:
    angle: float = 30


class Gearbox(Compound):
    def __init__(self, *, angle: float = 30):
        plate = Box(60, 40, 6)
        cover = Box(60, 40, 1).locate(Location((0, 0, 3.5)))
        # A native rigid compound owns passive geometry; the rotor is a separate body.
        housing = Compound(children=[plate, cover], label="Housing")
        driver = Box(20, 8, 4)
        follower = Box(16, 8, 4)
        RevoluteJoint("input", housing, axis=Axis.Z, angular_range=(-2000, 2000))
        RevoluteJoint("output", housing, axis=Axis((30, 0, 0), (0, 0, 1)),
                      angular_range=(-4000, 4000))
        RigidJoint("shaft", driver)
        RigidJoint("shaft", follower)
        RigidJoint("mount", housing)
        RigidJoint("tool", follower, Location((8, 0, 0)))
        housing.joints["input"].connect_to(driver.joints["shaft"], angle=angle)
        housing.joints["output"].connect_to(follower.joints["shaft"], angle=-2 * angle + 15)
        super().__init__(children=[housing, driver, follower], label="Gearbox")
        self.housing, self.driver, self.follower = housing, driver, follower
        self.input_angle = angle
        # Ordinary application data; no framework discovers this attribute implicitly.
        self.couplings = [{"driver": (housing.joints["input"], "angle"),
                           "follower": (housing.joints["output"], "angle"),
                           "ratio": -2, "offset": 15}]

    @property
    def mount(self):
        return self.housing.joints["mount"]

    @property
    def output(self):
        return self.follower.joints["tool"]


def main(params: Params):
    return Gearbox(angle=params.angle)


def motion(model):
    drive = (model.housing.joints["input"], "angle")
    return {"ground": model.housing, "couplings": model.couplings,
            "animations": [{"id": "turn", "duration": 4, "keyframes": [
                {"time": 0, "coordinates": {drive: model.input_angle}},
                {"time": 4, "coordinates": {drive: model.input_angle + 360}},
            ]}]}

```

## Mounting a reusable native compound

Place each fresh module before constructing its final parent compound. `relative_to` computes the native desired placement but records no connection. For an unparented gearbox with the safe `mount` property above:

```python
def mount_gearbox(module, source):
    target = module.mount
    target_in_module = module.global_location.inverse() * target.parent.global_location
    desired = source.parent.global_location * source.relative_to(target) * target_in_module.inverse()
    module.locate(desired)
    return (source, target)

left, right = Gearbox(angle=30), Gearbox(angle=-10)
# carrier has native RigidJoint("left", ...) and RigidJoint("right", ...).
mounts = [mount_gearbox(left, carrier.joints["left"]),
          mount_gearbox(right, carrier.joints["right"])]
model = Compound(children=[carrier, left, right])
# The root hook's connections list includes mounts AND every internal native pair.
# Compose ratios with [*left.couplings, *right.couplings], without rewriting them.
```

This is local domain code, not a required helper import. For an already-parented module, convert `desired` to parent coordinates with `module.parent.global_location.inverse() * desired` before `locate`. Existing ancestor aggregate BReps must then be rebuilt bottom-up while preserving each ancestor location; prefer finishing placement before parent aggregation. Calling `source.connect_to(module.mount)` alone moves only the target joint's parent and can split an articulated module.

Native `connect_to` is one-time placement, not a solver. Use `RigidJoint`, `RevoluteJoint`, `LinearJoint`, `CylindricalJoint` and `BallJoint` directly; native pair placement keywords are `angle`, `position` and `angles`. Connect final children before constructing their containing compound.

`Gearbox` above is ordinary project code, not a required base class or metadata protocol. Properties return actual descendant joints. Never assign a descendant joint into another `.joints` dictionary: assignment may transfer ownership. Keep each module's ratios in its local data. Root concatenates child data; it does not repeat their equations. Fresh factory instances are the default independent reuse recipe. For copies, rebind metadata to copied descendants and verify independence.

Group static/passive geometry under a native connected `Compound`, as the housing/cover above. Product containment alone does not choose a rigid body. A nested housing is not world-grounded; root `motion(model)["ground"]` chooses the fixed body. Native unambiguous retained connections are discovered from the returned geometry.

`motion(model)` returns plain data: `ground`, `couplings`, `animations`, and only when necessary explicit `connections` or `occurrence_ids`. Coordinate selectors are `(native_joint, "angle" | "distance" | "x" | "y" | "z")`; use `((source_joint, target_joint), coordinate)` when one joint participates in multiple edges. Ball x/y/z are its final composed intrinsic XYZ angles. Values are absolute native degrees/millimetres; the adapter lowers them once into canonical metre/degree deltas. A 30° → 390° authored clip becomes 0° → 360° wire deltas.

Native latest-target pointers can lose earlier edges. When needed, retain the actual pairs as ordinary local data and compose them into `connections`: `(source, target)` if final native state suffices, or `{"source": source, "target": target, "angle": 30}` (native `position`/`angles` for other pairs) when reference values cannot be recovered. When `connections` is supplied it is the complete connection list, including internal native pairs; it does not add to inferred pairs. Explicit data describes final geometry; it does not move it. The adapter checks reference placement using native `relative_to`; do not guess missing edge values. `occurrence_ids` maps stable strings to actual returned native shapes when structural paths are insufficient; labels are not identity.

Couplings declare `follower = ratio * driver + offset`. Initial native placement must satisfy that equation; retain the domain's authored input values for clips. Mixed-dimensional ratios carry native unit quotients. Unknown/stale endpoints, ambiguous coordinates, nonfinite values, invalid phases and competing/cyclic drivers are rejected. Valid unsupported physical graphs retain intent and diagnostics; they are not promised general closed-loop playback.

## Native materials

`Shape.material` uses native `bd_materials` finished materials. Built-in textured materials carry their packaged images. Use `Shape.color` for a simple color without a material. Engineering physical-property publication is separate from appearance.

For a custom image, use native `threejs_materials.PbrProperties`, `PbrValues`, `PbrMaps(color="finish.png")` with `maps_dir=Path(__file__).parent`, then `bd_materials.FinishedMaterial(metals.aluminum().material, pbr=pbr)`. Add `finish.png` to `__tau__.dependencies` (project-relative, even when the Python module lives in a subdirectory). Native image data URIs are also supported. Exported GLB embeds its images; remote URLs and paths outside the project are rejected.

## Native modeling

Prefer Build123d features and sketches. Builder mode (`with BuildPart() as part:` … `part.part`) and algebra mode (`Pos(x, y, z) * Box(...) - Cylinder(...)`) both work. Use native `Select.NEW` and `Select.LAST` for operation history; Tau recomputes operations whose native semantics cannot survive BRep cache restoration.

Wrong: `Cylinder(radius=4, height=10, base=(0, 0, 5))`. Correct: `Pos(0, 0, 5) * Cylinder(4, 10)`, or `Locations` in builder mode. Read the native API reference before assuming an OCP call or a method from another kernel.

## Verify

Test the model with a TypeScript `main.geospec.ts` (activate `geospec-authoring`): `await loadModel({ file: 'main.py' })`, then `expectGeo(model)`. Inspect assembly hierarchy, exact edges, materials and joint playback in Tau. For sharing, export the Tau GLB so topology, interfaces, mechanism intent and embedded textures travel together. Current native STEP export carries geometry, hierarchy and supported native appearance; do not claim it embeds editable source or mechanism data.
