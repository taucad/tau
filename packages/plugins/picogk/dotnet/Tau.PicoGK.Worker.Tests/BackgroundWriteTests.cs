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
    public void OutsideImplicitRetainsCallbacksAndAvoidsAllocatingBackgroundGeometry(float size)
    {
        using var library = new Library(size);
        using var empty = new Voxels(library);
        var bytes = empty.nMemUsage();
        var outside = new BackgroundOutside();
        for (var index = 0; index < 100; index++)
        {
            var point = new Vector3(index * 16 * size, 0, 0);
            empty.RenderImplicit(outside, new BBox3(point, point));
            Assert.True(empty.bIsEmpty());
            Assert.Equal(bytes, empty.nMemUsage());
        }
        Assert.Equal(100 * 343, outside.Calls);
        Assert.Empty(ScalarRecords(empty));
        using var mesh = new Mesh(empty);
        Assert.Equal(0, mesh.nTriangleCount());

        using var solid = Voxels.voxSphere(library, Vector3.Zero, 2 * size);
        var original = ScalarRecords(solid);
        using var clone = new Voxels(solid);
        solid.RenderImplicit(outside, new BBox3(new Vector3(-2 * size), new Vector3(2 * size)));
        Assert.Equal(original, ScalarRecords(solid));
        Assert.Equal(original, ScalarRecords(clone));
        Assert.True(solid.bIsEqual(clone));
    }

    private sealed class BackgroundOutside : IImplicit
    {
        public int Calls { get; private set; }
        public float fSignedDistance(in Vector3 point)
        {
            Calls++;
            return 100_000f;
        }
    }
}
