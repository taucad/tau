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
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, 20.0f));
});
```

Tau captures the final scene as mesh topology, not precise BRep. Smaller voxels raise memory and runtime cost sharply. Use project-relative assets.

## Part names and mechanisms

Use `Viewer.Add(Voxels|Mesh|PolyLine geometry, string name, int nGroupID = 0)` to name each part uniquely; include indexes in loops. A slash is label text, not an assembly. Groups control appearance/transforms. Unnamed parts get `Shape N` labels.

For motion, call `Viewer.SetMechanism(object source)` inside `Library.Go`. Supply JSON-equivalent `@taucad/kinematics` source with exact lowercase `schemaVersion`, `units` (`length: "mm"`, `angle: "deg"` or `"rad"`), `root`, `links.*.shapes`, and `joints`. Reference authored names, never `Shape N`. Anonymous objects, plain public properties, dictionaries, arrays, primitives, and `JsonElement` work; custom converters and `JsonPropertyName` do not. Tau resolves build-local IDs and converts millimetre/Z-up metadata with the GLB vertices. Invalid metadata warns while geometry renders. PicoGK `Animation` does not create Tau mechanism metadata.

## Interactive parameters

Optional `Params` property initializers are standalone defaults; Tau overrides selected values. Use `bool`, `int`, `float`, `double`, `string`, or local enums. Use `Range` and `Display` attributes. Defaults must be finite, non-null compile-time constants; avoid an explicit static constructor.

```csharp
using System.ComponentModel.DataAnnotations;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
    Library.oViewer().Add(Voxels.voxSphere(System.Numerics.Vector3.Zero, 20f)));

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;
}
```
