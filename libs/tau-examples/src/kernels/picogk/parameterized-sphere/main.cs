using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

Library.Go(Params.VoxelSizeMm, () =>
{
    var sphere = Voxels.voxSphere(Vector3.Zero, Params.RadiusMm);
    Library.oViewer().SetGroupMaterial(0, Params.Color, 0.2f, 0.7f);
    Library.oViewer().Add(sphere);
});

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 1.0f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Description = "Sphere radius in millimetres", Order = 1)]
    public static float RadiusMm { get; set; } = 20.0f;

    [Display(Name = "Color", Description = "Six-digit RGB color", Order = 2)]
    public static string Color { get; set; } = "4f7dd9";
}
