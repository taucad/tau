using System.Numerics;
using PicoGK;

// Keep both spherical zero-surfaces off the voxel lattice: exact lattice
// intersections in PicoGK's OpenVDB mesher collapse faces on the inner shell.
Library.Go(0.7f, () =>
{
    using var outer = Voxels.voxSphere(Vector3.Zero, 24.0f);
    using var inner = Voxels.voxSphere(Vector3.Zero, 20.0f);
    var shell = outer - inner;
    Library.oViewer().SetGroupMaterial(0, "ef9f27", 0.15f, 0.65f);
    Library.oViewer().Add(shell);
});
