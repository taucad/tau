using System.Numerics;
using System.Reflection;
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
    public void CorrectedPropertiesMatchMeshPipelineAndInvalidateAfterMutation(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, new Vector3(.17f, .13f, .27f), 4);
        AssertLegacyProperties(source, library);
        using var clone = new Voxels(source);
        clone.CalculateProperties(out var oldVolume, out var oldBounds);
        source.Offset(size);
        AssertLegacyProperties(source, library);
        source.Dispose();
        clone.CalculateProperties(fVolumeCubicMM: out var retainedVolume, oBBox: out var retainedBounds);
        Assert.Equal(BitConverter.SingleToInt32Bits(oldVolume), BitConverter.SingleToInt32Bits(retainedVolume));
        Assert.Equal(PropertyBoundsBits(oldBounds), PropertyBoundsBits(retainedBounds));
        using var empty = clone.voxBoolSubtract(clone);
        AssertLegacyProperties(empty, library);
        empty.CalculateProperties(out var emptyVolume, out _);
        Assert.Equal(0, BitConverter.SingleToInt32Bits(emptyVolume));
        using var freshEmpty = new Voxels(library);
        AssertLegacyProperties(freshEmpty, library);
    }

    [Theory]
    [InlineData(.25f)]
    [InlineData(.4f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void UnchangedCorrectedPropertiesAndBoundsAllocateNoManagedWrappers(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 4);
        source.CalculateProperties(out var expectedVolume, out var expectedBounds);
        for (var i = 0; i < 32; i++) { source.CalculateProperties(out _, out _); source.oCalculateBoundingBox(); }
        var nativeOwned = library.nTotalMemUsage();
        float volume = 0;
        BBox3 bounds = new();
        var bytes = GC.GetAllocatedBytesForCurrentThread();
        for (var i = 0; i < 100; i++)
        {
            source.CalculateProperties(out volume, out bounds);
            bounds = source.oCalculateBoundingBox();
        }
        var allocated = GC.GetAllocatedBytesForCurrentThread() - bytes;
        Assert.Equal(0, allocated);
        Assert.Equal(nativeOwned, library.nTotalMemUsage());
        Assert.Equal(BitConverter.SingleToInt32Bits(expectedVolume), BitConverter.SingleToInt32Bits(volume));
        Assert.Equal(PropertyBoundsBits(expectedBounds), PropertyBoundsBits(bounds));
        source.Dispose();
        Assert.Throws<ObjectDisposedException>(() => source.CalculateProperties(out _, out _));
        Assert.Throws<ObjectDisposedException>(() => source.oCalculateBoundingBox());
    }

    private static void AssertLegacyProperties(Voxels source, Library library)
    {
        using var mesh = new Mesh(source);
        using var corrected = new Voxels(mesh);
        // White-box oracle retains the original mesh -> fresh-grid -> raw-volume pipeline.
        var rawVolume = typeof(Voxels).GetMethod("_fCalculateVolume", BindingFlags.NonPublic | BindingFlags.Static)!;
        var libraryHandle = typeof(Library).GetField("hThis", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(library);
        var voxelsHandle = typeof(Voxels).GetField("hThis", BindingFlags.NonPublic | BindingFlags.Instance)!.GetValue(corrected);
        var expected = (float)rawVolume.Invoke(null, [libraryHandle, voxelsHandle])!;
        source.CalculateProperties(out var actual, out var bounds);
        Assert.Equal(BitConverter.SingleToInt32Bits(expected), BitConverter.SingleToInt32Bits(actual));
        Assert.Equal(PropertyBoundsBits(mesh.oBoundingBox()), PropertyBoundsBits(bounds));
        Assert.Equal(PropertyBoundsBits(bounds), PropertyBoundsBits(source.oCalculateBoundingBox()));
    }

    private static int[] PropertyBoundsBits(BBox3 bounds) =>
    [
        BitConverter.SingleToInt32Bits(bounds.vecMin.X), BitConverter.SingleToInt32Bits(bounds.vecMin.Y),
        BitConverter.SingleToInt32Bits(bounds.vecMin.Z), BitConverter.SingleToInt32Bits(bounds.vecMax.X),
        BitConverter.SingleToInt32Bits(bounds.vecMax.Y), BitConverter.SingleToInt32Bits(bounds.vecMax.Z),
    ];
}
