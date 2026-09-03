---
name: cad-picogk
description: Guides trusted PicoGK C# voxel authoring in main.cs. Use when creating or editing PicoGK projects in Tau Desktop.
---

# PicoGK C# authoring

## Contract

1. Author `main.cs` plus optional project-local `.cs` helpers.
2. Define exactly one top-level `public sealed record Params` with public `init` scalar properties and compile-time defaults. Include a positive finite `float VoxelSizeMm`.
3. Use `Range` and `Display` from `System.ComponentModel.DataAnnotations` for parameter bounds and labels. Supported types are `bool`, `int`, `float`, `double`, `string`, and project enums.
4. Define exactly one top-level `public static class Model` with `public static TauModel Build(Params parameters)`.
5. Return `TauModel.Create(...)` containing uniquely named `TauComponent.FromVoxels` or `TauComponent.FromMesh` values. Ownership transfers to the returned model; dispose only temporary operands.
6. Never call `Library.Go`, `Library.oViewer()`, or viewer APIs. Tau owns the PicoGK library, render loop, and viewer.

## Canonical pattern

```csharp
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;
using Tau.PicoGK;

public sealed record Params
{
    [Range(0.25, 5.0), Display(Name = "Voxel size", Order = 0)]
    public float VoxelSizeMm { get; init; } = 1.0f;

    [Range(2.0, 100.0), Display(Name = "Radius", Order = 1)]
    public float RadiusMm { get; init; } = 20.0f;
}

public static class Model
{
    public static TauModel Build(Params parameters)
    {
        var sphere = Voxels.voxSphere(Vector3.Zero, parameters.RadiusMm);
        return TauModel.Create(TauComponent.FromVoxels("Sphere", sphere, "#4f7dd9"));
    }
}
```

Smaller voxels increase fidelity and memory/runtime cost sharply. Prefer voxel booleans and fields, use project-relative assets, keep component names stable, and treat output as mesh topology rather than precise BRep.
