using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(.25f)]
    [InlineData(.4f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void MeshConversionPreservesIndexedGeometryAndIndependentOwnership(float size)
    {
        using var library = new Library(size);
        using var sphere = Voxels.voxSphere(library, Vector3.Zero, 2 * size);
        using var mesh = new Mesh(sphere);
        var original = mesh.TauCopyGeometry();
        using var created = new Voxels(msh: mesh);
        using var rendered = new Voxels(library);
        rendered.RenderMesh(msh: mesh);
        Assert.Equal(ScalarRecords(created), ScalarRecords(rendered));
        using var shell = Voxels.voxMeshShell(libSet: library, msh: mesh, fRadius: size);
        Assert.False(shell.bIsEmpty());
        Assert.True(shell.oMetaData().bGetValueAt("PicoGK.Class", out string tag));
        Assert.Equal("Voxels", tag);
        Assert.Equal(original.Positions, mesh.TauCopyGeometry().Positions);
        Assert.Equal(original.Indices, mesh.TauCopyGeometry().Indices);
        var records = ScalarRecords(created);
        mesh.nAddVertex(new Vector3(8, 9, 10));
        mesh.Dispose();
        Assert.Equal(records, ScalarRecords(created));
        Assert.Throws<ObjectDisposedException>(() => rendered.RenderMesh(mesh));
        Assert.Throws<ObjectDisposedException>(() => new Voxels(mesh));
    }

    [Fact]
    public void FailedMeshConversionRejectsBeforeMutationAndReleasesOwnership()
    {
        using var library = new Library(1f);
        using var target = Voxels.voxSphere(library, Vector3.Zero, 2f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(new Vector3(float.NaN, 0, 0));
        var records = ScalarRecords(target);
        var bytes = library.nTotalMemUsage();
        Assert.Throws<ArgumentException>(() => new Voxels(mesh));
        Assert.Throws<ArgumentException>(() => target.RenderMesh(mesh));
        Assert.Equal(records, ScalarRecords(target));
        Assert.Equal(bytes, library.nTotalMemUsage());
        Assert.Throws<ArgumentNullException>(() => target.RenderMesh(null!));
        using var other = new Library(1f);
        using var foreign = new Mesh(other);
        Assert.Throws<PicoGKLibraryMismatchException>(() => target.RenderMesh(foreign));
        using var valid = new Mesh(target);
        foreach (var radius in new[] { -1f, float.NaN, float.PositiveInfinity })
            Assert.Throws<ArgumentException>(() => Voxels.voxMeshShell(library, valid, radius));
    }

    [Fact]
    public void ShellRejectsOverflowingWorldArithmeticEvenWithSmallIndexCoordinates()
    {
        using var library = new Library(1e20f);
        using var mesh = new Mesh(library);
        mesh.nAddVertex(Vector3.Zero);
        mesh.nAddVertex(new Vector3(1e20f, 0, 0));
        mesh.nAddVertex(new Vector3(0, 1e20f, 0));
        mesh.nAddTriangle(0, 1, 2);
        var bytes = library.nTotalMemUsage();
        Assert.Throws<ArgumentException>(() => Voxels.voxMeshShell(library, mesh, .25f));
        Assert.Equal(bytes, library.nTotalMemUsage());
        Assert.Equal(3, mesh.nVertexCount());
        Assert.Equal(1, mesh.nTriangleCount());
    }
}
