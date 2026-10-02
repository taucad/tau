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
    public void ScalarSignedDistanceReturnsStoredMillimeters(float size)
    {
        using var library = new Library(size);
        using var sphere = Voxels.voxSphere(library, Vector3.Zero, 4);
        using var field = new ScalarField(sphere);
        var position = new Vector3(4 - size, 0, 0);
        Assert.True(field.bGetValue(position, out var stored));
        Assert.Equal(-size, stored);
        Assert.Equal(BitConverter.SingleToInt32Bits(stored), BitConverter.SingleToInt32Bits(field.fSignedDistance(position)));
        var records = ScalarRecords(sphere);
        Assert.Equal(records.Count, ActiveVoxelCounterScalar.nCount(field));
        field.Dispose();
        Assert.Throws<ObjectDisposedException>(() => ActiveVoxelCounterScalar.nCount(field));
    }

    [Theory]
    [InlineData(.25f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void BulkSurfaceNormalsPreserveOrderedFilterScaleAndIndependentOwnership(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 4);
        var scalars = ScalarRecords(source);
        foreach (var (threshold, direction, tolerance, scale) in new[]
        {
            (.5f, Vector3.Zero, 0f, Vector3.One),
            (3f, new Vector3(1, 2, 3), .25f, new Vector3(2, -.5f, 3)),
            (3f, Vector3.UnitX, 1f, new Vector3(-0f, 0, -2)),
            (float.NaN, new Vector3(float.NaN, 0, 0), 0f, Vector3.One),
        })
        {
            using var expected = new VectorField(library);
            var filter = direction == Vector3.Zero ? direction : Vector3.Normalize(direction);
            foreach (var (position, distanceBits) in scalars)
            {
                if (float.Abs(BitConverter.Int32BitsToSingle(distanceBits)) > threshold) continue;
                var normal = source.vecSurfaceNormal(position);
                if (filter != Vector3.Zero && float.Abs(1 - Vector3.Dot(normal, filter)) > tolerance) continue;
                expected.SetValue(position, normal * scale);
            }
            using var actual = SurfaceNormalFieldExtractor.oExtract(source, threshold, direction, tolerance, scale);
            Assert.Equal(FieldVectorRecords(expected), FieldVectorRecords(actual));
            Assert.Equal(expected.oMetaData().ToString(), actual.oMetaData().ToString());
        }
        using var retained = SurfaceNormalFieldExtractor.oExtract(source, 3);
        var original = FieldVectorRecords(retained);
        source.Offset(size);
        source.Dispose();
        Assert.Equal(original, FieldVectorRecords(retained));
    }

    private static List<(Vector3, int, int, int)> FieldVectorRecords(VectorField field)
    {
        var records = new FieldVectorRecorder();
        field.TraverseActive(records);
        return records.Values;
    }

    private sealed class FieldVectorRecorder : ITraverseVectorField
    {
        public List<(Vector3, int, int, int)> Values { get; } = [];
        public void InformActiveValue(in Vector3 position, in Vector3 value) => Values.Add((position,
            BitConverter.SingleToInt32Bits(value.X), BitConverter.SingleToInt32Bits(value.Y), BitConverter.SingleToInt32Bits(value.Z)));
    }
}
