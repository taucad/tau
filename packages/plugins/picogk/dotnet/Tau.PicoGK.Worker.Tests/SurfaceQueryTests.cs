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
    public void SurfaceQueriesKeepFractionalRayHitsAndCloneRevisionOwnership(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 5.35f);
        using var clone = new Voxels(source);
        var start = new Vector3(-12, 0, 0);
        Assert.True(source.bRayCastToSurface(start, Vector3.UnitX, out var expected));
        Assert.InRange(MathF.Abs(expected.X + 5.35f), 0, .01f);
        Assert.True(MathF.Abs(expected.X / size - MathF.Round(expected.X / size)) > .1f);
        Assert.True(source.bClosestPointOnSurface(start, out var closest));
        for (var i = 0; i < 100; ++i)
        {
            Assert.True(source.bRayCastToSurface(start, Vector3.UnitX, out var hit));
            Assert.Equal(expected, hit);
            Assert.Equal(closest, source.vecClosestPointOnSurface(start));
            Assert.True(source.bIsInside(Vector3.Zero));
            Assert.True(Vector3.Dot(source.vecSurfaceNormal(hit), -Vector3.UnitX) > .9f);
        }
        Assert.False(source.bRayCastToSurface(start, -Vector3.UnitX, out _));
        source.Offset(size);
        Assert.True(source.bRayCastToSurface(start, Vector3.UnitX, out var changed));
        Assert.NotEqual(expected, changed);
        Assert.Equal(expected, clone.vecRayCastToSurface(start, Vector3.UnitX));
        source.Dispose();
        Assert.Equal(expected, clone.vecRayCastToSurface(start, Vector3.UnitX));
        static void Disposed(Action operation)
        {
            var error = Assert.Throws<ObjectDisposedException>(operation);
            Assert.Contains("disposed", error.Message, StringComparison.OrdinalIgnoreCase);
        }
        Disposed(() => source.bIsInside(Vector3.Zero));
        Disposed(() => source.vecSurfaceNormal(Vector3.Zero));
        Disposed(() => source.bClosestPointOnSurface(start, out _));
        Disposed(() => source.bRayCastToSurface(start, Vector3.UnitX, out _));
    }

    [Fact]
    public void SurfaceQueriesRejectInvalidInputsThroughExistingManagedStatusErrors()
    {
        using var library = new Library(.4f);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 5.35f);
        static void Invalid(Action operation)
        {
            var error = Assert.Throws<ArgumentException>(operation);
            Assert.Equal("PicoGK callback operation received invalid bounds or input.", error.Message);
        }
        foreach (var value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, float.MaxValue })
        {
            var point = new Vector3(value, 0, 0);
            Invalid(() => source.bIsInside(point));
            Invalid(() => source.vecSurfaceNormal(point));
            Invalid(() => source.bClosestPointOnSurface(point, out _));
            Invalid(() => source.bRayCastToSurface(point, Vector3.UnitX, out _));
        }
        Invalid(() => source.bRayCastToSurface(Vector3.Zero, Vector3.Zero, out _));
        Assert.True(source.bRayCastToSurface(new Vector3(-12, 0, 0), Vector3.UnitX, out _));
        using var empty = new Voxels(library);
        Assert.False(empty.bClosestPointOnSurface(Vector3.Zero, out _));
        var error = Assert.Throws<InvalidOperationException>(() => empty.bRayCastToSurface(Vector3.Zero, Vector3.UnitX, out _));
        Assert.Equal("PicoGK callback operation failed with native status -2.", error.Message);
    }
}
