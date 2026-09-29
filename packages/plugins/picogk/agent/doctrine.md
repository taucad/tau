## Contract

1. Write ordinary `main.cs` with optional local C# helpers/assets and the public `PicoGK` API; no Tau authoring wrapper.
2. Call `Library.Go(voxelSizeMm, task)`; create and publish geometry inside `task` with `Library.oViewer().Add(...)`.
3. The final viewer state is the model. `Remove`, `SetGroupVisible`, and `RemoveAllObjects` change it. Keep displayed geometry alive; dispose temporary operands.

## Canonical pattern

```csharp
using System.Numerics;
using PicoGK;

Library.Go(1.0f, () =>
{
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20.0f), "Hub");
});
```

Tau captures the final scene as mesh topology, not precise BRep. Smaller voxels raise memory and runtime cost sharply. Use project-relative assets.

## Part names and mechanisms

Name each part with `Viewer.Add(geometry, name, nGroupID)`; use unique full labels and indexes in loops. Groups control appearance/transforms; slash labels do not create assemblies. Unnamed parts get `Shape N`.

For naming or moving parts, read `kinematics-reference.md`. Keep moving parts separate; call `Viewer.SetMechanism(source)` inside `Library.Go` with lowercase JSON-equivalent data referencing exact authored names. Author a clip for every intended independent motion. Use the as-built millimetre/Z-up frame; Tau converts metadata with the GLB. PicoGK `Animation` does not declare Tau motion.

Inspect `get_kernel_result` and fix mechanism warnings even when geometry renders. Verify named hover, each clip's direction/travel, coupled followers and Reset in the Kinematics pane; check a changed parameter or filtered view. Validate geometry with GeoSpec separately; playback does not prove clearance.

## Interactive parameters

Optional `Params` property initializers are standalone defaults; Tau overrides selected values. Use `bool`, `int`, `float`, `double`, `string`, or local enums. Use `Range` and `Display` attributes. Defaults must be finite, non-null compile-time constants; avoid an explicit static constructor.

```csharp
using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
    Library.oViewer().Add(Voxels.voxSphere(System.Numerics.Vector3.Zero, 20f), "Hub"));

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;
}
```
