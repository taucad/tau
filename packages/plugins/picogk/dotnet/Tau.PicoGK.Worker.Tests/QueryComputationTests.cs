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
    public void VoxelQueriesRetainSignSemanticsAcrossClonesMutationAndDisposal(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var independent = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var clone = new Voxels(source);
        Assert.True(source.bIsEqual(source));
        Assert.True(source.bIsEqual(clone));
        Assert.True(source.bIsEqual(independent));
        Assert.False(source.bIsEmpty());
        source.Offset(size);
        Assert.False(source.bIsEqual(clone));
        Assert.True(clone.bIsEqual(independent));
        using var empty = clone.voxBoolSubtract(clone);
        using var freshEmpty = new Voxels(library);
        Assert.True(empty.bIsEmpty());
        Assert.True(freshEmpty.bIsEmpty());
        for (var i = 0; i < 100; i++)
        {
            Assert.True(clone.bIsEqual(independent));
            Assert.False(clone.bIsEmpty());
            Assert.True(empty.bIsEmpty());
        }
        source.Dispose();
        Assert.True(clone.bIsEqual(independent));
        Assert.Throws<ObjectDisposedException>(() => source.bIsEmpty());
        Assert.Throws<ObjectDisposedException>(() => source.bIsEqual(clone));
        Assert.Throws<ObjectDisposedException>(() => clone.bIsEqual(source));
        Assert.Throws<ArgumentNullException>(() => clone.bIsEqual(null!));
        using var otherLibrary = new Library(size);
        using var foreign = new Voxels(otherLibrary);
        Assert.Throws<PicoGKLibraryMismatchException>(() => clone.bIsEqual(foreign));
    }

    [Theory]
    [InlineData(.25f)]
    [InlineData(.4f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void IndependentSparseVoxelEqualityPreservesSeparatedInteriorAndSourceContent(float size)
    {
        using var library = new Library(size);
        using var left = Voxels.voxSphere(library, new Vector3(-2000, 0, 0), 4);
        using var right = Voxels.voxSphere(library, new Vector3(2000, 0, 0), 4);
        left.BoolAdd(right);
        using var independent = new Voxels(library);
        independent.BoolAdd(left);
        var before = ScalarRecords(left);
        Assert.True(left.bIsEqual(independent));
        Assert.True(independent.bIsEqual(left));
        Assert.Equal(before, ScalarRecords(left));
        independent.BoolSubtract(right);
        Assert.False(left.bIsEqual(independent));
        Assert.False(independent.bIsEqual(left));
        Assert.Equal(before, ScalarRecords(left));
    }

    [Theory]
    [InlineData(.25f)]
    [InlineData(.4f)]
    [InlineData(1f)]
    [InlineData(2f)]
    public void RepeatedVoxelQueriesRetainNoScratchGridsOrManagedWrappers(float size)
    {
        using var library = new Library(size);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var clone = new Voxels(source);
        using var independent = Voxels.voxSphere(library, Vector3.Zero, 3);
        using var empty = source.voxBoolSubtract(source);
        for (var i = 0; i < 32; i++) { source.bIsEqual(clone); source.bIsEmpty(); empty.bIsEmpty(); }
        var retained = library.nTotalMemUsage();
        var bytes = GC.GetAllocatedBytesForCurrentThread();
        var correct = true;
        for (var i = 0; i < 100; i++)
        {
            correct &= source.bIsEqual(clone) && !source.bIsEmpty() && empty.bIsEmpty();
        }
        Assert.Equal(0, GC.GetAllocatedBytesForCurrentThread() - bytes);
        Assert.True(correct);
        Assert.Equal(retained, library.nTotalMemUsage());
        independent.bIsEqual(source); // Prime only the existing active-bounds cache.
        retained = library.nTotalMemUsage();
        for (var i = 0; i < 10; i++) Assert.True(independent.bIsEqual(source));
        Assert.Equal(retained, library.nTotalMemUsage());
    }
}
