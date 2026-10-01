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
    public void ScalarBuilderRetainsResidualDistancesInactiveSignsAndIndependentOwnership(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var original = new ScalarField(source);
        var sourceRecords = ScalarRecords(source);
        original.GetVoxelDimensions(out var ox, out var oy, out var oz, out var sx, out var sy, out var sz);
        foreach (var threshold in new[] { float.NegativeInfinity, 0f, .5f, float.PositiveInfinity, float.NaN })
        {
            using var field = new ScalarField(source, fValue: 7, fSdThreshold: threshold);
            Assert.Equal(sourceRecords, ScalarRecords(source));
            for (var x = ox - 1; x <= ox + sx; x++)
            for (var y = oy - 1; y <= oy + sy; y++)
            for (var z = oz - 1; z <= oz + sz; z++)
            {
                var position = new Vector3(x * size, y * size, z * size);
                var beforeOn = original.bGetValue(position, out var before);
                var insideBounds = x >= ox && x < ox + sx && y >= oy && y < oy + sy && z >= oz && z < oz + sz;
                var selected = insideBounds && before < threshold;
                var afterOn = field.bGetValue(position, out var after);
                Assert.Equal(selected || beforeOn, afterOn);
                Assert.Equal(BitConverter.SingleToInt32Bits(selected ? 7 : before), BitConverter.SingleToInt32Bits(after));
            }
        }
        using var retained = new ScalarField(source, 7, float.NegativeInfinity);
        var expected = new ImportScalarRecords();
        retained.TraverseActive(expected);
        source.Offset(size);
        source.Dispose();
        var actual = new ImportScalarRecords();
        retained.TraverseActive(actual);
        Assert.Equal(expected.Values, actual.Values);
    }
}
