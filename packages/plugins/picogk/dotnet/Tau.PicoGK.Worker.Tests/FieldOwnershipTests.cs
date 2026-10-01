using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void FieldDisposalReleasesMetadataAndGridWithoutWaitingForGarbageCollection()
    {
        using var library = new Library(.25f);
        using var voxels = Voxels.voxSphere(library, Vector3.Zero, 2);
        // Retained handle-table capacity is not a live field owner.
        using (var scalarPrime = new ScalarField(voxels))
        using (var vectorPrime = new VectorField(library)) { }
        var baseline = library.nTotalMemUsage();
        for (var iteration = 0; iteration < 3; iteration++)
        {
            using var scalar = new ScalarField(voxels);
            using var vector = new VectorField(library);
            vector.SetValue(Vector3.Zero, Vector3.One);
            var scalarMetadata = scalar.oMetaData();
            var vectorMetadata = vector.oMetaData();
            Assert.True(library.nTotalMemUsage() > baseline);
            scalar.Dispose();
            vector.Dispose();
            Assert.Equal(baseline, library.nTotalMemUsage());
            scalar.Dispose();
            vector.Dispose();
            Assert.Equal(baseline, library.nTotalMemUsage());
            GC.KeepAlive(scalarMetadata);
            GC.KeepAlive(vectorMetadata);
        }
    }

}
