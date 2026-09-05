---
name: cad-picogk
description: Guides trusted, upstream-compatible PicoGK C# voxel authoring in main.cs. Use when creating or editing PicoGK projects in Tau Desktop.
---

# PicoGK C# authoring

## Contract

1. Author an ordinary C# console program in `main.cs`, with optional project-local `.cs` helpers and assets.
2. Use the public `PicoGK` API directly. Do not import a Tau authoring namespace or return a Tau-specific model wrapper.
3. Call `Library.Go(voxelSizeMm, task)` from the program entry point. Create geometry inside `task` using normal PicoGK APIs.
4. Publish display geometry with `Library.oViewer().Add(...)`. Set appearance with `SetGroupMaterial`; meshes, voxels, and polylines are supported.
5. Treat the final viewer state as the model result. `Remove`, `SetGroupVisible`, and `RemoveAllObjects` affect what Tau renders after the task completes.
6. Keep final displayed geometry alive until the task returns. Dispose temporary operands normally.
7. For interactive Tau controls, opt in with one global `public static class Params`. Use public static read/write auto-properties with compile-time defaults, then read those properties from ordinary PicoGK code.

## Canonical pattern

```csharp
using System.Numerics;
using PicoGK;

Library.Go(1.0f, () =>
{
    var sphere = Voxels.voxSphere(Vector3.Zero, 20.0f);
    Library.oViewer().SetGroupMaterial(0, "4f7dd9", 0.2f, 0.7f);
    Library.oViewer().Add(sphere);
});
```

This is standard PicoGK source: official PicoGK examples and ShapeKernel preview helpers use the same `Library.Go` and viewer APIs. Tau hosts the viewer without opening a second native window and renders the captured final scene after each completed run. Smaller voxels increase fidelity and memory/runtime cost sharply. Prefer voxel booleans and fields, use project-relative assets, and treat output as mesh topology rather than precise BRep.

## Interactive parameters

The optional `Params` convention keeps source runnable as a normal PicoGK console program: its property initializers are the standalone defaults, and Tau sets selected values before invoking the same entry point. Supported property types are `bool`, `int`, `float`, `double`, `string`, and project-local enums. Use standard `System.ComponentModel.DataAnnotations.Range` for numeric limits and `Display` for labels, descriptions, and order. Defaults must be finite, non-null compile-time constants; do not add an explicit static constructor.

```csharp
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
    Library.oViewer().Add(Voxels.voxSphere(Vector3.Zero, Params.RadiusMm)));

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Order = 1)]
    public static float RadiusMm { get; set; } = 20f;
}
```
