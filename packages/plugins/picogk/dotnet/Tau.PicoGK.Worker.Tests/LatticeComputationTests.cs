using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(.25f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void ContainedRoundBeamsRenderTheLargerEndpointSphere(float size)
    {
        using var library = new Library(size);
        foreach (var (end, startRadius, endRadius) in new[]
        {
            (Vector3.UnitX, 3f, 1f), (Vector3.UnitX, 1f, 3f),
            (2 * Vector3.UnitX, 3f, 1f), (2 * Vector3.UnitX, 1f, 3f),
            (Vector3.Zero, 2f, 1f), (Vector3.Zero, 0f, 0f),
        })
        {
            using var beam = new Lattice(library);
            using var sphere = new Lattice(library);
            beam.AddBeam(Vector3.Zero, startRadius, end, endRadius);
            sphere.AddSphere(startRadius >= endRadius ? Vector3.Zero : end, Math.Max(startRadius, endRadius));
            using var expected = new Voxels(sphere);
            using var actual = new Voxels(beam);
            Assert.Equal(ScalarRecords(expected), ScalarRecords(actual));
            Assert.Equal(expected.nMemUsage(), actual.nMemUsage());
            using var a = new ScalarField(actual);
            using var b = new ScalarField(expected);
            for (var x = -8; x <= 8; x++)
            for (var y = -8; y <= 8; y++)
            for (var z = -8; z <= 8; z++)
            {
                var point = new Vector3(x, y, z) * size;
                Assert.Equal(b.bGetValue(point, out var expectedValue), a.bGetValue(point, out var actualValue));
                Assert.Equal(BitConverter.SingleToInt32Bits(expectedValue), BitConverter.SingleToInt32Bits(actualValue));
            }
        }
    }

    [Fact]
    public void InvalidLatticePrimitivesLeaveExistingGeometryAndOwnershipUnchanged()
    {
        using var library = new Library(1);
        using var lattice = new Lattice(library);
        lattice.AddSphere(Vector3.Zero, 2);
        lattice.AddBeam(Vector3.Zero, Vector3.UnitZ * 5, 1, 2, false);
        using var expected = new Voxels(lattice);
        var original = ScalarRecords(expected);
        var bytes = library.nTotalMemUsage();
        foreach (var bad in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, -1f })
        {
            var sphereError = Assert.Throws<ArgumentException>(() => lattice.AddSphere(Vector3.Zero, bad));
            Assert.Equal("Invalid lattice geometry or voxel coordinate bounds.", sphereError.Message);
            Assert.Throws<ArgumentException>(() => lattice.AddBeam(Vector3.Zero, Vector3.UnitZ, bad, 1));
            Assert.Throws<ArgumentException>(() => lattice.AddBeam(Vector3.Zero, 1, Vector3.UnitZ, bad));
        }
        foreach (var bad in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity })
        {
            Assert.Throws<ArgumentException>(() => lattice.AddSphere(new Vector3(bad, 0, 0), 1));
            Assert.Throws<ArgumentException>(() => lattice.AddBeam(Vector3.Zero, new Vector3(0, bad, 0), 1, 1));
        }
        Assert.Throws<ArgumentException>(() => lattice.AddSphere(new Vector3(float.MaxValue), float.MaxValue));
        Assert.Throws<ArgumentException>(() => lattice.AddBeam(Vector3.Zero, new Vector3(float.MaxValue), 1, 1));
        Assert.Throws<ArgumentException>(() => lattice.AddBeam(Vector3.Zero, Vector3.Zero, 1, 2, false));
        Assert.Equal(bytes, library.nTotalMemUsage());
        using var actual = new Voxels(lattice);
        Assert.Equal(original, ScalarRecords(actual));
    }

    [Fact]
    public void LatticeRenderRejectsInvalidBoundsBeforeMutationAndCleansUpFailedConstruction()
    {
        using var library = new Library(.25f);
        using var oversized = new Lattice(library);
        oversized.AddSphere(new Vector3(1e10f, 0, 0), 1);
        using var existing = Voxels.voxSphere(library, Vector3.Zero, 2);
        var original = ScalarRecords(existing);
        using (var prime = new Voxels(library)) { }
        var bytes = library.nTotalMemUsage();
        var error = Assert.Throws<ArgumentException>(() => existing.RenderLattice(oversized));
        Assert.Equal("Invalid lattice geometry or voxel coordinate bounds.", error.Message);
        Assert.Equal(bytes, library.nTotalMemUsage());
        Assert.Equal(original, ScalarRecords(existing));
        Assert.Throws<ArgumentException>(() => new Voxels(oversized));
        Assert.Equal(bytes, library.nTotalMemUsage());
        using var empty = new Lattice(library);
        existing.RenderLattice(empty);
        Assert.Equal(original, ScalarRecords(existing));
        using var disposed = new Lattice(library);
        disposed.Dispose();
        Assert.Throws<ObjectDisposedException>(() => disposed.AddSphere(Vector3.Zero, 1));
        Assert.Throws<ObjectDisposedException>(() => disposed.AddBeam(Vector3.Zero, Vector3.UnitZ, 1, 1));
        Assert.Throws<ObjectDisposedException>(() => existing.RenderLattice(disposed));
        Assert.Throws<ObjectDisposedException>(() => new Voxels(disposed));
        Assert.Throws<ArgumentNullException>(() => existing.RenderLattice(null!));
        Assert.Throws<ArgumentNullException>(() => new Voxels((Lattice)null!));
        GC.Collect();
        GC.WaitForPendingFinalizers();
        using var foreignLibrary = new Library(.25f);
        using var foreign = new Lattice(foreignLibrary);
        Assert.Throws<PicoGKLibraryMismatchException>(() => existing.RenderLattice(foreign));
        existing.Dispose();
        Assert.Throws<ObjectDisposedException>(() => existing.RenderLattice(empty));
    }
}
