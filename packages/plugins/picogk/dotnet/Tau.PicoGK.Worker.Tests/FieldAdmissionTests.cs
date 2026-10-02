using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(.4f)]
    [InlineData(1f)]
    public void FieldWorldCallsRejectInvalidPositionsWithoutChangingStoredValues(float size)
    {
        using var library = new Library(size);
        using var scalar = new ScalarField(library);
        using var vector = new VectorField(library);
        scalar.SetValue(Vector3.Zero, 7);
        vector.SetValue(Vector3.Zero, new Vector3(2, 3, 4));
        static void Invalid(Action action)
        {
            var error = Assert.Throws<ArgumentException>(action);
            Assert.Equal("PicoGK callback operation received invalid bounds or input.", error.Message);
        }
        foreach (var value in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, float.MaxValue })
        {
            foreach (var point in new[] { new Vector3(value, 0, 0), new Vector3(0, value, 0), new Vector3(0, 0, value) })
            {
                Invalid(() => scalar.SetValue(point, 99));
                Invalid(() => scalar.bGetValue(point, out _));
                Invalid(() => scalar.RemoveValue(point));
                Invalid(() => vector.SetValue(point, new Vector3(99)));
                Invalid(() => vector.bGetValue(point, out _));
                Invalid(() => vector.RemoveValue(point));
            }
        }
        Assert.True(scalar.bGetValue(Vector3.Zero, out var scalarValue));
        Assert.Equal(7, scalarValue);
        Assert.True(vector.bGetValue(Vector3.Zero, out var vectorValue));
        Assert.Equal(new Vector3(2, 3, 4), vectorValue);
        scalar.RemoveValue(Vector3.Zero);
        vector.RemoveValue(Vector3.Zero);
        Assert.False(scalar.bGetValue(Vector3.Zero, out _));
        Assert.False(vector.bGetValue(Vector3.Zero, out _));
    }

    [Fact]
    public void FieldWorldCallsKeepSignedRoundingAndNonfiniteValuePayloads()
    {
        using var library = new Library(1);
        using var scalar = new ScalarField(library);
        using var vector = new VectorField(library);
        foreach (var sign in new[] { -1f, 1f })
        {
            var half = new Vector3(.5f * sign, 0, 0);
            var rounded = new Vector3(sign, 0, 0);
            scalar.SetValue(half, sign * 7);
            vector.SetValue(half, new Vector3(sign, 2, 3));
            Assert.True(scalar.bGetValue(rounded, out var scalarValue));
            Assert.Equal(sign * 7, scalarValue);
            Assert.True(vector.bGetValue(rounded, out var vectorValue));
            Assert.Equal(new Vector3(sign, 2, 3), vectorValue);
            scalar.RemoveValue(rounded);
            vector.RemoveValue(rounded);
            Assert.False(scalar.bGetValue(half, out _));
            Assert.False(vector.bGetValue(half, out _));
        }
        scalar.SetValue(Vector3.Zero, float.NaN);
        vector.SetValue(Vector3.Zero, new Vector3(float.NaN, float.PositiveInfinity, float.NegativeInfinity));
        Assert.True(scalar.bGetValue(Vector3.Zero, out var nan));
        Assert.True(float.IsNaN(nan));
        Assert.True(vector.bGetValue(Vector3.Zero, out var nonfinite));
        Assert.True(float.IsNaN(nonfinite.X));
        Assert.Equal(float.PositiveInfinity, nonfinite.Y);
        Assert.Equal(float.NegativeInfinity, nonfinite.Z);
    }

    [Fact]
    public void FieldWorldCallsFailPredictablyAfterFieldOrLibraryDisposal()
    {
        static void Check(ScalarField scalar, VectorField vector)
        {
            Action[] calls = [
                () => scalar.SetValue(Vector3.Zero, 1),
                () => scalar.bGetValue(Vector3.Zero, out _),
                () => scalar.RemoveValue(Vector3.Zero),
                () => vector.SetValue(Vector3.Zero, Vector3.One),
                () => vector.bGetValue(Vector3.Zero, out _),
                () => vector.RemoveValue(Vector3.Zero)
            ];
            foreach (var call in calls)
            {
                var error = Assert.Throws<ObjectDisposedException>(call);
                Assert.Contains("disposed", error.Message, StringComparison.OrdinalIgnoreCase);
            }
        }
        using var library = new Library(1);
        using var scalar = new ScalarField(library);
        using var vector = new VectorField(library);
        scalar.Dispose();
        vector.Dispose();
        Check(scalar, vector);
        using var scalarWithDisposedLibrary = new ScalarField(library);
        using var vectorWithDisposedLibrary = new VectorField(library);
        library.Dispose();
        Check(scalarWithDisposedLibrary, vectorWithDisposedLibrary);
    }
}
