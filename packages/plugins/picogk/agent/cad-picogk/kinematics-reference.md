# PicoGK named parts and kinematics

Read this when authoring named PicoGK parts or a moving model: hinges, sliders, shafts, gears, fans or linkages. Use ordinary C# in `main.cs` and the hosted `PicoGK.Viewer` API. A moving model needs separate named geometry, a mechanism and a clip exercising each intended independent motion. A single rigid part needs no mechanism.

## Name the final scene

Inside `Library.Go`, call `viewer.Add(geometry, name, nGroupID)` for each `Voxels`, `Mesh` or `PolyLine`. The group argument defaults to zero. Names are case-sensitive, nonempty, have no surrounding whitespace and must be unique among final visible parts. Invalid names fail with `CS_TAU_INVALID_NAME`. Generate names from the part family and occurrence, such as `$"Compressor / Blade {i + 1:D3}"`; a slash is literal label text, not an assembly hierarchy.

Group IDs control appearance and transforms. Several named parts may share a group. Re-adding the same geometry object updates that object's scene entry; create distinct objects for distinct occurrences. Renaming an object preserves its build-local component ID. Those IDs are not stable across reordered builds: author mechanisms against full names, never captured IDs or generated `Shape N` labels.

The final visible scene is authoritative. Removing or hiding a referenced part requires corresponding mechanism changes. A filtered component view can omit its mechanism or supply a valid reduced tree; it cannot reference absent parts. `RemoveAllObjects()` clears geometry, names and mechanism, so register the replacement mechanism after rebuilding the scene.

## Complete C# hinged model

This standalone `main.cs` uses two closed meshes, keeps the lid in its reference pose, and registers a parameter-dependent opening clip. Tau's patched SDK supplies the named overloads and `SetMechanism`; no additional Tau C# namespace is needed.

```csharp
using System;
using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(0.5f, () =>
{
    if (!float.IsFinite(Params.OpenDegrees) || Params.OpenDegrees < 1 || Params.OpenDegrees > 150)
        throw new ArgumentOutOfRangeException(nameof(Params.OpenDegrees));

    var viewer = Library.oViewer();
    var baseMesh = Utils.mshCreateCube(new BBox3(0, 0, 0, 60, 40, 4));
    var lidMesh = Utils.mshCreateCube(new BBox3(0, 0, 4, 60, 40, 7));
    viewer.Add(baseMesh, "Base", 0);
    viewer.Add(lidMesh, "Lid", 1);
    viewer.SetMechanism(new
    {
        schemaVersion = 1,
        units = new { length = "mm", angle = "deg" },
        root = "base",
        links = new
        {
            @base = new { shapes = new[] { "Base" } },
            lid = new { shapes = new[] { "Lid" } },
        },
        joints = new
        {
            hinge = new
            {
                type = "revolute", name = "Lid hinge", parent = "base", child = "lid",
                origin = new[] { 0f, 0f, 4f }, axis = new[] { 1f, 0f, 0f },
                limits = new { lower = 0f, upper = Params.OpenDegrees },
            },
        },
        animations = new[]
        {
            new
            {
                id = "open-close", name = "Open and close", duration = 2, loop = "pingPong",
                keyframes = new[]
                {
                    new { time = 0, coordinates = new { hinge = 0f } },
                    new { time = 2, coordinates = new { hinge = Params.OpenDegrees } },
                },
            },
        },
    });
});

public static class Params
{
    [Range(1, 150)]
    public static float OpenDegrees { get; set; } = 110f;
}
```

Expected: hover labels `Base` and `Lid`, one `Lid hinge` control, and an `Open and close` clip. Only the lid rotates about the X-axis through `[0, 0, 4]` mm. Reset returns to the closed reference pose. C# `@base` serializes as the JSON key `base`.

## Shared mechanism contract

`SetMechanism(object source)` accepts the JSON shape of `MechanismSource` from `@taucad/kinematics`; that is a contract name, not a C# import. Set `schemaVersion = 1`, explicit `units`, `root`, `links` and `joints`. `links.<key>.shapes` lists exact authored names that move rigidly together. Each shape belongs to at most one link. Include moving pins, bolts and attached parts in their carrier's link. The grounded root may have an empty `shapes` array. Every other link has exactly one incoming joint, forming a connected tree.

Use the as-built frame after any object/group transforms: origins are points, while axes, normals and in-plane axes are directions in that frame. PicoGK geometry uses millimetres and Z-up; use `length = "mm"` and `angle = "deg"` or `"rad"`. Tau resolves names to component IDs and converts both geometry and metadata into GLB metres/Y-up. Do not preconvert just the mechanism or embed transforms for an already posed model again.

Coordinates are deltas from the rendered reference pose. Driver zero means Reset. If parameters already move geometry, recompute as-built origins/axes and shift limits accordingly. Finite, nonzero axes are normalized. Limits are inclusive and must contain the as-built coordinate (zero for drivers).

| Joint `type` | Additional fields | Coordinate IDs |
| --- | --- | --- |
| `fixed` | None | None; rigid connection |
| `revolute` | `axis`, optional `limits` | Joint key; angle |
| `prismatic` | `axis`, optional `limits` | Joint key; distance |
| `cylindrical` | `axis`, optional `limits: { angle?, distance? }` | `<joint>/angle`, `<joint>/distance` |
| `screw` | `axis`, nonzero `lead`, `handedness: "right"` or `"left"`, optional `limits` | Joint key; angle; one turn advances by signed `lead` in length units |
| `spherical` | Optional symmetric `limits` (`lower = -upper`) | `<joint>/x`, `<joint>/y`, `<joint>/z`; rotation-vector angles |
| `planar` | `normal`, perpendicular `xAxis`, optional `limits: { x?, y?, angle? }` | `<joint>/x`, `<joint>/y`, `<joint>/angle` |

All joints have `parent`, `child`, `origin` and optional display `name`. A scalar limit is `{ lower, upper }`. Use one link for rigidly attached parts, or a fixed joint when a rigid hierarchy is useful. A fixed-only tree has no moving controls.

## C# records, dictionaries and snapshots

Anonymous objects with lowercase wire property names are the shortest authoring form. Ordinary public readable properties, string-key dictionaries (including `ExpandoObject`), arrays/sequences, JSON scalars, `JsonElement` and `JsonNode` are supported. Fields and user serializer attributes/converters do not define the payload; `[JsonPropertyName]` cannot rename a PascalCase property here. Use string discriminants such as `type = "revolute"`; CLR enums serialize numerically.

Use `Dictionary<string, object>` for dynamic link/joint names or names containing `/`. Use `Dictionary<string, double>` for coordinates such as `["spindle/angle"] = 45`. When an array mixes anonymous object shapes (different joint/clip/keyframe layouts), use `new object[] { ... }` rather than an implicitly typed `new[]` that C# cannot unify. Keep finite numbers and string keys throughout; no callbacks or live geometry handles belong in this data.

Capture snapshots the supplied data immediately. Later mutation has no effect; call `SetMechanism` again to replace it. Recompute it inside the build callback on every parameter-driven render. Invalid serialization clears previous mechanism metadata and emits `CS_TAU_MECHANISM_SERIALIZATION`, retaining geometry. CLR traversal rejects cycles, more than 64 nested levels or 100,000 visited values; serialized JSON is limited to 256 KiB. Parsed JSON is also subject to JSON depth/size constraints. Prefer one final valid registration per build and fix every warning.

## Couplings and animation

`couplings` is an optional array. A linear coupling has `driver`, `follower`, `ratio` and optional `offset` (default zero): follower = ratio × driver + offset. Gear pairs commonly use a negative tooth-count ratio. Rack-and-pinion in mm/degrees uses signed ratio `2 * Math.PI * pitchRadius / 360`. The ratio's units are follower units per driver unit.

A periodic coupling replaces `ratio` with `curve = new { driverPeriod = 360, values = new[] { 0, 8, 0, -8 } }`. Values sample equally spaced driver positions over one period, interpolate linearly and wrap. This can approximate a cam or slider-crank; it does not solve arbitrary closed loops or contact. The coupling graph is acyclic, each follower has one coupling, and followers cannot be directly keyframed. Its value at driver zero must be consistent with the as-built relationship and follower limits.

Each animation has unique `id`, optional `name`, positive `duration` in seconds, `loop` (`"none"`, `"repeat"`, `"pingPong"`) and ordered `keyframes` inside `[0, duration]`. Each keyframe has `time` and finite `coordinates` keyed by driver DOF IDs. Each coordinate interpolates linearly between keyframes that define it; omitting it from an intermediate keyframe does not insert a hold. Before its first or after its last keyed sample, it holds that endpoint value. Keep keyed values within limits. Author clips that exercise every intended independent motion; coupled followers move from their drivers. The pane's generic Sweep drivers does not replace an authored sequence. PicoGK's own `Animation` API does not create this metadata.

## Verify delivery

1. Render the final parameters and inspect `get_kernel_result`. Geometry success can coexist with mechanism warnings. Fix `INVALID_REFERENCE`/`INVALID_ANNOTATION` warnings; their mechanism detail includes a JSON path and cause such as `UNKNOWN_COMPONENT`. Invalid metadata leaves geometry without the rejected mechanism.
2. Hover several parts, including repeated instances. Confirm exact semantic labels, not `Shape N` or group-derived names. Open Kinematics and confirm every intended driver and follower is present.
3. Select each authored clip (selection starts playback), check direction and travel of every independent body and coupled follower, then Reset. Test a parameter variant and any filtered view. Fixed-only mechanisms have no playback.
4. Export GLB and check that names, ownership and mechanism survive together. Tau writes resolved IDs to `TAU_cad_topology.mechanism` and node `tauComponentId`; authors do not construct those IDs. Validate mesh integrity, dimensions and interference with GeoSpec separately. Discrete pose checks establish only sampled clearance.

The tracked flagship is `libs/tau-examples/src/kernels/picogk/turbofan/main.cs` in the Tau workspace: names are derived from `assembly.json`, all 2,173 occurrences are assigned to frame/LP/HP links, and a two-spool clip drives both rotors. Its `README.md` and GeoSpec suite record verification commands. The miniature example above is self-contained when the repository example is unavailable.
