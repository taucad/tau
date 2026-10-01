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

## Materials

For PBR or textures, read `materials-reference.md`. Assign `PicoGK.Material` with `Viewer.SetGroupMaterial(groupId, material)`; the legacy overload remains valid. Appearance does not certify material grade.

## Part names and mechanisms

Use unique `Viewer.Add(geometry, name, nGroupID)` labels, indexed in loops. Groups control appearance/transforms; slash labels do not create assemblies. Unnamed parts get `Shape N`.

For motion, read `kinematics-reference.md`. Keep moving parts separate; call `Viewer.SetMechanism(source)` inside `Library.Go` with lowercase JSON-equivalent data and exact part names. Give each independent motion a clip. Use millimetre/Z-up; Tau converts metadata with the GLB. PicoGK `Animation` does not declare Tau motion.

Fix `get_kernel_result` warnings. Verify named hover, clip direction/travel, followers and Reset; check changed parameters or filtered views. Use GeoSpec for clearance only with qualified evidence for the full requirement; unavailable evidence remains unsupported. Playback does not prove clearance.

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
