using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Theory]
    [InlineData(.25f, 0, 2)]
    [InlineData(.25f, 2, 0)]
    [InlineData(.25f, 0, 0)]
    [InlineData(.4f, 0, 2)]
    [InlineData(.4f, 2, 0)]
    [InlineData(.4f, 0, 0)]
    [InlineData(1f, 0, 2)]
    [InlineData(1f, 2, 0)]
    [InlineData(1f, 0, 0)]
    [InlineData(2f, 0, 2)]
    [InlineData(2f, 2, 0)]
    [InlineData(2f, 0, 0)]
    public void ProjectionUsesVoxelLayersAndRetainsSequentialFloatArithmetic(float size, int start, int end)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 2 * size);
        using var original = new ScalarField(source);
        var values = new Dictionary<int, float>();
        for (var z = -8; z <= 8; z++)
        {
            original.bGetValue(new Vector3(0, 0, z * size), out var value);
            values[z] = value;
        }
        var background = 3 * size;
        var layers = (int)(.5f + background / size);
        var direction = start > end ? -1 : 1;
        var far = end + direction * layers;
        for (var z = start; z != end; z += direction)
        {
            var current = values[z];
            var next = values[z + direction];
            // std::min(next,current) retains its first operand on equal values.
            values[z + direction] = Math.Clamp(current < next ? current : next, -background, background);
        }
        for (var z = end; z != far; z += direction)
            values[z] = Math.Clamp((values[z] + values[z + direction]) / 2f, -background, background);

        using var result = source.voxProjectZSlice(fStartZMM: start * size, fEndZMM: end * size);
        using var projected = new ScalarField(result);
        using var unchanged = new ScalarField(source);
        foreach (var (z, expected) in values)
        {
            var position = new Vector3(0, 0, z * size);
            projected.bGetValue(position, out var actual);
            Assert.Equal(BitConverter.SingleToInt32Bits(expected), BitConverter.SingleToInt32Bits(actual));
            var beforeOn = original.bGetValue(position, out var before);
            var afterOn = unchanged.bGetValue(position, out var after);
            Assert.Equal(beforeOn, afterOn);
            Assert.Equal(BitConverter.SingleToInt32Bits(before), BitConverter.SingleToInt32Bits(after));
        }
        source.ProjectZSlice(start * size, end * size);
        Assert.True(source.bIsEqual(result));
    }

    [Fact]
    public void InvalidProjectionLeavesSourceAndFunctionalResultOwnershipUnchanged()
    {
        using var library = new Library(.4f);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 2);
        using var unchanged = new Voxels(source);
        // Prime the existing result-handle table capacity before comparing live ownership.
        using (var prime = source.voxProjectZSlice(0, 1)) { }
        var owned = library.nTotalMemUsage();
        foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, float.MaxValue })
        {
            Assert.Throws<ArgumentException>(() => source.ProjectZSlice(invalid, 1));
            Assert.Throws<ArgumentException>(() => source.voxProjectZSlice(0, invalid));
            Assert.True(source.bIsEqual(unchanged));
            Assert.Equal(owned, library.nTotalMemUsage());
        }
        source.Dispose();
        Assert.Throws<ObjectDisposedException>(() => source.ProjectZSlice(0, 1));
    }

    [Fact]
    public void EmptyProjectionAcceptsFiniteEqualPlanesAndRejectsNonfiniteInput()
    {
        using var library = new Library(1);
        using var empty = new Voxels(library);
        empty.ProjectZSlice(0, 0);
        Assert.True(empty.bIsEmpty());
        Assert.Throws<ArgumentException>(() => empty.ProjectZSlice(0, float.NaN));
        Assert.True(empty.bIsEmpty());
    }
}
