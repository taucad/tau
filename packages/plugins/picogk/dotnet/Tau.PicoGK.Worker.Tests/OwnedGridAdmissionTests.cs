using System.Numerics;
using PicoGK;
using Xunit;

namespace Tau.PicoGK.Worker.Tests;

public sealed partial class WorkerTests
{
    [Fact]
    public void OwnedVdbAliasesShareOneGenerationAndInvalidateTogether()
    {
        using var library = new Library(.4f);
        using var source = Voxels.voxSphere(library, Vector3.Zero, 2f);
        using var original = source.TauAcquireGeometry();
        using var file = new OpenVdbFile(library);
        Assert.Equal(0, file.nAdd(source, "Source"));
        using var first = file.voxGet("Source");
        using var second = file.voxGet(0);
        using var old = first.TauAcquireGeometry();
        using var same = second.TauAcquireGeometry();
        Assert.Equal(old.Generation, same.Generation);
        using var scalar = file.oGetScalarField(0);
        scalar.SetValue(Vector3.Zero, 3f);
        using var changed = first.TauAcquireGeometry();
        using var alsoChanged = second.TauAcquireGeometry();
        Assert.NotEqual(old.Generation, changed.Generation);
        Assert.Equal(changed.Generation, alsoChanged.Generation);
        file.Dispose();
        using var retained = first.TauAcquireGeometry();
        Assert.Equal(changed.Generation, retained.Generation);
        using var unchanged = source.TauAcquireGeometry();
        Assert.Equal(original.Generation, unchanged.Generation);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(1)]
    [InlineData(2)]
    public void MutatingCsgRejectsInvalidOwnersBeforeChangingEitherGrid(int operation)
    {
        using var library = new Library(1f);
        using var other = new Library(1f);
        using var target = Voxels.voxSphere(library, Vector3.Zero, 2f);
        using var foreign = new Voxels(other);
        using var disposed = new Voxels(library);
        disposed.Dispose();
        var before = ScalarRecords(target);
        void Mutate(Voxels left, Voxels right)
        {
            if (operation == 0) left.BoolAdd(voxOperand: right);
            else if (operation == 1) left.BoolSubtract(right);
            else left.BoolIntersect(voxOperand: right);
        }
        Assert.Throws<ArgumentNullException>(() => Mutate(target, null!));
        Assert.Throws<PicoGKLibraryMismatchException>(() => Mutate(target, foreign));
        Assert.Throws<ObjectDisposedException>(() => Mutate(target, disposed));
        Assert.Throws<ObjectDisposedException>(() => Mutate(disposed, target));
        Assert.Equal(before, ScalarRecords(target));
        Assert.True(foreign.bIsEmpty());
    }

    [Fact]
    public void VdbFieldAdmissionRejectsForeignDisposedAndNegativeInputs()
    {
        using var library = new Library(1f);
        using var other = new Library(1f);
        using var file = new OpenVdbFile(library);
        using var local = new ScalarField(library);
        using var foreign = new ScalarField(other);
        using var vector = new VectorField(other);
        Assert.Equal(0, file.nAdd(local, "Local"));
        Assert.Throws<PicoGKLibraryMismatchException>(() => file.nAdd(foreign));
        Assert.Throws<PicoGKLibraryMismatchException>(() => file.nAdd(vector));
        Assert.Equal(1, file.nFieldCount());
        Assert.Throws<ArgumentOutOfRangeException>(() => file.voxGet(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => file.oGetScalarField(-1));
        Assert.Throws<ArgumentOutOfRangeException>(() => file.strFieldName(-1));
        using var retained = file.oGetScalarField(0);
        file.Dispose();
        Assert.Throws<ObjectDisposedException>(() => file.oGetScalarField(0));
        retained.SetValue(Vector3.Zero, 2f);
        Assert.True(retained.bGetValue(Vector3.Zero, out var value));
        Assert.Equal(2f, value);
    }
}
