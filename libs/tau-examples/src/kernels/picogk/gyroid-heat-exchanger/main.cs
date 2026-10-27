using System;
using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

// A gyroid core between two header caps, each with a port offset from the other.
// PicoGK evaluates the implicit on a native OpenVDB grid. The browser twin
// (PicoVoxel) can show a small lantern; a ported heat-exchanger block is what
// the native voxel size is for. Unverified here: PicoGK seals a macOS arm64 closure.

Library.Go(Params.VoxelSizeMm, () =>
{
    float hx = Params.LengthMm * 0.5f;
    float hy = Params.WidthMm * 0.5f;
    float hz = Params.HeightMm * 0.5f + Params.StubMm;
    var block = new Voxels(
        new HeatExchanger(),
        new BBox3(-hx - 1f, -hy - 1f, -hz - 1f, hx + 1f, hy + 1f, hz + 1f));
    Library.oViewer().SetGroupMaterial(0, "b87333", 0.85f, 0.38f);
    Library.oViewer().Add(block, "Heat exchanger");
});

sealed class HeatExchanger : IImplicit
{
    public float fSignedDistance(in Vector3 p)
    {
        float hx = Params.LengthMm * 0.5f;
        float hy = Params.WidthMm * 0.5f;
        float hz = Params.HeightMm * 0.5f;
        float cap = Params.CapMm;
        float scale = 2f * MathF.PI / Params.CellMm;
        float field =
            MathF.Sin(p.X * scale) * MathF.Cos(p.Y * scale) +
            MathF.Sin(p.Y * scale) * MathF.Cos(p.Z * scale) +
            MathF.Sin(p.Z * scale) * MathF.Cos(p.X * scale);
        float gyroid = MathF.Abs(field) - Params.WallMm;
        float core = Box(p.X, p.Y, p.Z, hx, hy, hz - cap);
        float lattice = MathF.Max(gyroid, core);
        float topCap = Box(p.X, p.Y, p.Z - (hz - cap * 0.5f), hx, hy, cap * 0.5f);
        float bottomCap = Box(p.X, p.Y, p.Z + (hz - cap * 0.5f), hx, hy, cap * 0.5f);
        float body = MathF.Min(lattice, MathF.Min(topCap, bottomCap));
        float topPort = Port(p, Params.PortOffsetMm, hz, 1f);
        float bottomPort = Port(p, -Params.PortOffsetMm, hz, -1f);
        return MathF.Min(body, MathF.Min(topPort, bottomPort));
    }

    private static float Box(float x, float y, float z, float hx, float hy, float hz) =>
        MathF.Max(MathF.Abs(x) - hx, MathF.Max(MathF.Abs(y) - hy, MathF.Abs(z) - hz));

    private static float Port(in Vector3 p, float xOffset, float hz, float sign)
    {
        float radial = MathF.Sqrt((p.X - xOffset) * (p.X - xOffset) + p.Y * p.Y);
        float mouth = sign * (hz + Params.StubMm * 0.5f);
        float tube = MathF.Max(
            radial - Params.BossRadiusMm,
            MathF.Abs(p.Z - mouth) - Params.StubMm * 0.5f - Params.CapMm * 0.45f);
        float hole = MathF.Max(
            radial - Params.PortRadiusMm,
            MathF.Abs(p.Z - sign * hz) - (Params.CapMm + Params.StubMm));
        return MathF.Max(tube, -hole);
    }
}

public static class Params
{
    [Range(0.2, 2.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.8f;

    [Range(16, 80)]
    [Display(Name = "Length", Order = 1)]
    public static float LengthMm { get; set; } = 36f;

    [Range(12, 60)]
    [Display(Name = "Width", Order = 2)]
    public static float WidthMm { get; set; } = 24f;

    [Range(16, 80)]
    [Display(Name = "Height", Order = 3)]
    public static float HeightMm { get; set; } = 28f;

    [Range(4, 20)]
    [Display(Name = "Cell", Description = "Gyroid period in millimetres", Order = 4)]
    public static float CellMm { get; set; } = 8f;

    [Range(0.3, 2)]
    [Display(Name = "Wall", Order = 5)]
    public static float WallMm { get; set; } = 0.7f;

    [Range(1.5, 8)]
    [Display(Name = "Cap", Order = 6)]
    public static float CapMm { get; set; } = 3f;

    [Range(1, 6)]
    [Display(Name = "Port radius", Order = 7)]
    public static float PortRadiusMm { get; set; } = 2.6f;

    [Range(2, 8)]
    [Display(Name = "Boss radius", Order = 8)]
    public static float BossRadiusMm { get; set; } = 4.2f;

    [Range(2, 12)]
    [Display(Name = "Port offset", Order = 9)]
    public static float PortOffsetMm { get; set; } = 7f;

    [Range(1, 8)]
    [Display(Name = "Stub", Order = 10)]
    public static float StubMm { get; set; } = 4f;
}
