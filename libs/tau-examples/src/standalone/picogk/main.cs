using System.ComponentModel.DataAnnotations;
using System.Numerics;
using PicoGK;

if (args is [var stlPath])
{
    // Outside Tau, headless: `dotnet run -- out.stl` builds the same voxels without PicoGK's viewer and writes them.
    using var library = new Library(Params.VoxelSizeMm);
    Library.RegisterGlobalLibrary(library);
    Model.Build().mshAsMesh().SaveToStlFile(stlPath);
    Library.UnregisterGlobalLibrary();
}
else
{
    // In Tau, and in `dotnet run` with no arguments: the viewer shows the model.
    Library.Go(Params.VoxelSizeMm, () => Library.oViewer().Add(Model.Build()));
}

static class Model
{
    public static Voxels Build()
    {
        var sphere = Voxels.voxSphere(Vector3.Zero, Params.RadiusMm);
        sphere.BoolSubtract(Voxels.voxSphere(Vector3.Zero, Params.HoleRadiusMm));
        return sphere;
    }
}

public static class Params
{
    [Range(0.05, 5.0)]
    [Display(Name = "Voxel size", Description = "OpenVDB voxel size in millimetres", Order = 0)]
    public static float VoxelSizeMm { get; set; } = 0.5f;

    [Range(1.0, 100.0)]
    [Display(Name = "Radius", Description = "Sphere radius in millimetres", Order = 1)]
    public static float RadiusMm { get; set; } = 10.0f;

    [Range(0.5, 50.0)]
    [Display(Name = "Hole radius", Description = "Inner void radius in millimetres", Order = 2)]
    public static float HoleRadiusMm { get; set; } = 4.0f;
}
