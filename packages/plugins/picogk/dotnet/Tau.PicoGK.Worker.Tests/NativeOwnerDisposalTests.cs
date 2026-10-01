using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void NativeOwnersCanDisposeConcurrentlyWithTheirLibrary()
    {
        for (var iteration = 0; iteration < 64; iteration++)
        {
            using var library = new Library(1);
            IDisposable[] owners =
            [
                new Mesh(library), new Lattice(library), new Voxels(library),
                new PolyLine(library, new ColorFloat(1)), new OpenVdbFile(library),
                new ScalarField(library), new VectorField(library),
            ];
            try
            {
                using var barrier = new Barrier(2);
                Parallel.Invoke(
                    () => { Assert.True(barrier.SignalAndWait(TimeSpan.FromSeconds(5))); library.Dispose(); },
                    () => { Assert.True(barrier.SignalAndWait(TimeSpan.FromSeconds(5))); foreach (var owner in owners) owner.Dispose(); });
                var error = Assert.Throws<ObjectDisposedException>(() => library.nTotalMemUsage());
                Assert.Equal(nameof(Library), error.ObjectName);
            }
            finally
            {
                foreach (var owner in owners) owner.Dispose();
            }
        }
    }
}
