## Contract

1. Author `main.cs` with local C# helpers/assets and public `PicoGK`; no Tau wrapper.
2. Create/publish geometry inside `Library.Go(voxelSizeMm, task)` using `Library.oViewer().Add(...)`.
3. The final viewer state is the model. `Remove`, `SetGroupVisible`, and `RemoveAllObjects` change it. Tau hosted Add owns a snapshot before returning; ordinary using statements may dispose temporary geometry. Add the same object again after a mutation to replace its published snapshot. Native Add captures geometry before return; its queue owns that data through processing/teardown.

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

For motion, read `kinematics-reference.md`. Keep moving parts separate; call `Viewer.SetMechanism(source)` inside `Library.Go` with JSON-equivalent data using canonical keys or PascalCase structural properties and exact part names. Give each independent motion a clip. Use millimetre/Z-up; Tau converts metadata with the GLB. PicoGK `Animation` does not declare Tau motion.

Fix model-evaluation warnings. Verify named hover, clip direction/travel, followers and Reset; check changed parameters or filtered views. Use GeoSpec for clearance only with qualified evidence for the full requirement; unavailable evidence remains unsupported. Playback does not prove clearance.

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

## Runtime and reference

`runtime-reference.md` covers lifetimes, backends and errors. The main index covers CAD/BCL; `embedding-api-index.md` covers host/native, diagnostics and subclasses. Accessibility is unchanged.
