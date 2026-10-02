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
    public void VoxelSlicesResizeAndPreserveEveryAxisOrientation(float size)
    {
        using var library = new Library(size);
        using var voxels = Voxels.voxSphere(library, new Vector3(-1, 2, 0), 3);
        using var field = new ScalarField(voxels);
        voxels.GetVoxelDimensions(out int xo, out int yo, out int zo, out int xs, out int ys, out int zs);
        foreach (var axis in Enum.GetValues<Voxels.ESliceAxis>())
        {
            var image = new ImageGrayScale(1, 1);
            voxels.GetVoxelSlice(1, ref image, eAxis: axis);
            Assert.Equal(axis == Voxels.ESliceAxis.X ? ys : xs, image.nWidth);
            Assert.Equal(axis == Voxels.ESliceAxis.Z ? ys : zs, image.nHeight);
            for (var y = 0; y < image.nHeight; y++)
            for (var x = 0; x < image.nWidth; x++)
            {
                var position = axis switch
                {
                    Voxels.ESliceAxis.X => new Vector3(xo + 1, yo + x, zo + zs - 1 - y),
                    Voxels.ESliceAxis.Y => new Vector3(xo + x, yo + 1, zo + zs - 1 - y),
                    _ => new Vector3(xo + x, yo + ys - 1 - y, zo + 1),
                };
                field.bGetValue(position * size, out var expected);
                Assert.Equal(BitConverter.SingleToInt32Bits(expected), BitConverter.SingleToInt32Bits(image.fValue(x, y)));
            }
            var original = image;
            var values = (float[])image.m_afValues.Clone();
            voxels.GetVoxelSlice(1, ref image, eAxis: axis);
            Assert.Same(original, image);
            Assert.Equal(values, image.m_afValues);
        }
    }

    [Fact]
    public void ScalarSlicesGrowAndShrinkWithCoherentDimensionsAndRetainedCapacity()
    {
        using var library = new Library(1);
        using var field = new ScalarField(library);
        field.SetValue(Vector3.Zero, 1);
        var image = new ImageGrayScale(1, 1);
        field.GetVoxelSlice(0, ref image);
        Assert.Equal(1f, image.fValue(0, 0));
        field.SetValue(new Vector3(2, 1, 0), 5);
        field.GetVoxelSlice(0, ref image);
        Assert.Equal((3, 2), (image.nWidth, image.nHeight));
        Assert.Equal(5f, image.fValue(2, 1));
        var capacity = image.m_afValues;
        field.RemoveValue(new Vector3(2, 1, 0));
        field.GetVoxelSlice(0, ref image);
        Assert.Equal((1, 1), (image.nWidth, image.nHeight));
        Assert.Same(capacity, image.m_afValues);
        Assert.Equal(1f, image.fValue(0, 0));
        field.RemoveValue(Vector3.Zero);
        image.m_afValues[0] = 123;
        field.GetVoxelSlice(0, ref image);
        Assert.Equal((0, 0), (image.nWidth, image.nHeight));
        Assert.Equal(123f, image.m_afValues[0]);
        field.Dispose();
        Assert.Throws<ObjectDisposedException>(() => field.GetVoxelSlice(0, ref image));
    }

    [Fact]
    public void EmptyVoxelSlicesUseInternalEmptyImagesWithoutChangingAuthoredConstructorValidation()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new ImageGrayScale(0, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => new ImageGrayScale(-1, 1));
        using var library = new Library(1);
        using var voxels = new Voxels(library);
        var image = voxels.imgAllocateSlice(out var count);
        Assert.Equal(0, count);
        Assert.Equal((0, 0), (image.nWidth, image.nHeight));
        Assert.Empty(image.m_afValues);
        var original = image;
        voxels.GetVoxelSlice(0, ref image);
        Assert.Same(original, image);
    }

    [Fact]
    public void SliceCapacityAndPlaneErrorsLeaveCallerImageUnchanged()
    {
        using var library = new Library(1);
        using var field = new ScalarField(library);
        field.SetValue(Vector3.Zero, 1);
        field.SetValue(new Vector3(49999, 49999, 0), 2);
        var image = new ImageGrayScale(1, 1);
        image.m_afValues[0] = 91;
        var original = image;
        Assert.Throws<ArgumentException>(() => field.GetVoxelSlice(0, ref image));
        Assert.Same(original, image);
        Assert.Equal(91f, image.m_afValues[0]);
        using var voxels = Voxels.voxSphere(library, Vector3.Zero, 2);
        foreach (var invalid in new[] { float.NaN, float.PositiveInfinity, float.NegativeInfinity, float.MaxValue })
        {
            Assert.Throws<ArgumentException>(() => voxels.GetInterpolatedVoxelSlice(invalid, ref image));
            Assert.Same(original, image);
            Assert.Equal(91f, image.m_afValues[0]);
        }
    }
}
